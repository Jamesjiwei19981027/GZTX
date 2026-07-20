"""集成凭证加密（Fernet；禁止弱默认密钥）"""
import base64
import hashlib

from app.core.config import settings

_WEAK = frozenset(
    {
        "",
        "dev",
        "change-this-to-a-strong-secret-key-in-production",
        "dev-secret-key-for-tests-only",
        "dev-secret-key-please-change-in-production",
    }
)


def _material() -> bytes:
    raw = (settings.INTEGRATION_SECRET_KEY or settings.SECRET_KEY or "").strip()
    if not raw or raw in _WEAK:
        if settings.DEBUG:
            # 开发可读；仍避免字面量 "dev"
            raw = settings.SECRET_KEY or "debug-only-integration-key"
        else:
            raise RuntimeError(
                "INTEGRATION_SECRET_KEY 或 SECRET_KEY 未配置为强密钥，拒绝加密集成凭证"
            )
    return raw.encode()


def _fernet():
    from cryptography.fernet import Fernet

    key = base64.urlsafe_b64encode(hashlib.sha256(_material()).digest())
    return Fernet(key)


def encrypt_str(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_str(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()
