"""Preserve deadline changes without rewriting submitted report snapshots."""
from alembic import op
import sqlalchemy as sa

revision = "fk9f0a1b2c3d"
down_revision = "fj8e9f0a1b2c"
branch_labels = None
depends_on = None


def _has_table(name):
    # 全新库由 a1b2c3d4e5f6 的 create_all 按当前模型建表，这里已存在时跳过
    return sa.inspect(op.get_bind()).has_table(name)


def upgrade():
    if not _has_table("task_schedule_changes"):
        op.create_table("task_schedule_changes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
            sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("old_due_date", sa.DateTime(timezone=True), nullable=True),
            sa.Column("new_due_date", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_task_schedule_changes_task_id", "task_schedule_changes", ["task_id"], if_not_exists=True)


def downgrade():
    op.drop_table("task_schedule_changes")
