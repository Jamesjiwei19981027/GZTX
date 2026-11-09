"""企业 SSO 事务、供应商身份绑定与组织人员目录。"""
from alembic import op
from app.models.sso import SsoBinding, SsoLoginAttempt, OrgDirectoryPerson

revision = "fo3c4d5e6f7a"
down_revision = "fn2b3c4d5e6f"
branch_labels = None
depends_on = None


def upgrade():
    for model in (SsoBinding, SsoLoginAttempt, OrgDirectoryPerson):
        model.__table__.create(op.get_bind(), checkfirst=True)


def downgrade():
    for model in (OrgDirectoryPerson, SsoLoginAttempt, SsoBinding):
        model.__table__.drop(op.get_bind(), checkfirst=True)
