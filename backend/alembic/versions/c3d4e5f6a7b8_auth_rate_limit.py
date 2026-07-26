"""auth rate limit counters

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-26

新增 rate_limit_counters：认证接口的固定窗口限流计数。
落库而非进程内的原因见 app/services/rate_limit.py 文件头。
"""
from alembic import op
import sqlalchemy as sa

revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "rate_limit_counters" in insp.get_table_names():
        return
    op.create_table(
        "rate_limit_counters",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("bucket_key", sa.String(255), nullable=False),
        sa.Column("count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_rate_limit_counters_bucket_key",
        "rate_limit_counters",
        ["bucket_key"],
        unique=True,
    )
    op.create_index(
        "ix_rate_limit_counters_expires_at", "rate_limit_counters", ["expires_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_rate_limit_counters_expires_at", table_name="rate_limit_counters")
    op.drop_index("ix_rate_limit_counters_bucket_key", table_name="rate_limit_counters")
    op.drop_table("rate_limit_counters")
