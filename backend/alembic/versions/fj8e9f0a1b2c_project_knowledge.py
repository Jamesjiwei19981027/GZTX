"""Project knowledge summary grants and owner-private cited drafts."""
from alembic import op
import sqlalchemy as sa

revision = "fj8e9f0a1b2c"
down_revision = "fi7d8e9f0a1b"
branch_labels = None
depends_on = None


def _has_table(name):
    # 全新库由 a1b2c3d4e5f6 的 create_all 按当前模型建表，这里已存在时跳过
    return sa.inspect(op.get_bind()).has_table(name)


def upgrade():
    if not _has_table("project_knowledge_grants"):
        op.create_table("project_knowledge_grants",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("can_summarize", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("updated_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("company_id", "project_id", "user_id", name="uq_project_knowledge_grant_user"))
    if not _has_table("project_knowledge_summaries"):
        op.create_table("project_knowledge_summaries",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False),
            sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
            sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("title", sa.String(300), nullable=False),
            sa.Column("body_text", sa.Text(), nullable=False),
            sa.Column("page_ids_json", sa.JSON(), nullable=False),
            sa.Column("sources_json", sa.JSON(), nullable=False),
            sa.Column("source_fingerprints_json", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(16), nullable=False),
            sa.Column("provider", sa.String(64), nullable=False),
            sa.Column("model_source", sa.String(32), nullable=False),
            sa.Column("personal_entry_id", sa.Integer(), sa.ForeignKey("personal_knowledge_entries.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()))
    op.create_index("ix_project_knowledge_summary_owner", "project_knowledge_summaries", ["company_id", "project_id", "owner_user_id"], if_not_exists=True)


def downgrade():
    op.drop_table("project_knowledge_summaries")
    op.drop_table("project_knowledge_grants")
