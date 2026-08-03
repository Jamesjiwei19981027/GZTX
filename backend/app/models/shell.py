"""Remix 壳层：团队频道消息（非智能体对话）"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
)
from sqlalchemy.sql import func

from app.db.base import Base


class TeamChannel(Base):
    __tablename__ = "team_channels"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    key = Column(String(32), nullable=False, default="general")  # general|project|direct
    name = Column(String(120), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TeamChannelMessage(Base):
    __tablename__ = "team_channel_messages"

    id = Column(Integer, primary_key=True)
    channel_id = Column(Integer, ForeignKey("team_channels.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    body = Column(Text, nullable=False)
    likes = Column(Integer, nullable=False, default=0)
    parent_id = Column(Integer, ForeignKey("team_channel_messages.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserPresence(Base):
    """简易在线状态：最近心跳时间"""

    __tablename__ = "user_presence"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    status = Column(String(16), nullable=False, default="offline")  # online|busy|offline
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
