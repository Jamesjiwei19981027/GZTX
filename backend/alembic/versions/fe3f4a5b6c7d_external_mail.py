"""Store externally synchronized mail separately from collaboration inbox."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "fe3f4a5b6c7d"
down_revision: Union[str, None] = "fd2e3f4a5b6c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("external_mails"):
        op.create_table(
            "external_mails",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
            sa.Column("synced_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("provider", sa.String(length=32), nullable=False, server_default="imap"),
            sa.Column("external_id", sa.String(length=500), nullable=False),
            sa.Column("from_address", sa.String(length=500), nullable=True),
            sa.Column("to_addresses", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("subject", sa.String(length=500), nullable=True),
            sa.Column("headers_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("body_text", sa.Text(), nullable=False, server_default=""),
            sa.Column("state", sa.String(length=16), nullable=False, server_default="active"),
            sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("synced_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("company_id", "provider", "external_id", name="uq_external_mail_identity"),
        )
    indexes = {idx["name"] for idx in sa.inspect(bind).get_indexes("external_mails")}
    for name, column in (
        ("ix_external_mails_company_id", "company_id"),
        ("ix_external_mails_synced_by_user_id", "synced_by_user_id"),
        ("ix_external_mails_state", "state"),
    ):
        if name not in indexes:
            op.create_index(name, "external_mails", [column])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("external_mails"):
        return
    indexes = {idx["name"] for idx in sa.inspect(bind).get_indexes("external_mails")}
    for name in ("ix_external_mails_state", "ix_external_mails_synced_by_user_id", "ix_external_mails_company_id"):
        if name in indexes:
            op.drop_index(name, table_name="external_mails")
    op.drop_table("external_mails")

