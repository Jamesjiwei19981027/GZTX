"""team channels + user presence for remix shell

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-08-01
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The preceding collab bootstrap migration intentionally calls
    # ``Base.metadata.create_all(checkfirst=True)``.  Once the shell models
    # are imported, that bootstrap can already have created these tables.
    # Inspect before creating so a clean Alembic upgrade is safe for both the
    # legacy bootstrap path and databases that truly need these objects.
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("team_channels"):
        op.create_table(
            "team_channels",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=True),
            sa.Column("key", sa.String(32), nullable=False),
            sa.Column("name", sa.String(120), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    def ensure_index(name: str, table: str, columns: list[str]) -> None:
        existing = {idx["name"] for idx in sa.inspect(bind).get_indexes(table)}
        if name not in existing:
            op.create_index(name, table, columns)

    ensure_index("ix_team_channels_company_id", "team_channels", ["company_id"])
    ensure_index("ix_team_channels_project_id", "team_channels", ["project_id"])

    if not inspector.has_table("team_channel_messages"):
        op.create_table(
            "team_channel_messages",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("channel_id", sa.Integer(), sa.ForeignKey("team_channels.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("likes", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("liked_by", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("parent_id", sa.Integer(), sa.ForeignKey("team_channel_messages.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    ensure_index("ix_team_channel_messages_channel_id", "team_channel_messages", ["channel_id"])
    ensure_index("ix_team_channel_messages_user_id", "team_channel_messages", ["user_id"])
    message_columns = {column["name"] for column in sa.inspect(bind).get_columns("team_channel_messages")}
    if "liked_by" not in message_columns:
        op.add_column(
            "team_channel_messages",
            sa.Column("liked_by", sa.JSON(), nullable=False, server_default="[]"),
        )

    if not inspector.has_table("user_presence"):
        op.create_table(
            "user_presence",
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), primary_key=True),
            sa.Column("status", sa.String(16), nullable=False, server_default="offline"),
            sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )


def downgrade() -> None:
    # A partially applied/legacy database may not contain every shell table.
    # Keep downgrade safe in that state just as upgrade is safe on bootstrap-created tables.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table in ("user_presence", "team_channel_messages", "team_channels"):
        if inspector.has_table(table):
            op.drop_table(table)
