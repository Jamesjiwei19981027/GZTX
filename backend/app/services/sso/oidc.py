"""OIDC / FakeOIDC 桩（真实 IdP 为后续；生产禁止任意 code 冒充）

配置来源（优先级）：
1. 调用方传入 config（可从 IntegrationAccount.config_json + credentials 合并）
2. 默认占位 URL（仅开发）
"""
from app.core.config import settings
from app.services.sso.base import SsoIdentity, SsoProvider


class FakeOIDC(SsoProvider):
    provider = "oidc"

    def __init__(self, config: dict | None = None):
        self.config = config or {}

    def authorize_url(self, *, company_id: int, state: str, redirect_uri: str) -> str:
        base = (
            self.config.get("authorize_url")
            or self.config.get("authorization_endpoint")
            or "https://sso.example.local/authorize"
        )
        client_id = self.config.get("client_id") or "worktodo"
        redir = self.config.get("redirect_uri") or redirect_uri
        return (
            f"{base}?client_id={client_id}&state={state}"
            f"&redirect_uri={redir}&company_id={company_id}"
        )

    async def exchange_code(self, code: str) -> SsoIdentity:
        # 这是开发桩：任何人给出 fake:{id}:{email} 就能拿到该邮箱身份，
        # 再由 sso.py 换成完整 access_token。因此必须 DEBUG 与 ALLOW_FAKE_SSO
        # **同时**为真才启用——旧写法是 `not DEBUG and not ALLOW_FAKE_SSO`，
        # 而 ALLOW_FAKE_SSO 当时默认 true，等于生产默认敞开。
        if not (settings.DEBUG and settings.ALLOW_FAKE_SSO):
            raise ValueError("sso_stub_disabled")

        if not code.startswith("fake:"):
            # 桩已启用，但未知 code 也不自动信任为任意身份
            raise ValueError("invalid_sso_code")

        parts = code.split(":", 2)
        ext = parts[1] if len(parts) > 1 else "u1"
        email = parts[2] if len(parts) > 2 else f"{ext}@example.com"
        return SsoIdentity(
            external_id=ext, email=email, name=ext, provider=self.provider
        )


def get_sso_provider(provider: str, config: dict | None = None) -> SsoProvider:
    if provider in ("oidc", "wecom", "dingtalk", "feishu"):
        # P1: 形状统一走 FakeOIDC；真实 IdP 配置后续注入
        p = FakeOIDC(config)
        p.provider = provider
        return p
    raise ValueError(f"unknown sso provider: {provider}")
