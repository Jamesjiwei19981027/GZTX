"""Private personal knowledge entries and graph links."""
from alembic import op
import sqlalchemy as sa

revision = "fi7d8e9f0a1b"
down_revision = "fh6c7d8e9f0a"
branch_labels = None
depends_on = None


def _has_table(name):
    # 全新库由 a1b2c3d4e5f6 的 create_all 按当前模型建表，这里已存在时跳过
    return sa.inspect(op.get_bind()).has_table(name)


def upgrade():
    if not _has_table("personal_knowledge_entries"):
        op.create_table("personal_knowledge_entries",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("title", sa.String(300), nullable=False),
            sa.Column("body_text", sa.Text(), nullable=False),
            sa.Column("tags_json", sa.JSON(), nullable=False),
            sa.Column("position_json", sa.JSON(), nullable=True),
            sa.Column("source_type", sa.String(32), nullable=False),
            sa.Column("source_id", sa.Integer(), nullable=True),
            sa.Column("source_ref_json", sa.JSON(), nullable=False),
            sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("company_id", "project_id", "owner_user_id", "source_type", "source_id", name="uq_personal_knowledge_source"))
    op.create_index("ix_personal_knowledge_entries_scope", "personal_knowledge_entries", ["company_id", "project_id", "owner_user_id", "is_deleted"], if_not_exists=True)
    if not _has_table("personal_knowledge_links"):
        op.create_table("personal_knowledge_links",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("source_entry_id", sa.Integer(), sa.ForeignKey("personal_knowledge_entries.id", ondelete="CASCADE"), nullable=False),
            sa.Column("target_entry_id", sa.Integer(), sa.ForeignKey("personal_knowledge_entries.id", ondelete="CASCADE"), nullable=False),
            sa.Column("label", sa.String(200), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_personal_knowledge_links_scope", "personal_knowledge_links", ["company_id", "project_id", "owner_user_id"], if_not_exists=True)


def downgrade():
    op.drop_table("personal_knowledge_links")
    op.drop_table("personal_knowledge_entries")
