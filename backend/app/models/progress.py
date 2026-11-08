"""正式进度账本 · 采纳记录"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    JSON,
    Boolean,
)
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import UTCDateTime


class ProgressRecord(Base):
    __tablename__ = "progress_records"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, nullable=False, index=True)
    project_id = Column(Integer, nullable=False, index=True)
    node_id = Column(Integer, nullable=False, index=True)
    event_type = Column(String(64), nullable=False)
    source = Column(String(64), nullable=False)
    actor_user_id = Column(Integer, nullable=True)
    agent_definition_id = Column(Integer, nullable=True)
    evidence_package_id = Column(Integer, nullable=True)
    review_case_id = Column(Integer, nullable=True)
    before_json = Column(JSON, nullable=True)
    after_json = Column(JSON, nullable=False)
    reason = Column(Text, nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now())


class AdoptionRecord(Base):
    __tablename__ = "adoption_records"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, nullable=False, index=True)
    project_id = Column(Integer, nullable=False, index=True)
    node_id = Column(Integer, nullable=False, index=True)
    evidence_package_id = Column(Integer, nullable=False, index=True)
    progress_record_id = Column(Integer, nullable=True)
    decision = Column(String(32), nullable=False)  # adopted | rejected
    reason = Column(Text, nullable=True)
    in_wiki = Column(Boolean, default=False, nullable=False)
    created_at = Column(UTCDateTime(), server_default=func.now())
