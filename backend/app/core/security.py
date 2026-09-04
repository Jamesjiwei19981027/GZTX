"""
安全模块 - JWT Token 生成与验证、密码哈希
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt as pyjwt

from app.core.config import settings


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8") if isinstance(hashed_password, str) else hashed_password,
    )


def get_password_hash(password: str) -> str:
    """生成密码哈希"""
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt(),
    ).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建 Access Token"""
    to_encode = data.copy()
    # PyJWT 要求 sub 必须是字符串
    if "sub" in to_encode and not isinstance(to_encode["sub"], str):
        to_encode["sub"] = str(to_encode["sub"])
    now = datetime.now(timezone.utc)
    expire = now + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({
        "exp": expire,
        # iat 是「强制下线」的判定依据：早于 users.sessions_revoked_at 的令牌一律失效。
        # 缺它就只能靠枚举 jti 撤销，access token 根本没有 jti。
        "iat": now,
        "type": "access",
    })
    return pyjwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:
    """创建 Refresh Token"""
    to_encode = data.copy()
    # PyJWT 要求 sub 必须是字符串
    if "sub" in to_encode and not isinstance(to_encode["sub"], str):
        to_encode["sub"] = str(to_encode["sub"])
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({
        "exp": expire,
        "iat": now,
        "type": "refresh",
        # 唯一标识：支持轮换时按 jti 撤销旧 token（见 /auth/refresh）
        "jti": uuid.uuid4().hex,
    })
    return pyjwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """解码 Token，返回 payload 或 None"""
    try:
        payload = pyjwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_sub": False},  # 不强制验证 sub 类型
        )
        return payload
    except pyjwt.InvalidTokenError:
        return None


def token_revoked_for_user(payload: dict, revoked_at: Optional[datetime]) -> bool:
    """签发时间早于 revoked_at 的令牌视为已撤销。

    没有 iat 的存量令牌一律按撤销处理：删号/强制下线的语义要 fail-closed，
    否则老客户端手里那批无 iat 的 token 会绕过整个撤销机制。
    """
    if revoked_at is None:
        return False
    issued_at = payload.get("iat")
    if issued_at is None:
        return True
    try:
        issued = datetime.fromtimestamp(int(issued_at), tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return True
    if revoked_at.tzinfo is None:
        revoked_at = revoked_at.replace(tzinfo=timezone.utc)
    # iat 只精确到秒。删号/强制下线必须把同一秒内已发出的令牌一并作废
    # （否则刚签发的 access/refresh 还能再用将近一秒）。新令牌应在水位线之后签发。
    return issued <= revoked_at.replace(microsecond=0)


# Alias for backward compatibility
verify_token = decode_token
