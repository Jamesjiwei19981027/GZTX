"""钉钉企业内部应用新版 OAuth2。"""
from urllib.parse import urlencode
from app.services.integration_http import request_json
from app.services.sso.base import SsoIdentity, SsoProvider


class DingTalkProvider(SsoProvider):
    provider = "dingtalk"

    def __init__(self, config: dict | None = None):
        self.config = config or {}
        if not all(self.config.get(k) for k in ("app_key", "app_secret", "corp_id")):
            raise ValueError("请先完整配置钉钉企业应用")

    async def authorize_url(self, *, company_id: int, state: str, redirect_uri: str, nonce: str = "") -> str:
        return "https://login.dingtalk.com/oauth2/auth?" + urlencode({
            "client_id": self.config["app_key"], "response_type": "code", "scope": "openid",
            "prompt": "consent", "redirect_uri": redirect_uri, "state": state, "corpId": self.config["corp_id"],
        })

    async def exchange_code(self, code: str, *, redirect_uri: str = "", nonce: str = "") -> SsoIdentity:
        token = await request_json("POST", "https://api.dingtalk.com/v1.0/oauth2/userAccessToken", json={
            "clientId": self.config["app_key"], "clientSecret": self.config["app_secret"],
            "code": code, "grantType": "authorization_code",
        })
        access = token.get("accessToken")
        if not access:
            raise ValueError("钉钉授权码换取令牌失败")
        user = await request_json("GET", "https://api.dingtalk.com/v1.0/contact/users/me",
                                  headers={"x-acs-dingtalk-access-token": access})
        if not isinstance(user.get("unionId"), str) or not user["unionId"]:
            raise ValueError("钉钉未返回用户唯一身份")
        return SsoIdentity(external_id=user["unionId"], email=user.get("email"), mobile=user.get("mobile"),
                           name=user.get("nick"), provider=self.provider, issuer=self.config["corp_id"])
