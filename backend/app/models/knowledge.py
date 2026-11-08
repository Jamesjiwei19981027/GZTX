"""知识检索层：材料抽取正文 · 统一知识块

- EvidenceFileText：证据文件抽取正文（证据域持久化，无论采纳与否）
- KnowledgeChunk：wiki/材料统一切块（仅采纳内容入库，供全文/向量检索）
"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    JSON,
    UniqueConstraint,
    Index,
)
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import UTCDateTime


class EvidenceFileText(Base):
    __tablename__ = "evidence_file_texts"

    id = Column(Integer, primary_key=True, index=True)
    evidence_file_id = Column(
        Integer, ForeignKey("evidence_files.id"), nullable=False, unique=True
    )
    company_id = Column(Integer, nullable=False, index=True)
    project_id = Column(Integer, nullable=False, index=True)
    # pending / extracting / succeeded / failed / skipped
    status = Column(String(32), nullable=False, default="pending")
    # 实际使用的抽取引擎：plain / markitdown / docling / libreoffice+markitdown
    extractor = Column(String(64), nullable=True)
    # 抽取正文（Markdown），上限 EXTRACTION_MAX_CHARS，截断情况记 meta_json
    text_md = Column(Text, nullable=True)
    # 页数 / 耗时 / 是否截断 / OCR 使用情况
    meta_json = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    extracted_at = Column(UTCDateTime(), nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now())


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"
    __table_args__ = (
        UniqueConstraint(
            "source_type", "source_id", "chunk_index",
            name="uq_knowledge_chunks_source_chunk",
        ),
        Index("ix_knowledge_chunks_company_project", "company_id", "project_id"),
        Index("ix_knowledge_chunks_source", "source_type", "source_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, nullable=False, index=True)
    project_id = Column(Integer, nullable=False, index=True)
    node_id = Column(Integer, nullable=True, index=True)
    # wiki_entry → ProjectWikiEntry.id；evidence_file → EvidenceFile.id
    source_type = Column(String(32), nullable=False)
    source_id = Column(Integer, nullable=False)
    chunk_index = Column(Integer, nullable=False, default=0)
    chunk_text = Column(Text, nullable=False)
    # jieba 分词后空格连接，全文索引（PG GIN / SQLite FTS5）建在此列
    tokens = Column(Text, nullable=True)
    # 可空；EMBEDDING_ENABLED 时写入向量（JSON 数组）
    embedding_json = Column(JSON, nullable=True)
    # 页码 / 标题路径 / 原文件名等来源信息
    meta_json = Column(JSON, nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now())
