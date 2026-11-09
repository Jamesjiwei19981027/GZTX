"""移动 SSO 一次性票据增加 PKCE 绑定。"""
from alembic import op
import sqlalchemy as sa

revision = 'fq5e6f7a8b9c'
down_revision = 'fp4d5e6f7a8b'
branch_labels = None
depends_on = None


def upgrade():
    columns = {item['name'] for item in sa.inspect(op.get_bind()).get_columns('sso_login_attempts')}
    if 'code_challenge' not in columns:
        op.add_column('sso_login_attempts', sa.Column('code_challenge', sa.String(128), nullable=True))


def downgrade():
    op.drop_column('sso_login_attempts', 'code_challenge')
