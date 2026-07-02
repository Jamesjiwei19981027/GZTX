"""Web Push notification utility."""

import json
import os
from typing import Optional

from app.core.config import settings

# File-based persistent store for user subscriptions
_SUBSCRIPTIONS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "push_subscriptions.json")
_subscriptions: dict[int, list[dict]] = {}


def _load_subscriptions():
    """Load subscriptions from disk."""
    global _subscriptions
    try:
        if os.path.exists(_SUBSCRIPTIONS_FILE):
            with open(_SUBSCRIPTIONS_FILE, "r", encoding="utf-8") as f:
                raw = json.load(f)
                # JSON keys are strings, convert back to int
                _subscriptions = {int(k): v for k, v in raw.items()}
            print(f"[WEB_PUSH] Loaded {sum(len(v) for v in _subscriptions.values())} subscriptions from disk")
    except Exception as e:
        print(f"[WEB_PUSH] Failed to load subscriptions: {e}")
        _subscriptions = {}


def _save_subscriptions():
    """Persist subscriptions to disk."""
    try:
        os.makedirs(os.path.dirname(_SUBSCRIPTIONS_FILE), exist_ok=True)
        with open(_SUBSCRIPTIONS_FILE, "w", encoding="utf-8") as f:
            json.dump({str(k): v for k, v in _subscriptions.items()}, f, ensure_ascii=False)
    except Exception as e:
        print(f"[WEB_PUSH] Failed to save subscriptions: {e}")


# Load on module import (app startup)
_load_subscriptions()


def save_subscription(user_id: int, subscription: dict) -> bool:
    """Save user's Web Push subscription.

    Replaces ALL existing subscriptions for this user with the new one.
    Each user should only have one active subscription at a time.

    Args:
        user_id: User ID
        subscription: Push subscription object from browser

    Returns:
        True if saved successfully
    """
    # Replace all subscriptions — keep only the most recent one
    _subscriptions[user_id] = [subscription]
    _save_subscriptions()
    print(f"[WEB_PUSH] Subscription saved for user {user_id} (persisted to disk)")
    return True


def remove_subscription(user_id: int, endpoint: str) -> bool:
    """Remove a subscription by endpoint."""
    if user_id not in _subscriptions:
        return False

    _subscriptions[user_id] = [
        sub for sub in _subscriptions[user_id]
        if sub.get("endpoint") != endpoint
    ]
    # Clean up empty entries
    if not _subscriptions[user_id]:
        del _subscriptions[user_id]
    _save_subscriptions()
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
            "badge": "/favicon.ico"
        })

        success = False
        for sub in subscriptions:
            try:
                # Debug: print subscription details
                ep = sub.get('endpoint', 'N/A')
                keys = sub.get('keys', {})
                print(f"[WEB_PUSH] Endpoint: {ep[:100]}")
                print(f"[WEB_PUSH] p256dh len: {len(keys.get('p256dh',''))}, auth len: {len(keys.get('auth',''))}")
                print(f"[WEB_PUSH] Full sub keys: {json.dumps({k: v[:20]+'...' if isinstance(v,str) and len(v)>20 else v for k,v in sub.items()})}")

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
                print(f"[WEB_PUSH] Sent OK to user {user_id}, status: {status}")
            except WebPushException as e:
                print(f"[WEB_PUSH] Failed: {e}")
                if e.response is not None:
                    print(f"[WEB_PUSH] Status: {e.response.status_code}")
                    print(f"[WEB_PUSH] Resp headers: {dict(e.response.headers)}")
                    body = e.response.text[:500] if e.response.text else 'empty'
                    print(f"[WEB_PUSH] Resp body: {body}")
                if e.response and e.response.status_code in (400, 404, 410):
                    remove_subscription(user_id, sub.get("endpoint", ""))

        return success

    except ImportError:
        print("[WEB_PUSH] pywebpush not installed, run: pip install pywebpush")
        return False
    except Exception as e:
        import traceback
        print(f"[WEB_PUSH] Error: {type(e).__name__}: {e}")
        traceback.print_exc()
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
