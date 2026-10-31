"""Explicit shared-page summary grants and owner-private cited summary drafts."""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.db.base import Base


class ProjectKnowledgeGrant(Base):
    __tablename__ = "project_knowledge_grants"
    __table_args__ = (UniqueConstraint("company_id", "project_id", "user_id", name="uq_project_knowledge_grant_user"),)

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    can_summarize = Column(Boolean, nullable=False, default=False, server_default="0")
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ProjectKnowledgeSummary(Base):
    __tablename__ = "project_knowledge_summaries"
    __table_args__ = (Index("ix_project_knowledge_summary_owner", "company_id", "project_id", "owner_user_id"),)

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(300), nullable=False)
    body_text = Column(Text, nullable=False)
    page_ids_json = Column(JSON, nullable=False, default=list)
    sources_json = Column(JSON, nullable=False, default=list)
    source_fingerprints_json = Column(JSON, nullable=False, default=dict)
    status = Column(String(16), nullable=False, default="draft")
    provider = Column(String(64), nullable=False)
    model_source = Column(String(32), nullable=False)
    personal_entry_id = Column(Integer, ForeignKey("personal_knowledge_entries.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
