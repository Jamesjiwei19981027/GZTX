"""智能体定义 · 会话（P1 最小）"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import UTCDateTime


class AgentDefinition(Base):
    __tablename__ = "agent_definitions"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, nullable=False, index=True)
    owner_user_id = Column(Integer, nullable=True, index=True)
    kind = Column(String(32), nullable=False, default="user_created")
    name = Column(String(200), nullable=False)
    scene = Column(String(64), nullable=False, default="general")
    config_json = Column(JSON, nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)
    created_at = Column(UTCDateTime(), server_default=func.now())


class AgentSession(Base):
    __tablename__ = "agent_sessions"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, nullable=False, index=True)
    project_id = Column(Integer, nullable=True, index=True)
    agent_definition_id = Column(Integer, ForeignKey("agent_definitions.id"), nullable=True)
    user_id = Column(Integer, nullable=False, index=True)
    channel = Column(String(32), nullable=False, default="web")
    title = Column(String(200), nullable=True)
    # 滚动摘要：超过 AGENT_SUMMARY_THRESHOLD 条未摘要消息时由 LLM 生成/更新
    summary_text = Column(Text, nullable=True)
    # 摘要已覆盖到的消息 id（该 id 及之前的消息不再重复进上下文）
    summary_upto_message_id = Column(Integer, nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now())


class AgentMessage(Base):
    __tablename__ = "agent_messages"

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("agent_sessions.id"), nullable=False, index=True)
    role = Column(String(32), nullable=False)  # user | assistant | system
    content = Column(Text, nullable=False)
    meta_json = Column(JSON, nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now())
