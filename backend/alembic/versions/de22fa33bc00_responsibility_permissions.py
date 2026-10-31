"""Persist project definitions, subordinate branches and node permissions."""
from alembic import op
import sqlalchemy as sa

revision = "de22fa33bc00"
down_revision = "cd11ef22ab99"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'tree_nodes' not in inspector.get_table_names():
        return
    columns = {column['name'] for column in inspector.get_columns('tree_nodes')}
    if 'node_origin' not in columns:
        op.add_column('tree_nodes', sa.Column('node_origin', sa.String(24), nullable=False, server_default='project'))
    if 'responsibility_permissions' not in columns:
        op.add_column('tree_nodes', sa.Column('responsibility_permissions', sa.JSON(), nullable=False, server_default='{}'))


def downgrade() -> None:
    op.drop_column('tree_nodes', 'responsibility_permissions')
    op.drop_column('tree_nodes', 'node_origin')
