"""projects.final_owner_along_delta

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-26

终责卡片沿主干方向的偏移量此前只存在客户端本地（Web localStorage /
APP SharedPreferences）：PM 拖动的结果既不跨端同步、换设备即丢失，
「仅项目 PM / created_by 可拖」这条产品规则也完全没有服务端承载。
"""
from alembic import op
import sqlalchemy as sa

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "projects" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("projects")}
    if "final_owner_along_delta" not in cols:
        op.add_column(
            "projects",
            sa.Column(
                "final_owner_along_delta",
                sa.Integer,
                nullable=False,
                server_default="0",
            ),
        )


def downgrade() -> None:
    op.drop_column("projects", "final_owner_along_delta")
