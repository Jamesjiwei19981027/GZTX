"""智能体定义 · 会话（P1 最小）"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.sql import func

from app.db.base import Base


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
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AgentSession(Base):
    __tablename__ = "agent_sessions"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, nullable=False, index=True)
    project_id = Column(Integer, nullable=True, index=True)
    agent_definition_id = Column(Integer, ForeignKey("agent_definitions.id"), nullable=True)
    user_id = Column(Integer, nullable=False, index=True)
    channel = Column(String(32), nullable=False, default="web")
    title = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AgentMessage(Base):
    __tablename__ = "agent_messages"

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("agent_sessions.id"), nullable=False, index=True)
    role = Column(String(32), nullable=False)  # user | assistant | system
    content = Column(Text, nullable=False)
    meta_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
