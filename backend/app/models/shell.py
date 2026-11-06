"""Remix 壳层：团队频道消息（非智能体对话）"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    JSON,
    Index,
    text,
)
from sqlalchemy.sql import func

from app.db.base import Base


class TeamChannel(Base):
    __tablename__ = "team_channels"
    __table_args__ = (
        Index(
            "uq_team_channels_company_project_key",
            "company_id",
            "project_id",
            "key",
            unique=True,
            postgresql_where=text("project_id IS NOT NULL"),
            sqlite_where=text("project_id IS NOT NULL"),
        ),
        Index(
            "uq_team_channels_company_null_project_key",
            "company_id",
            "key",
            unique=True,
            postgresql_where=text("project_id IS NULL"),
            sqlite_where=text("project_id IS NULL"),
        ),
    )

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
    liked_by = Column(JSON, nullable=False, default=list)
    parent_id = Column(Integer, ForeignKey("team_channel_messages.id"), nullable=True)
    message_type = Column(String(16), nullable=False, default="user")  # user|system
    attachments_json = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserPresence(Base):
    """简易在线状态：最近心跳时间"""

    __tablename__ = "user_presence"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    status = Column(String(16), nullable=False, default="offline")  # online|busy|offline
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DirectConversation(Base):
    """A real 1:1 or small-group conversation, separate from channel keys."""

    __tablename__ = "direct_conversations"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    kind = Column(String(16), nullable=False, default="direct")  # direct|group
    title = Column(String(120), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class DirectConversationMember(Base):
    __tablename__ = "direct_conversation_members"

    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("direct_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    last_read_at = Column(DateTime(timezone=True), nullable=True)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())


class DirectMessage(Base):
    __tablename__ = "direct_messages"

    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("direct_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    body = Column(Text, nullable=False)
    message_type = Column(String(16), nullable=False, default="user")
    attachments_json = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PinnedLink(Base):
    __tablename__ = "pinned_links"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    channel_id = Column(Integer, ForeignKey("team_channels.id", ondelete="CASCADE"), nullable=True, index=True)
    title = Column(String(200), nullable=False)
    url = Column(String(2000), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
