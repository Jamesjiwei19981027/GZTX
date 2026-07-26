"""notify_jobs.attempts + status index

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-26

notify_jobs 此前只有生产者没有消费者，队列只进不出。现在 main.drain_notify_jobs
会周期消费，需要 attempts 记录重试次数（超过上限置 dead），以及 status 索引
支撑"取 pending 的前 N 条"这个高频查询。
"""
from alembic import op
import sqlalchemy as sa

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "notify_jobs" not in insp.get_table_names():
        return

    cols = {c["name"] for c in insp.get_columns("notify_jobs")}
    if "attempts" not in cols:
        op.add_column(
            "notify_jobs",
            sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        )

    idx = {i["name"] for i in insp.get_indexes("notify_jobs")}
    if "ix_notify_jobs_status" not in idx:
        op.create_index("ix_notify_jobs_status", "notify_jobs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_notify_jobs_status", table_name="notify_jobs")
    op.drop_column("notify_jobs", "attempts")
