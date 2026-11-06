"""合并重复团队频道并添加唯一索引

Revision ID: fn2b3c4d5e6f
Revises: fm1a2b3c4d5e
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "fn2b3c4d5e6f"
down_revision: Union[str, None] = "fm1a2b3c4d5e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if inspector.has_table("team_channels"):
        # 1. 查找并合并重复行
        rows = conn.execute(
            sa.text("SELECT id, company_id, project_id, key FROM team_channels ORDER BY id ASC")
        ).fetchall()
        grouped = {}
        for r in rows:
            # r[0]=id, r[1]=company_id, r[2]=project_id, r[3]=key
            k = (r[1], r[2], r[3])
            grouped.setdefault(k, []).append(r[0])

        for k, ids in grouped.items():
            if len(ids) > 1:
                keep_id = ids[0]
                dup_ids = ids[1:]
                for dup_id in dup_ids:
                    if inspector.has_table("team_channel_messages"):
                        conn.execute(
                            sa.text("UPDATE team_channel_messages SET channel_id = :keep_id WHERE channel_id = :dup_id"),
                            {"keep_id": keep_id, "dup_id": dup_id},
                        )
                    if inspector.has_table("pinned_links"):
                        conn.execute(
                            sa.text("UPDATE pinned_links SET channel_id = :keep_id WHERE channel_id = :dup_id"),
                            {"keep_id": keep_id, "dup_id": dup_id},
                        )
                    conn.execute(
                        sa.text("DELETE FROM team_channels WHERE id = :dup_id"),
                        {"dup_id": dup_id},
                    )

        # 2. 创建唯一索引
        existing_indices = {idx["name"] for idx in inspector.get_indexes("team_channels")}
        if "uq_team_channels_company_project_key" not in existing_indices:
            op.create_index(
                "uq_team_channels_company_project_key",
                "team_channels",
                ["company_id", "project_id", "key"],
                unique=True,
                postgresql_where=sa.text("project_id IS NOT NULL"),
                sqlite_where=sa.text("project_id IS NOT NULL"),
            )
        if "uq_team_channels_company_null_project_key" not in existing_indices:
            op.create_index(
                "uq_team_channels_company_null_project_key",
                "team_channels",
                ["company_id", "key"],
                unique=True,
                postgresql_where=sa.text("project_id IS NULL"),
                sqlite_where=sa.text("project_id IS NULL"),
            )


def downgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if inspector.has_table("team_channels"):
        existing_indices = {idx["name"] for idx in inspector.get_indexes("team_channels")}
        if "uq_team_channels_company_null_project_key" in existing_indices:
            op.drop_index("uq_team_channels_company_null_project_key", table_name="team_channels")
        if "uq_team_channels_company_project_key" in existing_indices:
            op.drop_index("uq_team_channels_company_project_key", table_name="team_channels")
