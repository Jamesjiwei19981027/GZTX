"""汇报策略与运行记录（P1 最小）"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.sql import func

from app.db.base import Base


class ReportPolicy(Base):
    __tablename__ = "report_policies"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False, default="项目进度摘要")
    trigger = Column(String(32), nullable=False, default="manual_confirm")  # manual_confirm|cron
    template_key = Column(String(64), nullable=False, default="progress_summary")
    config_json = Column(JSON, nullable=True)
    enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ReportRun(Base):
    __tablename__ = "report_runs"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, nullable=False, index=True)
    project_id = Column(Integer, nullable=False, index=True)
    policy_id = Column(Integer, ForeignKey("report_policies.id"), nullable=True)
    trigger = Column(String(32), nullable=False, default="manual_confirm")
    status = Column(String(32), nullable=False, default="completed")  # pending|completed|failed
    summary_text = Column(Text, nullable=True)
    payload_json = Column(JSON, nullable=True)
    actor_user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
