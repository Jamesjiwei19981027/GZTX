"""Add message metadata, direct conversations and pinned links."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f9d0e1f2a3b4"
down_revision: Union[str, None] = "f8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ensure_index(bind, name: str, table: str, columns: list[str]) -> None:
    if name not in {idx["name"] for idx in sa.inspect(bind).get_indexes(table)}:
        op.create_index(name, table, columns)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("team_channel_messages"):
        columns = {c["name"] for c in inspector.get_columns("team_channel_messages")}
        if "message_type" not in columns:
            op.add_column("team_channel_messages", sa.Column("message_type", sa.String(16), nullable=False, server_default="user"))
        if "attachments_json" not in columns:
            op.add_column("team_channel_messages", sa.Column("attachments_json", sa.JSON(), nullable=False, server_default="[]"))

    if not inspector.has_table("direct_conversations"):
        op.create_table(
            "direct_conversations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=True),
            sa.Column("kind", sa.String(16), nullable=False, server_default="direct"),
            sa.Column("title", sa.String(120), nullable=True),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    _ensure_index(bind, "ix_direct_conversations_company_id", "direct_conversations", ["company_id"])
    _ensure_index(bind, "ix_direct_conversations_project_id", "direct_conversations", ["project_id"])

    if not inspector.has_table("direct_conversation_members"):
        op.create_table(
            "direct_conversation_members",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("direct_conversations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    _ensure_index(bind, "ix_direct_conversation_members_conversation_id", "direct_conversation_members", ["conversation_id"])
    _ensure_index(bind, "ix_direct_conversation_members_user_id", "direct_conversation_members", ["user_id"])

    if not inspector.has_table("direct_messages"):
        op.create_table(
            "direct_messages",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("direct_conversations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("message_type", sa.String(16), nullable=False, server_default="user"),
            sa.Column("attachments_json", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    _ensure_index(bind, "ix_direct_messages_conversation_id", "direct_messages", ["conversation_id"])
    _ensure_index(bind, "ix_direct_messages_user_id", "direct_messages", ["user_id"])

    if not inspector.has_table("pinned_links"):
        op.create_table(
            "pinned_links",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=True),
            sa.Column("channel_id", sa.Integer(), sa.ForeignKey("team_channels.id", ondelete="CASCADE"), nullable=True),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("url", sa.String(2000), nullable=False),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    _ensure_index(bind, "ix_pinned_links_company_id", "pinned_links", ["company_id"])
    _ensure_index(bind, "ix_pinned_links_channel_id", "pinned_links", ["channel_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table in ("pinned_links", "direct_messages", "direct_conversation_members", "direct_conversations"):
        if inspector.has_table(table):
            op.drop_table(table)
    if inspector.has_table("team_channel_messages"):
        columns = {c["name"] for c in sa.inspect(bind).get_columns("team_channel_messages")}
        if "attachments_json" in columns:
            op.drop_column("team_channel_messages", "attachments_json")
        if "message_type" in columns:
            op.drop_column("team_channel_messages", "message_type")
