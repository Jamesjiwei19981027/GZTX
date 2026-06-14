from typing import Optional, Dict, Any
import httpx
from app.core.config import settings


class WXService:
    """Service for WeChat mini program operations."""

    def __init__(self):
        self.app_id = settings.WX_APP_ID
        self.app_secret = settings.WX_APP_SECRET
        self.auth_url = "https://api.weixin.qq.com/sns/jscode2session"
        self.send_msg_url = "https://api.weixin.qq.com/cgi-bin/message/subscribe/send"

    async def code2session(self, code: str) -> Optional[Dict[str, Any]]:
        """Exchange WeChat code for session (openid, unionid).

        Args:
            code: WeChat login code from wx.login()

        Returns:
            Dict containing openid, session_key, unionid (if available)
        """
        if not self.app_id or not self.app_secret:
            return None

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    self.auth_url,
                    params={
                        "appid": self.app_id,
                        "secret": self.app_secret,
                        "js_code": code,
                        "grant_type": "authorization_code"
                    },
                    timeout=10.0
                )

                if response.status_code == 200:
                    data = response.json()
                    if "openid" in data:
                        return {
                            "openid": data["openid"],
                            "session_key": data.get("session_key"),
                            "unionid": data.get("unionid")
                        }
                return None
        except Exception:
            return None

    async def send_subscribe_message(
        self,
        openid: str,
        template_id: str,
        page: Optional[str] = None,
        data: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Send WeChat subscribe message.

        Args:
            openid: User's openid
            template_id: Template ID from WeChat
            page: Optional page path
            data: Template data

        Returns:
            True if successful, False otherwise
        """
        if not self.app_id or not self.app_secret:
            return False

        try:
            # Get access token first (simplified - should cache this)
            access_token = await self._get_access_token()
            if not access_token:
                return False

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.send_msg_url}?access_token={access_token}",
                    json={
                        "touser": openid,
                        "template_id": template_id,
                        "page": page,
                        "data": data or {}
                    },
                    timeout=10.0
                )

                if response.status_code == 200:
                    result = response.json()
                    return result.get("errcode") == 0
                return False
        except Exception:
            return False

    async def _get_access_token(self) -> Optional[str]:
        """Get WeChat access token."""
        if not self.app_id or not self.app_secret:
            return None

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://api.weixin.qq.com/cgi-bin/token",
                    params={
                        "appid": self.app_id,
                        "secret": self.app_secret,
                        "grant_type": "client_credential"
                    },
                    timeout=10.0
                )

                if response.status_code == 200:
                    data = response.json()
                    return data.get("access_token")
                return None
        except Exception:
            return None