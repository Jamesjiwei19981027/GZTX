"""RAG 知识检索基座：抽取正文表 · 知识块表 · 会话摘要列 · 全文索引

- evidence_file_texts / knowledge_chunks 两张新表
- agent_sessions 加 summary_text / summary_upto_message_id
- PG：GIN(to_tsvector('simple', tokens))；SQLite：FTS5 外部内容表 + 同步触发器
  （个别 SQLite 构建无 FTS5，建表失败可容忍，检索层会降级 LIKE）
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.services.knowledge.sqlite_fts import FTS_CREATE_STATEMENTS, FTS_DROP_STATEMENTS

revision: str = "ab12cd34ef56"
down_revision: Union[str, None] = "fe3f4a5b6c7d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("evidence_file_texts"):
        op.create_table(
            "evidence_file_texts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "evidence_file_id",
                sa.Integer(),
                sa.ForeignKey("evidence_files.id"),
                nullable=False,
            ),
            sa.Column("company_id", sa.Integer(), nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
            sa.Column("extractor", sa.String(length=64), nullable=True),
            sa.Column("text_md", sa.Text(), nullable=True),
            sa.Column("meta_json", sa.JSON(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("extracted_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("evidence_file_id", name="uq_evidence_file_texts_file"),
        )
    indexes = {idx["name"] for idx in sa.inspect(bind).get_indexes("evidence_file_texts")}
    for name, columns in (
        ("ix_evidence_file_texts_company_id", ["company_id"]),
        ("ix_evidence_file_texts_project_id", ["project_id"]),
    ):
        if name not in indexes:
            op.create_index(name, "evidence_file_texts", columns)

    if not inspector.has_table("knowledge_chunks"):
        op.create_table(
            "knowledge_chunks",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.Integer(), nullable=False),
            sa.Column("project_id", sa.Integer(), nullable=False),
            sa.Column("node_id", sa.Integer(), nullable=True),
            sa.Column("source_type", sa.String(length=32), nullable=False),
            sa.Column("source_id", sa.Integer(), nullable=False),
            sa.Column("chunk_index", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("chunk_text", sa.Text(), nullable=False),
            sa.Column("tokens", sa.Text(), nullable=True),
            sa.Column("embedding_json", sa.JSON(), nullable=True),
            sa.Column("meta_json", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint(
                "source_type", "source_id", "chunk_index",
                name="uq_knowledge_chunks_source_chunk",
            ),
        )
    indexes = {idx["name"] for idx in sa.inspect(bind).get_indexes("knowledge_chunks")}
    for name, columns in (
        ("ix_knowledge_chunks_company_id", ["company_id"]),
        ("ix_knowledge_chunks_project_id", ["project_id"]),
        ("ix_knowledge_chunks_node_id", ["node_id"]),
        ("ix_knowledge_chunks_company_project", ["company_id", "project_id"]),
        ("ix_knowledge_chunks_source", ["source_type", "source_id"]),
    ):
        if name not in indexes:
            op.create_index(name, "knowledge_chunks", columns)

    # agent_sessions 滚动摘要两列（存量库幂等补列）
    session_cols = {col["name"] for col in inspector.get_columns("agent_sessions")}
    if "summary_text" not in session_cols:
        op.add_column("agent_sessions", sa.Column("summary_text", sa.Text(), nullable=True))
    if "summary_upto_message_id" not in session_cols:
        op.add_column(
            "agent_sessions", sa.Column("summary_upto_message_id", sa.Integer(), nullable=True)
        )

    # 按方言创建全文索引
    if bind.dialect.name == "postgresql":
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_knowledge_chunks_tokens_gin "
            "ON knowledge_chunks USING GIN (to_tsvector('simple', tokens))"
        )
    elif bind.dialect.name == "sqlite":
        try:
            for stmt in FTS_CREATE_STATEMENTS:
                op.execute(stmt)
        except Exception:
            # 该 SQLite 构建无 FTS5 扩展：可容忍，检索层降级 LIKE
            pass


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if bind.dialect.name == "postgresql":
        op.execute("DROP INDEX IF EXISTS ix_knowledge_chunks_tokens_gin")
    elif bind.dialect.name == "sqlite":
        try:
            for stmt in FTS_DROP_STATEMENTS:
                op.execute(stmt)
        except Exception:
            pass

    session_cols = {col["name"] for col in inspector.get_columns("agent_sessions")}
    with op.batch_alter_table("agent_sessions") as batch_op:
        if "summary_upto_message_id" in session_cols:
            batch_op.drop_column("summary_upto_message_id")
        if "summary_text" in session_cols:
            batch_op.drop_column("summary_text")

    if inspector.has_table("knowledge_chunks"):
        indexes = {idx["name"] for idx in sa.inspect(bind).get_indexes("knowledge_chunks")}
        for name in (
            "ix_knowledge_chunks_source",
            "ix_knowledge_chunks_company_project",
            "ix_knowledge_chunks_node_id",
            "ix_knowledge_chunks_project_id",
            "ix_knowledge_chunks_company_id",
        ):
            if name in indexes:
                op.drop_index(name, table_name="knowledge_chunks")
        op.drop_table("knowledge_chunks")

    if inspector.has_table("evidence_file_texts"):
        indexes = {idx["name"] for idx in sa.inspect(bind).get_indexes("evidence_file_texts")}
        for name in (
            "ix_evidence_file_texts_project_id",
            "ix_evidence_file_texts_company_id",
        ):
            if name in indexes:
                op.drop_index(name, table_name="evidence_file_texts")
        op.drop_table("evidence_file_texts")
