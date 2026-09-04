"""投递可靠性：提醒重试计数、notify_jobs 原子认领时间戳

- reminders.attempts / last_error：全渠道失败时不再直接标 is_sent，靠 attempts 兜住重试
- notify_jobs.claimed_at：pending → processing 原子认领；崩溃留下的 processing 超时后重排
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "bc00de99fa88"
down_revision: Union[str, None] = "ab99cd88ef77"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    reminder_columns = {col["name"] for col in inspector.get_columns("reminders")}
    if "attempts" not in reminder_columns:
        op.add_column(
            "reminders",
            sa.Column(
                "attempts", sa.Integer(), nullable=False, server_default="0"
            ),
        )
    if "last_error" not in reminder_columns:
        op.add_column("reminders", sa.Column("last_error", sa.String(500), nullable=True))

    if inspector.has_table("notify_jobs"):
        job_columns = {col["name"] for col in inspector.get_columns("notify_jobs")}
        if "claimed_at" not in job_columns:
            op.add_column(
                "notify_jobs",
                sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
            )
        # 迁移瞬间可能有认领中的 job：升级后统一放回 pending，由下一轮重发
        op.execute(
            "UPDATE notify_jobs SET status='pending', claimed_at=NULL "
            "WHERE status='processing'"
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("notify_jobs"):
        job_columns = {col["name"] for col in inspector.get_columns("notify_jobs")}
        if "claimed_at" in job_columns:
            op.execute(
                "UPDATE notify_jobs SET status='pending' WHERE status='processing'"
            )
            op.drop_column("notify_jobs", "claimed_at")

    reminder_columns = {col["name"] for col in inspector.get_columns("reminders")}
    if "last_error" in reminder_columns:
        op.drop_column("reminders", "last_error")
    if "attempts" in reminder_columns:
        op.drop_column("reminders", "attempts")
