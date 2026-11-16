"""AI 审计后台执行状态；保留第一轮迁移的升级路径。"""
from alembic import op
import sqlalchemy as sa

revision = 'fu9c0d1e2f3a'
down_revision = 'ft8b9c0d1e2f'
branch_labels = None
depends_on = None


def upgrade():
    columns = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('audit_runs')}
    for column in (
        sa.Column('status', sa.String(8), nullable=False, server_default='done'),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
    ):
        if column.name not in columns:
            op.add_column('audit_runs', column)
    op.execute("UPDATE audit_runs SET started_at = created_at, finished_at = created_at WHERE status = 'done' AND finished_at IS NULL")
    if 'ix_audit_runs_status' not in {i['name'] for i in sa.inspect(op.get_bind()).get_indexes('audit_runs')}:
        op.create_index('ix_audit_runs_status', 'audit_runs', ['status'])


def downgrade():
    op.drop_index('ix_audit_runs_status', table_name='audit_runs')
    for name in ('finished_at', 'started_at', 'status'):
        op.drop_column('audit_runs', name)
