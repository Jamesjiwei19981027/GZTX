"""Add company-level leadership report envelopes for existing installs."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "fg5b6c7d8e9f"
down_revision: Union[str, None] = "ff4a5b6c7d8e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("leadership_report_envelopes"):
        op.create_table(
            "leadership_report_envelopes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
            sa.Column("leader_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("status", sa.String(length=24), nullable=False, server_default="submitted"),
            sa.Column("summary_text", sa.Text(), nullable=False),
            sa.Column("payload_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    for name, columns in (
        ("ix_leadership_report_envelopes_company_id", ["company_id"]),
        ("ix_leadership_report_envelopes_leader_user_id", ["leader_user_id"]),
        ("ix_leadership_report_envelopes_company_created", ["company_id", "created_at"]),
    ):
        op.create_index(name, "leadership_report_envelopes", columns, if_not_exists=True)


def downgrade() -> None:
    bind = op.get_bind()
    if not sa.inspect(bind).has_table("leadership_report_envelopes"):
        return
    for name in (
        "ix_leadership_report_envelopes_company_created",
        "ix_leadership_report_envelopes_leader_user_id",
        "ix_leadership_report_envelopes_company_id",
    ):
        op.drop_index(name, table_name="leadership_report_envelopes")
    op.drop_table("leadership_report_envelopes")
