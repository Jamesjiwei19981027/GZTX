"""Store binary collaboration attachments independently from message JSON."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "fd2e3f4a5b6c"
down_revision: Union[str, None] = "fc1d2e3f4a5b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("collab_files"):
        op.create_table(
            "collab_files",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
            sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("scope_type", sa.String(length=16), nullable=False),
            sa.Column("scope_id", sa.Integer(), nullable=False),
            sa.Column("message_id", sa.Integer(), nullable=True),
            sa.Column("storage_key", sa.String(length=500), nullable=False, unique=True),
            sa.Column("original_name", sa.String(length=255), nullable=False),
            sa.Column("mime_type", sa.String(length=255), nullable=False, server_default="application/octet-stream"),
            sa.Column("size_bytes", sa.Integer(), nullable=False),
            sa.Column("sha256", sa.String(length=64), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
    indexes = {idx["name"] for idx in sa.inspect(bind).get_indexes("collab_files")}
    for name, column in (
        ("ix_collab_files_company_id", "company_id"),
        ("ix_collab_files_owner_user_id", "owner_user_id"),
        ("ix_collab_files_scope_type", "scope_type"),
        ("ix_collab_files_scope_id", "scope_id"),
        ("ix_collab_files_message_id", "message_id"),
        ("ix_collab_files_sha256", "sha256"),
    ):
        if name not in indexes:
            op.create_index(name, "collab_files", [column])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("collab_files"):
        return
    indexes = {idx["name"] for idx in sa.inspect(bind).get_indexes("collab_files")}
    for name in (
        "ix_collab_files_sha256",
        "ix_collab_files_message_id",
        "ix_collab_files_scope_id",
        "ix_collab_files_scope_type",
        "ix_collab_files_owner_user_id",
        "ix_collab_files_company_id",
    ):
        if name in indexes:
            op.drop_index(name, table_name="collab_files")
    op.drop_table("collab_files")

