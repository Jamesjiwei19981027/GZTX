"""汇报策略与运行记录（P1 最小）"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    JSON,
    Boolean,
    UniqueConstraint,
    Index,
)
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import UTCDateTime


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
    created_at = Column(UTCDateTime(), server_default=func.now())


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
    created_at = Column(UTCDateTime(), server_default=func.now())


class ProjectAgentBinding(Base):
    """A project-scoped agent binding derived from the human responsibility axis.

    ``user_id`` is nullable only for the project-level agent.  Reporting
    relationships are never stored here: they are resolved from TreeNode.parent_id
    and NodeAssignment so the people axis remains authoritative.
    """

    __tablename__ = "project_agent_bindings"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_agent_binding_user"),
        Index("ix_project_agent_bindings_project_active", "project_id", "is_active"),
    )

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    agent_definition_id = Column(Integer, ForeignKey("agent_definitions.id"), nullable=False, index=True)
    role = Column(String(24), nullable=False, default="member")  # member|project
    is_active = Column(Boolean, nullable=False, default=True, server_default="1")
    created_at = Column(UTCDateTime(), server_default=func.now())
    updated_at = Column(UTCDateTime(), onupdate=func.now())


class AgentReport(Base):
    """A member-agent submission routed along the human responsibility axis."""

    __tablename__ = "agent_reports"
    __table_args__ = (
        Index("ix_agent_reports_project_status", "project_id", "status"),
        Index("ix_agent_reports_parent_user", "parent_user_id", "status"),
    )

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    binding_id = Column(Integer, ForeignKey("project_agent_bindings.id"), nullable=False, index=True)
    author_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    parent_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    parent_report_id = Column(Integer, ForeignKey("agent_reports.id"), nullable=True, index=True)
    status = Column(String(24), nullable=False, default="submitted")  # draft|submitted|aggregated
    summary_text = Column(Text, nullable=False)
    payload_json = Column(JSON, nullable=False, default=dict)
    submitted_at = Column(UTCDateTime(), server_default=func.now())
    created_at = Column(UTCDateTime(), server_default=func.now())
    read_at = Column(UTCDateTime(), nullable=True)


class AgentReportSource(Base):
    """Traceable source reference attached to an agent report."""

    __tablename__ = "agent_report_sources"
    id = Column(Integer, primary_key=True)
    report_id = Column(Integer, ForeignKey("agent_reports.id", ondelete="CASCADE"), nullable=False, index=True)
    source_type = Column(String(32), nullable=False)
    source_id = Column(Integer, nullable=True)
    excerpt = Column(Text, nullable=True)
    metadata_json = Column(JSON, nullable=False, default=dict)
    created_at = Column(UTCDateTime(), server_default=func.now())


class ProjectReportEnvelope(Base):
    """Project-level report sent upward to a company/leader agent."""

    __tablename__ = "project_report_envelopes"
    __table_args__ = (Index("ix_project_report_envelopes_project_created", "project_id", "created_at"),)

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    project_binding_id = Column(Integer, ForeignKey("project_agent_bindings.id"), nullable=False)
    status = Column(String(24), nullable=False, default="submitted")
    summary_text = Column(Text, nullable=False)
    payload_json = Column(JSON, nullable=False, default=dict)
    created_at = Column(UTCDateTime(), server_default=func.now())


class LeadershipReportEnvelope(Base):
    """Company-level package containing project report envelopes.

    It is intentionally a package of project summaries. Raw project files and
    cross-project agent memory never enter this record unless explicitly
    included by a future audited export.
    """

    __tablename__ = "leadership_report_envelopes"
    __table_args__ = (
        Index("ix_leadership_report_envelopes_company_created", "company_id", "created_at"),
    )

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    leader_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(24), nullable=False, default="submitted")
    summary_text = Column(Text, nullable=False)
    payload_json = Column(JSON, nullable=False, default=dict)
    created_at = Column(UTCDateTime(), server_default=func.now())
