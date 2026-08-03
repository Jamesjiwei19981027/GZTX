"""Add sender, recipient, attachment and reply metadata to collab inbox."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "fae1f2a3b4c5"
down_revision: Union[str, None] = "f9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("collab_inbox"):
        return
    columns = {c["name"] for c in inspector.get_columns("collab_inbox")}
    additions = (
        ("sender_user_id", sa.Integer(), True),
        ("recipient_user_ids", sa.JSON(), False),
        ("attachments_json", sa.JSON(), False),
        ("requires_reply", sa.Boolean(), False),
        ("reply_text", sa.Text(), True),
        ("replied_at", sa.DateTime(timezone=True), True),
    )
    for name, typ, nullable in additions:
        if name not in columns:
            kwargs = {"nullable": nullable}
            if name in ("recipient_user_ids", "attachments_json"):
                kwargs["server_default"] = "[]"
            if name == "requires_reply":
                kwargs["server_default"] = "0"
            op.add_column("collab_inbox", sa.Column(name, typ, **kwargs))
    indexes = {idx["name"] for idx in sa.inspect(bind).get_indexes("collab_inbox")}
    if "ix_collab_inbox_sender_user_id" not in indexes:
        op.create_index("ix_collab_inbox_sender_user_id", "collab_inbox", ["sender_user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("collab_inbox"):
        return
    indexes = {idx["name"] for idx in sa.inspect(bind).get_indexes("collab_inbox")}
    if "ix_collab_inbox_sender_user_id" in indexes:
        op.drop_index("ix_collab_inbox_sender_user_id", table_name="collab_inbox")
    for name in ("replied_at", "reply_text", "requires_reply", "attachments_json", "recipient_user_ids", "sender_user_id"):
        if name in {c["name"] for c in sa.inspect(bind).get_columns("collab_inbox")}:
            op.drop_column("collab_inbox", name)
