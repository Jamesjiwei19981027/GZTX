"""证据材料包 · 文件 · 异步任务"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    JSON,
)
from sqlalchemy.sql import func

from app.db.base import Base


class EvidencePackage(Base):
    __tablename__ = "evidence_packages"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, nullable=False, index=True)
    project_id = Column(Integer, nullable=False, index=True)
    node_id = Column(Integer, nullable=False, index=True)
    submitter_user_id = Column(Integer, nullable=False, index=True)
    status = Column(String(32), nullable=False, default="draft")
    summary_text = Column(Text, nullable=True)
    structured_json = Column(JSON, nullable=True)
    links_json = Column(JSON, nullable=True)
    supersedes_package_id = Column(
        Integer, ForeignKey("evidence_packages.id"), nullable=True
    )
    precheck_errors_json = Column(JSON, nullable=True)
    judge_result_json = Column(JSON, nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    judged_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class EvidenceFile(Base):
    __tablename__ = "evidence_files"

    id = Column(Integer, primary_key=True)
    package_id = Column(Integer, ForeignKey("evidence_packages.id"), nullable=True, index=True)
    company_id = Column(Integer, nullable=True, index=True)
    project_id = Column(Integer, nullable=True, index=True)
    uploader_user_id = Column(Integer, nullable=True, index=True)
    storage_key = Column(String(500), nullable=False)
    original_name = Column(String(300), nullable=False)
    mime_type = Column(String(128), nullable=True)
    size_bytes = Column(Integer, nullable=False, default=0)
    sha256 = Column(String(64), nullable=True)
    kind = Column(String(32), nullable=False, default="file")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AsyncJob(Base):
    __tablename__ = "async_jobs"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, nullable=False, index=True)
    job_type = Column(String(64), nullable=False)
    status = Column(String(32), nullable=False, default="pending")
    payload_json = Column(JSON, nullable=True)
    result_json = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
