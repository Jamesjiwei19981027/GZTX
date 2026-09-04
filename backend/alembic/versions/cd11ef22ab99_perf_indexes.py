"""性能索引与指派唯一约束

- tasks / reminders / tree_nodes / notify_jobs 补齐热路径复合索引
- node_assignments 补 (node_id, user_id, role_key) 唯一约束（升级前先去重）

索引全部按「存在就跳过」处理：同一套模型在 SQLite 上是 create_all 建表，
索引可能已经由 metadata 建出来了。
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "cd11ef22ab99"
down_revision: Union[str, None] = "bc00de99fa88"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (index_name, table, columns)
INDEXES: list[tuple[str, str, list[str]]] = [
    ("ix_tasks_user_live_created", "tasks", ["user_id", "is_deleted", "created_at"]),
    ("ix_tasks_user_live_due", "tasks", ["user_id", "is_deleted", "due_date"]),
    ("ix_tasks_deleted_at", "tasks", ["is_deleted", "deleted_at"]),
    ("ix_reminders_due_scan", "reminders", ["is_sent", "remind_at"]),
    ("ix_tree_nodes_project_live", "tree_nodes", ["project_id", "is_deleted", "sort_order"]),
    ("ix_notify_jobs_status_id", "notify_jobs", ["status", "id"]),
    ("ix_notify_jobs_claimed", "notify_jobs", ["status", "claimed_at"]),
]

UNIQUE_NAME = "uq_node_assignee_role"


def _existing_indexes(inspector: sa.Inspector, table: str) -> set[str]:
    if not inspector.has_table(table):
        return set()
    return {idx["name"] for idx in inspector.get_indexes(table) if idx.get("name")}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    for name, table, columns in INDEXES:
        if not inspector.has_table(table):
            continue
        table_columns = {col["name"] for col in inspector.get_columns(table)}
        if not set(columns).issubset(table_columns):
            continue
        if name in _existing_indexes(inspector, table):
            continue
        op.create_index(name, table, columns)

    if not inspector.has_table("node_assignments"):
        return

    # 唯一约束之前不存在，存量数据可能有重复指派：保留 id 最小的一条
    op.execute(
        """
        DELETE FROM node_assignments
        WHERE id NOT IN (
            SELECT MIN(id) FROM node_assignments
            GROUP BY node_id, user_id, role_key
        )
        """
    )

    constraint_names = {
        uq.get("name")
        for uq in inspector.get_unique_constraints("node_assignments")
    }
    if UNIQUE_NAME in constraint_names:
        return
    if UNIQUE_NAME in _existing_indexes(inspector, "node_assignments"):
        return

    if bind.dialect.name == "sqlite":
        # SQLite 不支持 ALTER TABLE ADD CONSTRAINT；唯一索引等效
        op.create_index(
            UNIQUE_NAME, "node_assignments", ["node_id", "user_id", "role_key"], unique=True
        )
    else:
        op.create_unique_constraint(
            UNIQUE_NAME, "node_assignments", ["node_id", "user_id", "role_key"]
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("node_assignments"):
        if UNIQUE_NAME in _existing_indexes(inspector, "node_assignments"):
            op.drop_index(UNIQUE_NAME, table_name="node_assignments")
        elif UNIQUE_NAME in {
            uq.get("name") for uq in inspector.get_unique_constraints("node_assignments")
        } and bind.dialect.name != "sqlite":
            op.drop_constraint(UNIQUE_NAME, "node_assignments", type_="unique")
        # SQLite 上如果约束是建表时内联写进 CREATE TABLE 的（全新库由
        # create_all 建表），没法 ALTER 掉，只能留着——回滚后重复指派仍被拦，
        # 不影响正确性。

    for name, table, _columns in reversed(INDEXES):
        if name in _existing_indexes(inspector, table):
            op.drop_index(name, table_name=table)
