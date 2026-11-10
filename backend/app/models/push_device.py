"""账号的系统推送设备（与浏览器 WebPush 订阅分开）。"""
from sqlalchemy import CheckConstraint, Column, ForeignKey, Integer, String
from sqlalchemy.sql import func
from app.db.base import Base
from app.db.types import UTCDateTime


class PushDevice(Base):
    __tablename__ = "push_devices"
    __table_args__ = (CheckConstraint("platform IN ('android', 'ios')", name="ck_push_devices_platform"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    platform = Column(String(16), nullable=False)
    registration_id = Column(String(255), nullable=False, unique=True)
    app_version = Column(String(64), nullable=True)
    created_at = Column(UTCDateTime(), nullable=False, server_default=func.now())
    last_seen_at = Column(UTCDateTime(), nullable=False, server_default=func.now())
    disabled_at = Column(UTCDateTime(), nullable=True)
