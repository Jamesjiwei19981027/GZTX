"""Revoked refresh tokens for rotation / logout revocation."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "bc45de67fa89"
down_revision: Union[str, None] = "ab12cd34ef56"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("revoked_refresh_tokens"):
        op.create_table(
            "revoked_refresh_tokens",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("jti", sa.String(length=64), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("reason", sa.String(length=16), nullable=False, server_default="rotated"),
            sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        )
    indexes = {idx["name"] for idx in sa.inspect(bind).get_indexes("revoked_refresh_tokens")}
    if "ix_revoked_refresh_tokens_jti" not in indexes:
        op.create_index(
            "ix_revoked_refresh_tokens_jti",
            "revoked_refresh_tokens",
            ["jti"],
            unique=True,
        )
    if "ix_revoked_refresh_tokens_user_id" not in indexes:
        op.create_index(
            "ix_revoked_refresh_tokens_user_id", "revoked_refresh_tokens", ["user_id"]
        )
    if "ix_revoked_refresh_tokens_expires_at" not in indexes:
        op.create_index(
            "ix_revoked_refresh_tokens_expires_at", "revoked_refresh_tokens", ["expires_at"]
        )


def downgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table("revoked_refresh_tokens"):
        return
    op.drop_table("revoked_refresh_tokens")
