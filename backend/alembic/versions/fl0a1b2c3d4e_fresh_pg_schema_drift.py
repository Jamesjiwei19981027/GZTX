"""全新库上迁移链与模型的差异补齐：users/tasks.updated_at 允许为空，补 tasks 跟进提醒两列。


001 迁移把 updated_at 建成 NOT NULL，而模型只声明 onupdate、插入时显式写 NULL，
全新 PostgreSQL 库上注册第一个用户即 500（NotNullViolation）。
已由 create_all 建成可空列的存量库，这里是无副作用的空操作。
"""
from alembic import op
import sqlalchemy as sa

revision = "fl0a1b2c3d4e"
down_revision = "fk9f0a1b2c3d"
branch_labels = None
depends_on = None


def upgrade():
    insp = sa.inspect(op.get_bind())
    for table in ("users", "tasks"):
        if not insp.has_table(table):
            continue
        for col in insp.get_columns(table):
            if col["name"] == "updated_at" and not col["nullable"]:
                if op.get_bind().dialect.name == "sqlite":
                    # SQLite 不支持 ALTER COLUMN，走 batch（重建表）
                    with op.batch_alter_table(table) as batch:
                        batch.alter_column("updated_at", existing_type=sa.DateTime(timezone=True), nullable=True)
                else:
                    op.alter_column(table, "updated_at", existing_type=sa.DateTime(timezone=True), nullable=True)
    # 这两列此前只由 app/db/session.py 在 SQLite 运行期补列，PostgreSQL 全新库没有，
    # 导致任务列表 SELECT 报 UndefinedColumn。
    if insp.has_table("tasks"):
        existing = {c["name"] for c in insp.get_columns("tasks")}
        if "follow_up_remind_at" not in existing:
            op.add_column("tasks", sa.Column("follow_up_remind_at", sa.DateTime(), nullable=True))
        if "follow_up_notify_channels" not in existing:
            op.add_column("tasks", sa.Column("follow_up_notify_channels", sa.String(255), nullable=True))


def downgrade():
    # 不回退：重新加 NOT NULL 会让含空值的存量数据迁移失败。
    pass
