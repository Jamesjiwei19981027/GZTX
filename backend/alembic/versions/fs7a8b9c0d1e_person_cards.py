"""项目模板与人员卡片样式。"""
from alembic import op
import sqlalchemy as sa

revision = 'fs7a8b9c0d1e'
down_revision = 'fr6f7a8b9c0d'
branch_labels = None
depends_on = None


def upgrade():
    for table, column in (('projects', 'card_template_json'), ('tree_nodes', 'card_style_json')):
        # 基线迁移使用当前 metadata.create_all，新空库可能已经包含该列。
        if column not in {c['name'] for c in sa.inspect(op.get_bind()).get_columns(table)}:
            op.add_column(table, sa.Column(column, sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('tree_nodes', 'card_style_json')
    op.drop_column('projects', 'card_template_json')
