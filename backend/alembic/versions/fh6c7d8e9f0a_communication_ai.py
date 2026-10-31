"""communication AI artifacts"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "fh6c7d8e9f0a"
down_revision = "fg5b6c7d8e9f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    existing = set(inspect(op.get_bind()).get_table_names())
    if "conversation_summaries" not in existing:
        op.create_table(
        "conversation_summaries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("scope_type", sa.String(16), nullable=False),
        sa.Column("scope_id", sa.Integer(), nullable=False),
        sa.Column("requested_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("source_from_id", sa.Integer(), nullable=True),
        sa.Column("source_to_id", sa.Integer(), nullable=True),
        sa.Column("source_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("summary_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("key_points_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("decisions_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("action_items_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("risks_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("provider", sa.String(32), nullable=False, server_default="deterministic"),
        sa.Column("status", sa.String(24), nullable=False, server_default="completed"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    indexes = {item["name"] for item in inspect(op.get_bind()).get_indexes("conversation_summaries")} if "conversation_summaries" in existing else set()
    if "ix_conversation_summaries_company_id" not in indexes:
        op.create_index("ix_conversation_summaries_company_id", "conversation_summaries", ["company_id"])
    if "ix_conversation_summaries_project_id" not in indexes:
        op.create_index("ix_conversation_summaries_project_id", "conversation_summaries", ["project_id"])
    if "ix_conversation_summaries_scope" not in indexes:
        op.create_index("ix_conversation_summaries_scope", "conversation_summaries", ["scope_type", "scope_id"])
    if "call_sessions" not in existing:
        op.create_table(
        "call_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("direct_conversations.id"), nullable=False),
        sa.Column("initiated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("call_type", sa.String(16), nullable=False, server_default="audio"),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("participants_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        )
    if "ix_call_sessions_conversation_id" not in {item["name"] for item in inspect(op.get_bind()).get_indexes("call_sessions")}:
        op.create_index("ix_call_sessions_conversation_id", "call_sessions", ["conversation_id"])
    if "call_recordings" not in existing:
        op.create_table(
        "call_recordings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("call_session_id", sa.Integer(), sa.ForeignKey("call_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False, unique=True),
        sa.Column("original_name", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(255), nullable=False, server_default="audio/wav"),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("transcription_status", sa.String(24), nullable=False, server_default="pending"),
        sa.Column("transcription_provider", sa.String(32), nullable=True),
        sa.Column("transcript_text", sa.Text(), nullable=True),
        sa.Column("transcription_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    if "ix_call_recordings_call_session_id" not in {item["name"] for item in inspect(op.get_bind()).get_indexes("call_recordings")}:
        op.create_index("ix_call_recordings_call_session_id", "call_recordings", ["call_session_id"])


def downgrade() -> None:
    op.drop_table("call_recordings")
    op.drop_table("call_sessions")
    op.drop_table("conversation_summaries")
