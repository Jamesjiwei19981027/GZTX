"""License 验签：hmac（开发）与 ed25519（生产）"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings


def sign_license_dev(payload: str, secret: str) -> str:
    """HMAC-SHA256 hex（LICENSE_VERIFY_MODE=hmac）"""
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def _b64decode_key(raw: str) -> bytes:
    s = (raw or "").strip()
    # allow raw urlsafe without padding
    pad = "=" * (-len(s) % 4)
    try:
        return base64.urlsafe_b64decode(s + pad)
    except Exception:
        return base64.b64decode(s + pad)


def generate_ed25519_keypair() -> tuple[str, str]:
    """返回 (private_key_b64url, public_key_b64url) 裸 32 字节密钥的 urlsafe base64。"""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    priv = Ed25519PrivateKey.generate()
    priv_bytes = priv.private_bytes_raw()
    pub_bytes = priv.public_key().public_bytes_raw()
    return (
        base64.urlsafe_b64encode(priv_bytes).decode().rstrip("="),
        base64.urlsafe_b64encode(pub_bytes).decode().rstrip("="),
    )


def sign_license_ed25519(payload: str, private_key_b64: str) -> str:
    """Ed25519 签名，返回 urlsafe base64（无填充）。"""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    key = Ed25519PrivateKey.from_private_bytes(_b64decode_key(private_key_b64))
    sig = key.sign(payload.encode("utf-8"))
    return base64.urlsafe_b64encode(sig).decode().rstrip("=")


def verify_license_ed25519(payload: str, signature: str, public_key_b64: str) -> None:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    pub = Ed25519PublicKey.from_public_bytes(_b64decode_key(public_key_b64))
    try:
        pub.verify(_b64decode_key(signature), payload.encode("utf-8"))
    except (InvalidSignature, ValueError, TypeError) as e:
        raise ValueError("license 签名无效") from e


def verify_license_payload(payload: str, signature: str) -> dict[str, Any]:
    mode = (getattr(settings, "LICENSE_VERIFY_MODE", "hmac") or "hmac").lower()
    key = settings.LICENSE_PUBLIC_KEY or ""
    if not key:
        raise ValueError("LICENSE_PUBLIC_KEY 未配置")

    if mode == "hmac":
        expected = sign_license_dev(payload, key)
        if not hmac.compare_digest(expected, signature or ""):
            raise ValueError("license 签名无效")
    elif mode == "ed25519":
        verify_license_ed25519(payload, signature or "", key)
    else:
        raise ValueError(f"不支持的 LICENSE_VERIFY_MODE: {mode}")

    data = json.loads(payload)
    valid_to = data.get("valid_to")
    if valid_to:
        vt = datetime.fromisoformat(str(valid_to).replace("Z", "+00:00"))
        if vt.tzinfo is None:
            vt = vt.replace(tzinfo=timezone.utc)
        if vt < datetime.now(timezone.utc):
            raise ValueError("license 已过期")
    return data
