"""不可变的 AI / 规则审计结果快照。"""
from sqlalchemy import Column, Integer, String, Text, JSON, ForeignKey, Index
from sqlalchemy.sql import func
from app.db.base import Base
from app.db.types import UTCDateTime


class AuditRun(Base):
    __tablename__ = 'audit_runs'
    __table_args__ = (Index('ix_audit_runs_project_created', 'project_id', 'id'),)

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey('companies.id'), nullable=False)
    project_id = Column(Integer, ForeignKey('projects.id'), nullable=False)
    initiator_user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    scope = Column(String(16), nullable=False)
    node_id = Column(Integer, nullable=True)
    custom_instruction = Column(Text, nullable=True)
    mode = Column(String(8), nullable=False)
    model_source = Column(String(16), nullable=True)
    overall_risk = Column(String(16), nullable=False)
    result_json = Column(JSON, nullable=False)
    created_at = Column(UTCDateTime(), server_default=func.now(), nullable=False)
