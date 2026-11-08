"""轻遥测事件（自托管本地存储，不外发）"""
from sqlalchemy import Column, DateTime, Integer, JSON, String
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import UTCDateTime


class UsageEvent(Base):
    __tablename__ = "usage_events"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    name = Column(String(64), nullable=False, index=True)
    props = Column(JSON, nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now(), index=True)
