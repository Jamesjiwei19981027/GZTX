"""tasks.checklist：轻量子任务清单（JSON），独立于 parent_task_id 的重复实例语义

Revision ID: aa11bb22cc33
Revises: cd67ef89ab01
Create Date: 2026-08-28
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "aa11bb22cc33"
down_revision: Union[str, None] = "cd67ef89ab01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("checklist", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "checklist")
