"""知识块索引器：来源级全删重建

语义：每次索引先 delete_source 删掉该来源全部旧块，再切块全量重写（写 tokens 列）。
EMBEDDING_ENABLED=false（默认）时 embedding_json 留空且零外呼。
ACL 不在本层做，调用方负责权限校验。
"""
from __future__ import annotations

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.evidence import EvidenceFile
from app.models.knowledge import KnowledgeChunk
from app.models.wiki import ProjectWikiEntry
from app.services.knowledge.chunker import chunk_text
from app.services.knowledge.embedding import embed_texts
from app.services.knowledge.tokenize import tokens_str

SOURCE_WIKI_ENTRY = "wiki_entry"
SOURCE_EVIDENCE_FILE = "evidence_file"


async def delete_source(db: AsyncSession, source_type: str, source_id: int) -> None:
    """删除某来源的全部知识块（SQLite FTS 由触发器同步清理）。"""
    await db.execute(
        delete(KnowledgeChunk).where(
            KnowledgeChunk.source_type == source_type,
            KnowledgeChunk.source_id == source_id,
        )
    )


async def _rebuild_chunks(
    db: AsyncSession,
    *,
    company_id: int,
    project_id: int,
    node_id: int | None,
    source_type: str,
    source_id: int,
    text: str,
    base_meta: dict,
) -> int:
    await delete_source(db, source_type, source_id)
    chunks = chunk_text(text)
    if not chunks:
        await db.flush()
        return 0
    # 未启用 embedding 时返回 None，全部块 embedding_json 留空
    vectors = await embed_texts([c["text"] for c in chunks])
    for i, c in enumerate(chunks):
        db.add(
            KnowledgeChunk(
                company_id=company_id,
                project_id=project_id,
                node_id=node_id,
                source_type=source_type,
                source_id=source_id,
                chunk_index=c["index"],
                chunk_text=c["text"],
                tokens=tokens_str(c["text"]),
                embedding_json=vectors[i] if vectors else None,
                meta_json={**base_meta, **(c.get("meta") or {})},
            )
        )
    await db.flush()
    return len(chunks)


async def index_wiki_entry(db: AsyncSession, entry: ProjectWikiEntry) -> int:
    """wiki 条目切块入索引（标题作为一级标题拼进正文，保证标题可检索）。"""
    # LLM Wiki uses its isolated, project-scoped engine. Never expose private
    # drafts through shared search or invoke embeddings for this workflow.
    if entry.source in {"llm_wiki", "llm_wiki_draft", "llm_wiki_review"}:
        await delete_source(db, SOURCE_WIKI_ENTRY, entry.id)
        await db.flush()
        return 0
    text = f"# {entry.title}\n\n{entry.body_text or ''}"
    return await _rebuild_chunks(
        db,
        company_id=entry.company_id,
        project_id=entry.project_id,
        node_id=entry.node_id,
        source_type=SOURCE_WIKI_ENTRY,
        source_id=entry.id,
        text=text,
        base_meta={"title": entry.title, "source": entry.source},
    )


async def index_evidence_file(
    db: AsyncSession,
    evidence_file: EvidenceFile,
    text_md: str,
    *,
    node_id: int | None = None,
) -> int:
    """已采纳材料的抽取正文切块入索引（调用方保证包已采纳）。"""
    return await _rebuild_chunks(
        db,
        company_id=evidence_file.company_id,
        project_id=evidence_file.project_id,
        node_id=node_id,
        source_type=SOURCE_EVIDENCE_FILE,
        source_id=evidence_file.id,
        text=text_md or "",
        base_meta={"original_name": evidence_file.original_name},
    )
