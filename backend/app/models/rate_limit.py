"""认证类接口的限流计数（固定窗口）。

落库而非放进程内存的原因：生产用 gunicorn -w 4 起 4 个 worker
（backend/Dockerfile.prod），进程内计数会被摊薄成 1/4，且重启即清零。
"""
from sqlalchemy import Column, DateTime, Integer, String

from app.db.base import Base


class RateLimitCounter(Base):
    """固定窗口计数器。

    bucket_key 形如 `login:ip:1.2.3.4:28166670`，末段是 floor(now/window)，
    因此换窗口自然换行，无需清理即可正确计数；过期行由 purge_expired 回收。
    """

    __tablename__ = "rate_limit_counters"

    id = Column(Integer, primary_key=True)
    bucket_key = Column(String(255), nullable=False, unique=True, index=True)
    count = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
