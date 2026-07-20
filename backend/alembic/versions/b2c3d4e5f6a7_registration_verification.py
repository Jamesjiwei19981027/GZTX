"""registration email/phone verification

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-07-20

- users: phone / email_verified_at / phone_verified_at
- verification_codes 表
- 存量用户回填为已验证（不打扰既有账号）
"""
from alembic import op
import sqlalchemy as sa

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return column in {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    if not _has_column("users", "phone"):
        op.add_column("users", sa.Column("phone", sa.String(20), nullable=True))
        op.create_index("ix_users_phone", "users", ["phone"], unique=True)
    if not _has_column("users", "email_verified_at"):
        op.add_column(
            "users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True)
        )
    if not _has_column("users", "phone_verified_at"):
        op.add_column(
            "users", sa.Column("phone_verified_at", sa.DateTime(timezone=True), nullable=True)
        )

    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "verification_codes" not in insp.get_table_names():
        op.create_table(
            "verification_codes",
            sa.Column("id", sa.Integer, primary_key=True),
            sa.Column("channel", sa.String(16), nullable=False, index=True),
            sa.Column("target", sa.String(100), nullable=False, index=True),
            sa.Column("purpose", sa.String(16), nullable=False, server_default="register"),
            sa.Column("code_hash", sa.String(64), nullable=False),
            sa.Column("user_id", sa.Integer, nullable=True, index=True),
            sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    # 存量用户回填：升级前注册的账号视同已完成双验证
    bind.execute(
        sa.text(
            "UPDATE users SET email_verified_at = CURRENT_TIMESTAMP "
            "WHERE email_verified_at IS NULL"
        )
    )
    bind.execute(
        sa.text(
            "UPDATE users SET phone_verified_at = CURRENT_TIMESTAMP "
            "WHERE phone_verified_at IS NULL"
        )
    )


def downgrade() -> None:
    op.drop_table("verification_codes")
    op.drop_index("ix_users_phone", table_name="users")
    op.drop_column("users", "phone_verified_at")
    op.drop_column("users", "email_verified_at")
    op.drop_column("users", "phone")
