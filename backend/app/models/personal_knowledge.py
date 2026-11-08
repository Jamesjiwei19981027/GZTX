"""Owner-private, project-scoped Wiki. Imported deletions remain as tombstones."""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import UTCDateTime


class PersonalKnowledgeEntry(Base):
    __tablename__ = "personal_knowledge_entries"
    __table_args__ = (
        Index("ix_personal_knowledge_entries_scope", "company_id", "project_id", "owner_user_id", "is_deleted"),
        UniqueConstraint("company_id", "project_id", "owner_user_id", "source_type", "source_id", name="uq_personal_knowledge_source"),
    )

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(300), nullable=False)
    body_text = Column(Text, nullable=False, default="")
    tags_json = Column(JSON, nullable=False, default=list)
    position_json = Column(JSON, nullable=True)
    source_type = Column(String(32), nullable=False, default="manual")
    source_id = Column(Integer, nullable=True)
    source_ref_json = Column(JSON, nullable=False, default=dict)
    is_deleted = Column(Boolean, nullable=False, default=False, server_default="0")
    created_at = Column(UTCDateTime(), server_default=func.now())
    updated_at = Column(UTCDateTime(), server_default=func.now(), onupdate=func.now())


class PersonalKnowledgeLink(Base):
    __tablename__ = "personal_knowledge_links"
    __table_args__ = (Index("ix_personal_knowledge_links_scope", "company_id", "project_id", "owner_user_id"),)

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    source_entry_id = Column(Integer, ForeignKey("personal_knowledge_entries.id", ondelete="CASCADE"), nullable=False)
    target_entry_id = Column(Integer, ForeignKey("personal_knowledge_entries.id", ondelete="CASCADE"), nullable=False)
    label = Column(String(200), nullable=False, default="")
    created_at = Column(UTCDateTime(), server_default=func.now())
