"""草稿无提交时间，正式提交由应用写入。

Revision ID: fo3c4d5e6f7a
Revises: fn2b3c4d5e6f
"""
from alembic import op
import sqlalchemy as sa

revision = "fo3c4d5e6f7a"
down_revision = "fn2b3c4d5e6f"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    if not sa.inspect(conn).has_table("agent_reports"):
        return
    # SQLite 需要批量重建以移除 CURRENT_TIMESTAMP 默认值。
    with op.batch_alter_table("agent_reports") as batch:
        batch.alter_column("submitted_at", existing_type=sa.DateTime(timezone=True), server_default=None, nullable=True)
    conn.execute(sa.text("UPDATE agent_reports SET submitted_at = NULL WHERE status = 'draft'"))


def downgrade():
    if sa.inspect(op.get_bind()).has_table("agent_reports"):
        with op.batch_alter_table("agent_reports") as batch:
            batch.alter_column("submitted_at", existing_type=sa.DateTime(timezone=True), server_default=sa.func.now())
