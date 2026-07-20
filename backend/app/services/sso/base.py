"""SSO 基类"""
from dataclasses import dataclass


@dataclass
class SsoIdentity:
    external_id: str
    email: str | None
    name: str | None
    provider: str


class SsoProvider:
    provider: str = "oidc"

    def authorize_url(self, *, company_id: int, state: str, redirect_uri: str) -> str:
        raise NotImplementedError

    async def exchange_code(self, code: str) -> SsoIdentity:
        raise NotImplementedError
