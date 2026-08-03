"""Persist task source metadata used by chat/WeChat task capture."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("tasks"):
        return
    columns = {column["name"] for column in inspector.get_columns("tasks")}
    additions = (
        ("source_channel", sa.String(32), True),
        ("source_title", sa.String(200), True),
        ("source_url", sa.String(1000), True),
        ("source_message_id", sa.String(255), True),
        ("source_meta", sa.JSON(), True),
    )
    for name, column_type, nullable in additions:
        if name not in columns:
            op.add_column("tasks", sa.Column(name, column_type, nullable=nullable))
    indexes = {idx["name"] for idx in sa.inspect(bind).get_indexes("tasks")}
    if "ix_tasks_source_channel" not in indexes:
        op.create_index("ix_tasks_source_channel", "tasks", ["source_channel"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("tasks"):
        return
    indexes = {idx["name"] for idx in inspector.get_indexes("tasks")}
    if "ix_tasks_source_channel" in indexes:
        op.drop_index("ix_tasks_source_channel", table_name="tasks")
    columns = {column["name"] for column in inspector.get_columns("tasks")}
    for name in ("source_meta", "source_message_id", "source_url", "source_title", "source_channel"):
        if name in columns:
            op.drop_column("tasks", name)
