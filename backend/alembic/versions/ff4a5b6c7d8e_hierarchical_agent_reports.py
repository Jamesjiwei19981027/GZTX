"""Project-scoped agent reporting routed by the responsibility axis."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "ff4a5b6c7d8e"
# Merge the existing responsibility-permissions branch with the collaboration
# chain so Alembic has one production head.
down_revision: Union[str, tuple[str, str], None] = ("fe3f4a5b6c7d", "de22fa33bc00")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("project_agent_bindings"):
        op.create_table(
            "project_agent_bindings",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("agent_definition_id", sa.Integer(), sa.ForeignKey("agent_definitions.id"), nullable=False),
            sa.Column("role", sa.String(length=24), nullable=False, server_default="member"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
            sa.UniqueConstraint("project_id", "user_id", name="uq_project_agent_binding_user"),
        )
    op.create_index("ix_project_agent_bindings_company_id", "project_agent_bindings", ["company_id"], if_not_exists=True)
    op.create_index("ix_project_agent_bindings_project_id", "project_agent_bindings", ["project_id"], if_not_exists=True)
    op.create_index("ix_project_agent_bindings_user_id", "project_agent_bindings", ["user_id"], if_not_exists=True)
    op.create_index("ix_project_agent_bindings_agent_definition_id", "project_agent_bindings", ["agent_definition_id"], if_not_exists=True)
    op.create_index("ix_project_agent_bindings_project_active", "project_agent_bindings", ["project_id", "is_active"], if_not_exists=True)

    if not inspector.has_table("agent_reports"):
        op.create_table(
            "agent_reports",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("binding_id", sa.Integer(), sa.ForeignKey("project_agent_bindings.id"), nullable=False),
            sa.Column("author_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("parent_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("parent_report_id", sa.Integer(), sa.ForeignKey("agent_reports.id"), nullable=True),
            sa.Column("status", sa.String(length=24), nullable=False, server_default="submitted"),
            sa.Column("summary_text", sa.Text(), nullable=False),
            sa.Column("payload_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        )
    op.create_index("ix_agent_reports_company_id", "agent_reports", ["company_id"], if_not_exists=True)
    op.create_index("ix_agent_reports_project_id", "agent_reports", ["project_id"], if_not_exists=True)
    op.create_index("ix_agent_reports_binding_id", "agent_reports", ["binding_id"], if_not_exists=True)
    op.create_index("ix_agent_reports_author_user_id", "agent_reports", ["author_user_id"], if_not_exists=True)
    op.create_index("ix_agent_reports_parent_user_id", "agent_reports", ["parent_user_id"], if_not_exists=True)
    op.create_index("ix_agent_reports_parent_report_id", "agent_reports", ["parent_report_id"], if_not_exists=True)
    op.create_index("ix_agent_reports_project_status", "agent_reports", ["project_id", "status"], if_not_exists=True)

    if not inspector.has_table("agent_report_sources"):
        op.create_table(
            "agent_report_sources",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("report_id", sa.Integer(), sa.ForeignKey("agent_reports.id", ondelete="CASCADE"), nullable=False),
            sa.Column("source_type", sa.String(length=32), nullable=False),
            sa.Column("source_id", sa.Integer(), nullable=True),
            sa.Column("excerpt", sa.Text(), nullable=True),
            sa.Column("metadata_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    op.create_index("ix_agent_report_sources_report_id", "agent_report_sources", ["report_id"], if_not_exists=True)

    if not inspector.has_table("project_report_envelopes"):
        op.create_table(
            "project_report_envelopes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("project_binding_id", sa.Integer(), sa.ForeignKey("project_agent_bindings.id"), nullable=False),
            sa.Column("status", sa.String(length=24), nullable=False, server_default="submitted"),
            sa.Column("summary_text", sa.Text(), nullable=False),
            sa.Column("payload_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    op.create_index("ix_project_report_envelopes_company_id", "project_report_envelopes", ["company_id"], if_not_exists=True)
    op.create_index("ix_project_report_envelopes_project_id", "project_report_envelopes", ["project_id"], if_not_exists=True)
    op.create_index("ix_project_report_envelopes_project_created", "project_report_envelopes", ["project_id", "created_at"], if_not_exists=True)

    if not inspector.has_table("leadership_report_envelopes"):
        op.create_table(
            "leadership_report_envelopes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
            sa.Column("leader_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("status", sa.String(length=24), nullable=False, server_default="submitted"),
            sa.Column("summary_text", sa.Text(), nullable=False),
            sa.Column("payload_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    op.create_index("ix_leadership_report_envelopes_company_id", "leadership_report_envelopes", ["company_id"], if_not_exists=True)
    op.create_index("ix_leadership_report_envelopes_leader_user_id", "leadership_report_envelopes", ["leader_user_id"], if_not_exists=True)
    op.create_index("ix_leadership_report_envelopes_company_created", "leadership_report_envelopes", ["company_id", "created_at"], if_not_exists=True)


def downgrade() -> None:
    for index_name in (
        "ix_leadership_report_envelopes_company_created",
        "ix_leadership_report_envelopes_leader_user_id",
        "ix_leadership_report_envelopes_company_id",
    ):
        op.drop_index(index_name, table_name="leadership_report_envelopes")
    op.drop_table("leadership_report_envelopes")
    for index_name, table in (
        ("ix_project_report_envelopes_project_created", "project_report_envelopes"),
        ("ix_project_report_envelopes_project_id", "project_report_envelopes"),
        ("ix_project_report_envelopes_company_id", "project_report_envelopes"),
    ):
        op.drop_index(index_name, table_name=table)
    op.drop_table("project_report_envelopes")
    op.drop_index("ix_agent_report_sources_report_id", table_name="agent_report_sources")
    op.drop_table("agent_report_sources")
    for index_name in ("ix_agent_reports_project_status", "ix_agent_reports_parent_report_id", "ix_agent_reports_parent_user_id", "ix_agent_reports_author_user_id", "ix_agent_reports_binding_id", "ix_agent_reports_project_id", "ix_agent_reports_company_id"):
        op.drop_index(index_name, table_name="agent_reports")
    op.drop_table("agent_reports")
    for index_name in ("ix_project_agent_bindings_project_active", "ix_project_agent_bindings_agent_definition_id", "ix_project_agent_bindings_user_id", "ix_project_agent_bindings_project_id", "ix_project_agent_bindings_company_id"):
        op.drop_index(index_name, table_name="project_agent_bindings")
    op.drop_table("project_agent_bindings")
