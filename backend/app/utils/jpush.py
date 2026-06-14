"""JPush (极光推送) utility."""

import json
from typing import Optional, List

import requests

from app.core.config import settings


class JPushClient:
    """JPush API client."""

    BASE_URL = "https://api.jpush.cn/v3/push"

    def __init__(self, app_key: Optional[str] = None, master_secret: Optional[str] = None):
        self.app_key = app_key or settings.JPUSH_APP_KEY
        self.master_secret = master_secret or settings.JPUSH_MASTER_SECRET

    def _get_auth(self) -> tuple[str, str]:
        """Get HTTP Basic Auth credentials."""
        return (self.app_key, self.master_secret)

    def send_to_alias(
        self,
        alias: str,
        title: str,
        content: str,
        extras: Optional[dict] = None
    ) -> bool:
        """Send push notification to a specific alias (user).

        Args:
            alias: User alias (usually user_id)
            title: Notification title
            content: Notification content
            extras: Extra data

        Returns:
            True if sent successfully
        """
        if not self.app_key or not self.master_secret:
            print("[JPUSH] Not configured, skipping")
            return False

        payload = {
            "platform": ["android", "ios"],
            "audience": {
                "alias": [str(alias)]
            },
            "notification": {
                "android": {
                    "title": title,
                    "alert": content,
                    "extras": extras or {}
                },
                "ios": {
                    "alert": {
                        "title": title,
                        "body": content
                    },
                    "extras": extras or {}
                }
            },
            "options": {
                "apns_production": False  # Set True for production
            }
        }

        try:
            resp = requests.post(
                self.BASE_URL,
                json=payload,
                auth=self._get_auth(),
                timeout=10
            )
            result = resp.json()
            if result.get("sendno"):
                print(f"[JPUSH] Sent to alias {alias}")
                return True
            else:
                print(f"[JPUSH] Failed: {result}")
                return False
        except Exception as e:
            print(f"[JPUSH] Error: {e}")
            return False

    def send_to_all(self, title: str, content: str, extras: Optional[dict] = None) -> bool:
        """Broadcast to all users."""
        if not self.app_key or not self.master_secret:
            return False

        payload = {
            "platform": "all",
            "audience": "all",
            "notification": {
                "alert": content
            }
        }

        try:
            resp = requests.post(
                self.BASE_URL,
                json=payload,
                auth=self._get_auth(),
                timeout=10
            )
            return resp.status_code == 200
        except Exception as e:
            print(f"[JPUSH] Error: {e}")
            return False


def send_push(alias: str, title: str, content: str) -> bool:
    """Convenience function to send push."""
    client = JPushClient()
    return client.send_to_alias(alias, title, content)
