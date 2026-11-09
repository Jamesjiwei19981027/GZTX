"""OIDC 授权码流程：发现、令牌交换、JWKS 签名及声明校验。"""
import secrets
from urllib.parse import urlencode, urlparse

import jwt

from app.services.integration_http import request_json
from app.services.sso.base import SsoIdentity, SsoProvider

ALGORITHMS = {"RS256", "RS384", "RS512", "ES256", "ES384", "ES512"}


def _https_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise ValueError("身份服务地址必须是有效的安全连接地址")
    return value


class OIDCProvider(SsoProvider):
    provider = "oidc"

    def __init__(self, config: dict | None = None):
        self.config = config or {}
        self.issuer = _https_url(self.config.get("issuer") or "")
        if not self.config.get("client_id") or not self.config.get("client_secret"):
            raise ValueError("请先完整配置通用单点登录")

    async def _discovery(self):
        data = await request_json("GET", self.issuer.rstrip("/") + "/.well-known/openid-configuration")
        if data.get("issuer") != self.issuer:
            raise ValueError("身份服务发现文档的发行方不一致")
        for key in ("authorization_endpoint", "token_endpoint", "jwks_uri"):
            _https_url(data.get(key) or "")
        return data

    async def authorize_url(self, *, company_id: int, state: str, redirect_uri: str, nonce: str = "") -> str:
        discovery = await self._discovery()
        if not nonce:
            raise ValueError("缺少单点登录随机校验值")
        scopes = self.config.get("scopes") or "openid profile email phone"
        if not isinstance(scopes, str) or "openid" not in scopes.split():
            raise ValueError("通用单点登录授权范围必须包含身份认证")
        endpoint = discovery["authorization_endpoint"]
        return endpoint + ("&" if "?" in endpoint else "?") + urlencode({
            "client_id": self.config["client_id"], "response_type": "code", "scope": scopes,
            "redirect_uri": redirect_uri, "state": state, "nonce": nonce,
        })

    async def exchange_code(self, code: str, *, redirect_uri: str = "", nonce: str = "") -> SsoIdentity:
        discovery = await self._discovery()
        fields = {"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri}
        methods = discovery.get("token_endpoint_auth_methods_supported", ["client_secret_basic"])
        method = self.config.get("token_endpoint_auth_method")
        method = method or ("client_secret_basic" if "client_secret_basic" in methods else "client_secret_post")
        if method not in methods or method not in {"client_secret_basic", "client_secret_post"}:
            raise ValueError("身份服务未提供可用的客户端认证方式")
        kwargs = {}
        if method == "client_secret_basic":
            kwargs["auth"] = (self.config["client_id"], self.config["client_secret"])
        else:
            fields.update(client_id=self.config["client_id"], client_secret=self.config["client_secret"])
        tokens = await request_json("POST", discovery["token_endpoint"], data=fields, **kwargs)
        try:
            raw = tokens["id_token"]
            header = jwt.get_unverified_header(raw)
            alg = header.get("alg")
            if alg not in ALGORITHMS or alg not in discovery.get("id_token_signing_alg_values_supported", ["RS256"]):
                raise ValueError("不支持的身份令牌签名算法")
            jwks = await request_json("GET", discovery["jwks_uri"])
            keys = [key for key in jwks.get("keys", []) if isinstance(key, dict)
                    and (header.get("kid") is None or key.get("kid") == header["kid"])
                    and key.get("use", "sig") == "sig" and key.get("alg", alg) == alg
                    and "verify" in key.get("key_ops", ["verify"])]
            if len(keys) != 1:
                raise ValueError("找不到唯一的身份令牌验签公钥")
            key = jwt.PyJWK.from_dict(keys[0], algorithm=alg)
            claims = jwt.decode(raw, key.key, algorithms=[alg], issuer=self.issuer,
                                audience=self.config["client_id"], options={"require": ["iss", "aud", "exp", "iat", "sub", "nonce"]})
            if not nonce or not isinstance(claims["nonce"], str) or not secrets.compare_digest(claims["nonce"], nonce):
                raise ValueError("身份令牌随机校验失败")
            aud = claims["aud"]
            if ((isinstance(aud, list) and len(aud) > 1) or "azp" in claims) and claims.get("azp") != self.config["client_id"]:
                raise ValueError("身份令牌授权客户端不一致")
            if not isinstance(claims["sub"], str) or not claims["sub"]:
                raise ValueError("身份令牌缺少用户标识")
        except (jwt.PyJWTError, KeyError, TypeError, ValueError) as exc:
            raise ValueError("身份令牌校验失败，请重新发起单点登录") from exc
        # 未经发行方验证的联系方式不可作为首次绑定依据。
        return SsoIdentity(external_id=claims["sub"], provider=self.provider, issuer=self.issuer,
                           email=claims.get("email") if claims.get("email_verified") is True else None,
                           mobile=claims.get("phone_number") if claims.get("phone_number_verified") is True else None,
                           name=claims.get("name"))


def get_sso_provider(provider: str, config: dict | None = None) -> SsoProvider:
    if provider == "oidc":
        return OIDCProvider(config)
    if provider == "dingtalk":
        from app.services.sso.dingtalk import DingTalkProvider
        return DingTalkProvider(config)
    raise ValueError("该登录方式下一期支持")
