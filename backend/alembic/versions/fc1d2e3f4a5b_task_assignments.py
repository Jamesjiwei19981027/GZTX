"""Persist task assignees with project membership constraints enforced by the API."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "fc1d2e3f4a5b"
down_revision: Union[str, None] = "fb0c1d2e3f4a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("task_assignees"):
        op.create_table(
            "task_assignees",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "task_id",
                sa.Integer(),
                sa.ForeignKey("tasks.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("role_key", sa.String(length=32), nullable=False, server_default="primary"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint(
                "task_id",
                "user_id",
                "role_key",
                name="uq_task_assignee_role",
            ),
        )
    indexes = {idx["name"] for idx in sa.inspect(bind).get_indexes("task_assignees")}
    for name, column in (
        ("ix_task_assignees_task_id", "task_id"),
        ("ix_task_assignees_user_id", "user_id"),
    ):
        if name not in indexes:
            op.create_index(name, "task_assignees", [column])

    # Backfill legacy personal tasks.  The insert is idempotent because the
    # migration runs once and the unique key protects repeated development runs.
    if inspector.has_table("tasks"):
        op.execute(
            sa.text(
                """
                INSERT INTO task_assignees (task_id, user_id, role_key)
                SELECT t.id, t.user_id, 'primary'
                FROM tasks AS t
                WHERE COALESCE(t.origin, 'personal') = 'personal'
                  AND NOT EXISTS (
                    SELECT 1 FROM task_assignees a WHERE a.task_id = t.id
                  )
                """
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("task_assignees"):
        return
    indexes = {idx["name"] for idx in inspector.get_indexes("task_assignees")}
    for name in ("ix_task_assignees_user_id", "ix_task_assignees_task_id"):
        if name in indexes:
            op.drop_index(name, table_name="task_assignees")
    op.drop_table("task_assignees")

