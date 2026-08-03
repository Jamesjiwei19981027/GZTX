"""Persist Web Push subscriptions in the application database."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f8c9d0e1f2a3"
down_revision: Union[str, None] = "f7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("push_subscriptions"):
        return
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("endpoint", sa.String(2000), nullable=False, unique=True),
        sa.Column("subscription_json", sa.JSON(), nullable=False),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    if sa.inspect(bind).has_table("push_subscriptions"):
        op.drop_index("ix_push_subscriptions_user_id", table_name="push_subscriptions")
        op.drop_table("push_subscriptions")
