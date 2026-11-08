"""已撤销的 refresh token（按 jti 记录）。

refresh 轮换：每次 POST /auth/refresh 都撤销旧 jti 并签发新令牌；
logout 携带 refresh_token 时也写入一条（reason=logout，无宽限期）。
行的生命周期以 token 自身的 expires_at 为准，过期后由刷新路径顺手清理。
"""
from sqlalchemy import Column, DateTime, Integer, String

from app.db.base import Base
from app.db.types import UTCDateTime


class RevokedRefreshToken(Base):
    __tablename__ = "revoked_refresh_tokens"

    id = Column(Integer, primary_key=True)
    jti = Column(String(64), nullable=False, unique=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    # rotated：正常轮换产生，60 秒宽限期内允许旧 token 重放（多端/并发竞态保护）
    # logout：用户显式登出，立即失效，无宽限期
    reason = Column(String(16), nullable=False, default="rotated")
    revoked_at = Column(UTCDateTime(), nullable=False)
    expires_at = Column(UTCDateTime(), nullable=False, index=True)
