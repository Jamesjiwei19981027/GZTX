"""安全 P0：会话撤销时间戳、可重置 ICS 订阅令牌、附件一次性下载票据

- users.sessions_revoked_at：删号/强制下线后，签发时间早于该时刻的 token 一律失效
- users.calendar_feed_token：ICS 订阅改 per-user 落库令牌，可重置（不再由 SECRET_KEY 推导）
- attachment_download_tickets：附件下载短时一次性票据，替代 URL 里的 access token
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "ab99cd88ef77"
down_revision: Union[str, None] = "aa11bb22cc33"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    user_columns = {col["name"] for col in inspector.get_columns("users")}
    if "sessions_revoked_at" not in user_columns:
        op.add_column(
            "users",
            sa.Column("sessions_revoked_at", sa.DateTime(timezone=True), nullable=True),
        )
    if "calendar_feed_token" not in user_columns:
        op.add_column(
            "users", sa.Column("calendar_feed_token", sa.String(64), nullable=True)
        )
        op.create_index(
            "ix_users_calendar_feed_token",
            "users",
            ["calendar_feed_token"],
            unique=True,
        )

    if not inspector.has_table("attachment_download_tickets"):
        op.create_table(
            "attachment_download_tickets",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
            sa.Column(
                "attachment_id",
                sa.Integer(),
                sa.ForeignKey("attachments.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "user_id",
                sa.Integer(),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("used_at", sa.DateTime(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
            ),
        )
        op.create_index(
            "ix_attachment_download_tickets_expires_at",
            "attachment_download_tickets",
            ["expires_at"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("attachment_download_tickets"):
        op.drop_index(
            "ix_attachment_download_tickets_expires_at",
            table_name="attachment_download_tickets",
        )
        op.drop_table("attachment_download_tickets")

    user_columns = {col["name"] for col in inspector.get_columns("users")}
    if "calendar_feed_token" in user_columns:
        op.drop_index("ix_users_calendar_feed_token", table_name="users")
        op.drop_column("users", "calendar_feed_token")
    if "sessions_revoked_at" in user_columns:
        op.drop_column("users", "sessions_revoked_at")
