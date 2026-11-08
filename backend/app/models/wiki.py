"""项目 Wiki 条目"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    JSON,
)
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import UTCDateTime


class ProjectWikiEntry(Base):
    __tablename__ = "project_wiki_entries"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, nullable=False, index=True)
    project_id = Column(Integer, nullable=False, index=True)
    node_id = Column(Integer, nullable=True, index=True)
    title = Column(String(300), nullable=False)
    body_text = Column(Text, nullable=True)
    source = Column(String(64), nullable=False, default="manual")
    evidence_package_id = Column(Integer, nullable=True)
    meta_json = Column(JSON, nullable=True)
    created_by = Column(Integer, nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now())
    updated_at = Column(UTCDateTime(), onupdate=func.now())
