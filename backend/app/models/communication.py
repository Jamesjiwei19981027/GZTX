"""Persisted chat and call AI artifacts."""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.sql import func

from app.db.base import Base


class ConversationSummary(Base):
    __tablename__ = "conversation_summaries"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    scope_type = Column(String(16), nullable=False, index=True)  # channel|conversation|call
    scope_id = Column(Integer, nullable=False, index=True)
    requested_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    source_from_id = Column(Integer, nullable=True)
    source_to_id = Column(Integer, nullable=True)
    source_count = Column(Integer, nullable=False, default=0)
    summary_text = Column(Text, nullable=False, default="")
    key_points_json = Column(JSON, nullable=False, default=list)
    decisions_json = Column(JSON, nullable=False, default=list)
    action_items_json = Column(JSON, nullable=False, default=list)
    risks_json = Column(JSON, nullable=False, default=list)
    provider = Column(String(32), nullable=False, default="deterministic")
    status = Column(String(24), nullable=False, default="completed")
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CallSession(Base):
    __tablename__ = "call_sessions"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    conversation_id = Column(Integer, ForeignKey("direct_conversations.id"), nullable=False, index=True)
    initiated_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    call_type = Column(String(16), nullable=False, default="audio")
    status = Column(String(16), nullable=False, default="active")
    participants_json = Column(JSON, nullable=False, default=list)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)


class CallRecording(Base):
    __tablename__ = "call_recordings"

    id = Column(Integer, primary_key=True)
    call_session_id = Column(Integer, ForeignKey("call_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    storage_key = Column(String(500), nullable=False, unique=True)
    original_name = Column(String(255), nullable=False)
    mime_type = Column(String(255), nullable=False, default="audio/wav")
    size_bytes = Column(Integer, nullable=False, default=0)
    sha256 = Column(String(64), nullable=False, index=True)
    transcription_status = Column(String(24), nullable=False, default="pending")
    transcription_provider = Column(String(32), nullable=True)
    transcript_text = Column(Text, nullable=True)
    transcription_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
