"""Notification send records + usage telemetry events."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "cd67ef89ab01"
down_revision: Union[str, None] = "bc45de67fa89"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ensure_indexes(bind, table: str, wanted: dict[str, list[str]]) -> None:
    indexes = {idx["name"] for idx in sa.inspect(bind).get_indexes(table)}
    for name, cols in wanted.items():
        if name not in indexes:
            op.create_index(name, table, cols)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("notification_records"):
        op.create_table(
            "notification_records",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("channel", sa.String(length=32), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False),
            sa.Column("error", sa.Text(), nullable=True),
            sa.Column("task_id", sa.Integer(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=True,
            ),
        )
    _ensure_indexes(
        bind,
        "notification_records",
        {
            "ix_notification_records_user_id": ["user_id"],
            "ix_notification_records_created_at": ["created_at"],
        },
    )

    if not sa.inspect(bind).has_table("usage_events"):
        op.create_table(
            "usage_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=64), nullable=False),
            sa.Column("props", sa.JSON(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=True,
            ),
        )
    _ensure_indexes(
        bind,
        "usage_events",
        {
            "ix_usage_events_user_id": ["user_id"],
            "ix_usage_events_name": ["name"],
            "ix_usage_events_created_at": ["created_at"],
        },
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("usage_events"):
        op.drop_table("usage_events")
    if inspector.has_table("notification_records"):
        op.drop_table("notification_records")
