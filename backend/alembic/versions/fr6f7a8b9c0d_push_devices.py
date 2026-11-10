"""极光系统推送设备。"""
from alembic import op
import sqlalchemy as sa
from app.db.types import UTCDateTime

revision = 'fr6f7a8b9c0d'
down_revision = 'fq5e6f7a8b9c'
branch_labels = None
depends_on = None


def upgrade():
    # 最初的基线迁移通过当前 Base.metadata.create_all 建表；新空库可能已有此表。
    if 'push_devices' in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        'push_devices',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('platform', sa.String(16), nullable=False),
        sa.Column('registration_id', sa.String(255), nullable=False, unique=True),
        sa.Column('app_version', sa.String(64), nullable=True),
        sa.Column('created_at', UTCDateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('last_seen_at', UTCDateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('disabled_at', UTCDateTime(), nullable=True),
        sa.CheckConstraint("platform IN ('android', 'ios')", name='ck_push_devices_platform'),
    )
    op.create_index('ix_push_devices_user_id', 'push_devices', ['user_id'])


def downgrade():
    op.drop_index('ix_push_devices_user_id', table_name='push_devices')
    op.drop_table('push_devices')
