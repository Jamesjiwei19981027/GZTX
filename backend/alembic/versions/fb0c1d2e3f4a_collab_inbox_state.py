"""Add archive/delete state to collaboration inbox messages."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "fb0c1d2e3f4a"
down_revision: Union[str, None] = "fae1f2a3b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("collab_inbox"):
        return
    columns = {c["name"] for c in inspector.get_columns("collab_inbox")}
    for name in ("archived_at", "deleted_at"):
        if name not in columns:
            op.add_column("collab_inbox", sa.Column(name, sa.DateTime(timezone=True), nullable=True))
    indexes = {idx["name"] for idx in sa.inspect(bind).get_indexes("collab_inbox")}
    for name, column in (("ix_collab_inbox_archived_at", "archived_at"), ("ix_collab_inbox_deleted_at", "deleted_at")):
        if name not in indexes:
            op.create_index(name, "collab_inbox", [column])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("collab_inbox"):
        return
    indexes = {idx["name"] for idx in sa.inspect(bind).get_indexes("collab_inbox")}
    for name in ("ix_collab_inbox_deleted_at", "ix_collab_inbox_archived_at"):
        if name in indexes:
            op.drop_index(name, table_name="collab_inbox")
    columns = {c["name"] for c in sa.inspect(bind).get_columns("collab_inbox")}
    for name in ("deleted_at", "archived_at"):
        if name in columns:
            op.drop_column("collab_inbox", name)
