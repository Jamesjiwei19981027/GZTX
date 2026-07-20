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
        # 仅接受 fake:{external_id}:{email}；生产且非 DEBUG 时拒绝桩协议
        if not code.startswith("fake:"):
            if not settings.DEBUG:
                raise ValueError("sso_stub_disabled")
            # DEBUG: 未知 code 也不自动信任为任意身份
            raise ValueError("invalid_sso_code")

        if not settings.DEBUG and not settings.ALLOW_FAKE_SSO:
            raise ValueError("sso_stub_disabled")

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
