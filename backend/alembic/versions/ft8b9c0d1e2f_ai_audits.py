"""AI 审计档案与人员下属审计权限。"""
from alembic import op
import sqlalchemy as sa

revision = 'ft8b9c0d1e2f'
down_revision = 'fs7a8b9c0d1e'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if 'allow_audit_subordinates' not in {c['name'] for c in sa.inspect(bind).get_columns('tree_nodes')}:
        op.add_column('tree_nodes', sa.Column('allow_audit_subordinates', sa.Boolean(), nullable=True))
    # 001 使用当前 metadata；空库初始化可能已经建好此表。
    if 'audit_runs' not in sa.inspect(bind).get_table_names():
        op.create_table('audit_runs',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=False),
            sa.Column('project_id', sa.Integer(), sa.ForeignKey('projects.id'), nullable=False),
            sa.Column('initiator_user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('scope', sa.String(16), nullable=False),
            sa.Column('node_id', sa.Integer(), nullable=True),
            sa.Column('custom_instruction', sa.Text(), nullable=True),
            sa.Column('mode', sa.String(8), nullable=False),
            sa.Column('model_source', sa.String(16), nullable=True),
            sa.Column('overall_risk', sa.String(16), nullable=False),
            sa.Column('result_json', sa.JSON(), nullable=False),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
        op.create_index('ix_audit_runs_project_created', 'audit_runs', ['project_id', 'id'])


def downgrade():
    op.drop_table('audit_runs')
    op.drop_column('tree_nodes', 'allow_audit_subordinates')
