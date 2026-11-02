"""collab full schema: tenant/project/tree/evidence/progress/agent/bindings/notify/org/delegation/report

Revision ID: a1b2c3d4e5f6
Revises: 6858064f5e4b
Create Date: 2026-07-19

Production path: `alembic upgrade head` on empty or personal-only DB creates
all collab tables via SQLAlchemy metadata (checkfirst) and adds tasks compat columns.
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "a1b2c3d4e5f6"
down_revision = "6858064f5e4b"
branch_labels = None
depends_on = None

# Task personal↔collab compat columns (idempotent)
_TASK_COLUMNS = [
    ("origin", "VARCHAR(32) DEFAULT 'personal'"),
    ("company_id", "INTEGER"),
    ("project_id", "INTEGER"),
    ("project_node_id", "INTEGER"),
    ("linked_readonly", "BOOLEAN DEFAULT TRUE"),
]


def _add_task_compat_columns() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if "tasks" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("tasks")}
    for name, type_sql in _TASK_COLUMNS:
        if name in existing:
            continue
        # SQLite(>=3.23) 与 PostgreSQL 通用：布尔默认值必须写 TRUE，写 1 在 PG 上会报类型错误
        op.execute(text(f"ALTER TABLE tasks ADD COLUMN {name} {type_sql}"))


def _add_evidence_file_tenant_columns() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if "evidence_files" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("evidence_files")}
    for name, type_sql in (
        ("company_id", "INTEGER"),
        ("project_id", "INTEGER"),
    ):
        if name in existing:
            continue
        op.execute(text(f"ALTER TABLE evidence_files ADD COLUMN {name} {type_sql}"))


def upgrade() -> None:
    # Ensure full model registry is loaded.
    # Note: first-time collab bootstrap uses metadata.create_all for table set;
    # subsequent schema evolution MUST add explicit op.add_column / create_table revisions.
    import app.models  # noqa: F401
    from app.db.base import Base

    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, checkfirst=True)
    _add_task_compat_columns()
    _add_evidence_file_tenant_columns()


def downgrade() -> None:
    """Drop collab-only tables (does not remove personal core tables)."""
    # Order: children first
    tables = [
        "agent_messages",
        "agent_sessions",
        "agent_definitions",
        "report_runs",
        "report_policies",
        "delegation_grants",
        "collab_inbox",
        "notify_jobs",
        "notify_policies",
        "asr_bindings",
        "storage_bindings",
        "model_bindings",
        "integration_accounts",
        "adoption_records",
        "progress_records",
        "evidence_files",
        "evidence_packages",
        "async_jobs",
        "review_cases",
        "audit_logs",
        "project_wiki_entries",
        "node_assignments",
        "tree_nodes",
        "node_types",
        "project_invitations",
        "project_members",
        "projects",
        "service_activations",
        "company_licenses",
        "company_memberships",
        "org_units",
        "companies",
    ]
    for t in tables:
        op.execute(text(f"DROP TABLE IF EXISTS {t}"))
