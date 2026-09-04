"""Web Push notification utility.

订阅的唯一真源是 `push_subscriptions` 表。历史实现同时写
`data/push_subscriptions.json` 并**从该文件读取发送目标**，于是：
多 worker 各持一份进程内缓存互相看不到、订阅接口写库成功但文件写失败就静默丢、
容器重建后文件没挂卷则全员静音。这里统一改为读写 DB。
"""

import json
import logging
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


def _subscription_payload(row) -> dict:
    value = dict(row.subscription_json or {})
    value.setdefault("endpoint", row.endpoint)
    return value


def get_subscriptions(user_id: int) -> list[dict]:
    """Get all subscriptions for a user (DB is the single source of truth).

    同步实现：调用方是 APScheduler 里的同步提醒链路，以及 asyncio.to_thread
    包出去的发送路径。
    """
    from app.db.session import SyncSessionLocal
    from app.models.notify import PushSubscription

    try:
        with SyncSessionLocal() as session:
            rows = (
                session.query(PushSubscription)
                .filter(PushSubscription.user_id == user_id)
                .all()
            )
            return [_subscription_payload(row) for row in rows]
    except Exception:
        logger.exception("[WEB_PUSH] Failed to load subscriptions for user %s", user_id)
        return []


def remove_subscription(user_id: int, endpoint: str) -> bool:
    """Remove a subscription by endpoint (e.g. after a 410 Gone from the push service)."""
    from app.db.session import SyncSessionLocal
    from app.models.notify import PushSubscription

    if not endpoint:
        return False
    try:
        with SyncSessionLocal() as session:
            deleted = (
                session.query(PushSubscription)
                .filter(
                    PushSubscription.user_id == user_id,
                    PushSubscription.endpoint == endpoint,
                )
                .delete(synchronize_session=False)
            )
            session.commit()
            return bool(deleted)
    except Exception:
        logger.exception("[WEB_PUSH] Failed to remove subscription for user %s", user_id)
        return False


def _get_vapid_keys(user=None) -> tuple[Optional[str], Optional[str]]:
    """Get VAPID keys from user config first, then fallback to global settings."""
    private_key = None
    public_key = None
    vapid_subject = None

    # Try user-level config first
    if user and user.notify_pref:
        channels = user.notify_pref.get("channels", {})
        wp_config = channels.get("web_push", {})
        if wp_config:
            private_key = wp_config.get("vapid_private_key")
            public_key = wp_config.get("vapid_public_key")
            vapid_subject = wp_config.get("vapid_subject")

    # Fallback to global settings
    if not private_key:
        private_key = settings.VAPID_PRIVATE_KEY
    if not public_key:
        public_key = settings.VAPID_PUBLIC_KEY
    if not vapid_subject:
        vapid_subject = settings.VAPID_SUBJECT

    return private_key, public_key, vapid_subject


def send_web_push(user, title: str, body: str, url: Optional[str] = None, priority: int = 2) -> bool:
    """Send Web Push notification to a user.

    Args:
        user: User object (needs id and optionally notify_pref for VAPID config)
        title: Notification title
        body: Notification body
        url: Click URL
        priority: Task priority (0=urgent, 1=high, 2=medium, 3=low) for sound selection

    Returns:
        True if sent successfully to at least one subscription
    """
    private_key, _, vapid_subject = _get_vapid_keys(user)

    if not private_key:
        logger.warning("[WEB_PUSH] VAPID private key not configured, skipping")
        return False

    user_id = user.id if hasattr(user, 'id') else user
    subscriptions = get_subscriptions(user_id)
    if not subscriptions:
        logger.info("[WEB_PUSH] No subscriptions for user %s", user_id)
        return False

    try:
        from pywebpush import webpush, WebPushException
        from py_vapid import Vapid
        import base64

        # Create Vapid object from the base64url private key
        # from_raw expects base64url-encoded string, not raw bytes
        vv = Vapid.from_raw(private_key.encode('utf-8') if isinstance(private_key, str) else private_key)

        payload = json.dumps({
            "title": title,
            "body": body,
            "url": url or "/",
            "icon": "/favicon.ico",
            "badge": "/favicon.ico",
            "priority": priority
        })

        success = False
        for sub in subscriptions:
            try:
                ep = sub.get('endpoint', 'N/A')
                keys = sub.get('keys', {})
                logger.debug("[WEB_PUSH] Endpoint: %s", ep[:100])
                logger.debug(
                    "[WEB_PUSH] p256dh len: %s, auth len: %s",
                    len(keys.get('p256dh', '')),
                    len(keys.get('auth', '')),
                )
                logger.debug(
                    "[WEB_PUSH] Full sub keys: %s",
                    json.dumps({k: v[:20] + '...' if isinstance(v, str) and len(v) > 20 else v for k, v in sub.items()}),
                )

                resp = webpush(
                    subscription_info=sub,
                    data=payload,
                    vapid_private_key=vv,
                    vapid_claims={
                        "sub": vapid_subject or "mailto:admin@example.com"
                    },
                    ttl=86400,
                    verbose=True
                )
                success = True
                status = resp.status_code if hasattr(resp, 'status_code') else 'ok'
                logger.info("[WEB_PUSH] Sent OK to user %s, status: %s", user_id, status)
            except WebPushException as e:
                logger.error("[WEB_PUSH] Failed: %s", e)
                if e.response is not None:
                    logger.error("[WEB_PUSH] Status: %s", e.response.status_code)
                    logger.error("[WEB_PUSH] Resp headers: %s", dict(e.response.headers))
                    body = e.response.text[:500] if e.response.text else 'empty'
                    logger.error("[WEB_PUSH] Resp body: %s", body)
                if e.response and e.response.status_code in (400, 404, 410):
                    remove_subscription(user_id, sub.get("endpoint", ""))

        return success

    except ImportError:
        logger.error("[WEB_PUSH] pywebpush not installed, run: pip install pywebpush")
        return False
    except Exception:
        logger.exception("[WEB_PUSH] Error")
        return False


def generate_vapid_keys() -> tuple[str, str]:
    """Generate VAPID key pair.

    Returns:
        (public_key, private_key)
    """
    try:
        from py_vapid import Vapid
        vapid = Vapid()
        vapid.generate_keys()
        return vapid.public_key, vapid.private_key
    except ImportError:
        logger.error("Install py_vapid: pip install py-vapid")
        raise
