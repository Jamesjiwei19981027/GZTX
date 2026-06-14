"""Web Push notification utility."""

import json
from typing import Optional

from app.core.config import settings

# In-memory store for user subscriptions (use Redis in production)
_subscriptions: dict[int, list[dict]] = {}


def save_subscription(user_id: int, subscription: dict) -> bool:
    """Save user's Web Push subscription.

    Args:
        user_id: User ID
        subscription: Push subscription object from browser

    Returns:
        True if saved successfully
    """
    if user_id not in _subscriptions:
        _subscriptions[user_id] = []

    # Check if already exists
    for sub in _subscriptions[user_id]:
        if sub.get("endpoint") == subscription.get("endpoint"):
            sub.update(subscription)
            return True

    _subscriptions[user_id].append(subscription)
    print(f"[WEB_PUSH] Subscription saved for user {user_id}")
    return True


def remove_subscription(user_id: int, endpoint: str) -> bool:
    """Remove a subscription by endpoint."""
    if user_id not in _subscriptions:
        return False

    _subscriptions[user_id] = [
        sub for sub in _subscriptions[user_id]
        if sub.get("endpoint") != endpoint
    ]
    return True


def get_subscriptions(user_id: int) -> list[dict]:
    """Get all subscriptions for a user."""
    return _subscriptions.get(user_id, [])


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


def send_web_push(user, title: str, body: str, url: Optional[str] = None) -> bool:
    """Send Web Push notification to a user.

    Args:
        user: User object (needs id and optionally notify_pref for VAPID config)
        title: Notification title
        body: Notification body
        url: Click URL

    Returns:
        True if sent successfully to at least one subscription
    """
    private_key, _, vapid_subject = _get_vapid_keys(user)

    if not private_key:
        print("[WEB_PUSH] VAPID private key not configured, skipping")
        return False

    user_id = user.id if hasattr(user, 'id') else user
    subscriptions = get_subscriptions(user_id)
    if not subscriptions:
        print(f"[WEB_PUSH] No subscriptions for user {user_id}")
        return False

    try:
        from pywebpush import webpush, WebPushException

        payload = json.dumps({
            "title": title,
            "body": body,
            "url": url or "/",
            "icon": "/favicon.ico",
            "badge": "/favicon.ico"
        })

        success = False
        for sub in subscriptions:
            try:
                webpush(
                    subscription_info=sub,
                    data=payload,
                    vapid_private_key=private_key,
                    vapid_claims={
                        "sub": vapid_subject or "mailto:admin@example.com"
                    }
                )
                success = True
                print(f"[WEB_PUSH] Sent to user {user_id}")
            except WebPushException as e:
                print(f"[WEB_PUSH] Failed for subscription: {e}")
                if e.response and e.response.status_code in (404, 410):
                    remove_subscription(user_id, sub.get("endpoint", ""))

        return success

    except ImportError:
        print("[WEB_PUSH] pywebpush not installed, run: pip install pywebpush")
        return False
    except Exception as e:
        print(f"[WEB_PUSH] Error: {e}")
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
        print("Install py_vapid: pip install py-vapid")
        raise
