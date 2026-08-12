"""权限过滤的全文检索（PG tsvector / SQLite FTS5，降级 LIKE），预留向量召回与 RRF 融合

ACL 不在本层做：调用方（API / 智能体运行时）必须先做 progress.read 权限校验；
本层只保证所有查询强制 company_id + project_id 双重过滤。
"""
from __future__ import annotations

import json
import logging

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.knowledge import KnowledgeChunk
from app.services.knowledge.embedding import embed_texts
from app.services.knowledge.sqlite_fts import FTS_TABLE
from app.services.knowledge.tokenize import tokenize

logger = logging.getLogger(__name__)

# 每路召回的候选上限（融合前）
_CANDIDATE_LIMIT = 50


def _row_to_dict(row) -> dict:
    meta = row.meta_json
    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except (ValueError, TypeError):
            meta = None
    return {
        "chunk_id": row.id,
        "chunk_text": row.chunk_text,
        "source_type": row.source_type,
        "source_id": row.source_id,
        "node_id": row.node_id,
        "meta": meta,
        "score": float(row.score) if row.score is not None else 0.0,
    }


async def _pg_fulltext(
    db: AsyncSession, *, company_id: int, project_id: int, tokens: list[str]
) -> list[dict]:
    """PostgreSQL：plainto_tsquery('simple') + ts_rank，命中 GIN 索引。"""
    sql = text(
        "SELECT id, chunk_text, source_type, source_id, node_id, meta_json, "
        "ts_rank(to_tsvector('simple', tokens), plainto_tsquery('simple', :q)) AS score "
        "FROM knowledge_chunks "
        "WHERE company_id = :cid AND project_id = :pid "
        "AND to_tsvector('simple', tokens) @@ plainto_tsquery('simple', :q) "
        "ORDER BY score DESC LIMIT :lim"
    )
    result = await db.execute(
        sql,
        {"q": " ".join(tokens), "cid": company_id, "pid": project_id, "lim": _CANDIDATE_LIMIT},
    )
    return [_row_to_dict(r) for r in result]


async def _sqlite_fts_available(db: AsyncSession) -> bool:
    result = await db.execute(
        text("SELECT name FROM sqlite_master WHERE type = 'table' AND name = :n"),
        {"n": FTS_TABLE},
    )
    return result.scalar_one_or_none() is not None


async def _sqlite_fts(
    db: AsyncSession, *, company_id: int, project_id: int, tokens: list[str]
) -> list[dict]:
    """SQLite FTS5：MATCH + bm25 排序（bm25 越小越相关，取负号统一为越大越好）。"""
    match = " ".join('"{}"'.format(t.replace('"', "")) for t in tokens)
    sql = text(
        "SELECT kc.id, kc.chunk_text, kc.source_type, kc.source_id, kc.node_id, "
        "kc.meta_json, -bm25(knowledge_chunks_fts) AS score "
        "FROM knowledge_chunks_fts "
        "JOIN knowledge_chunks kc ON kc.id = knowledge_chunks_fts.rowid "
        "WHERE knowledge_chunks_fts MATCH :match "
        "AND kc.company_id = :cid AND kc.project_id = :pid "
        "ORDER BY score DESC LIMIT :lim"
    )
    result = await db.execute(
        sql,
        {"match": match, "cid": company_id, "pid": project_id, "lim": _CANDIDATE_LIMIT},
    )
    return [_row_to_dict(r) for r in result]


async def _sqlite_like(
    db: AsyncSession, *, company_id: int, project_id: int, tokens: list[str]
) -> list[dict]:
    """LIKE 降级：tokens 列须包含全部查询词；按出现次数在 Python 侧计分。"""
    conditions = [
        KnowledgeChunk.tokens.like(
            "%{}%".format(t.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")),
            escape="\\",
        )
        for t in tokens
    ]
    stmt = (
        select(KnowledgeChunk)
        .where(
            KnowledgeChunk.company_id == company_id,
            KnowledgeChunk.project_id == project_id,
            *conditions,
        )
        .limit(_CANDIDATE_LIMIT * 4)
    )
    rows = (await db.execute(stmt)).scalars().all()
    items = []
    for kc in rows:
        score = float(sum((kc.tokens or "").count(t) for t in tokens))
        items.append(
            {
                "chunk_id": kc.id,
                "chunk_text": kc.chunk_text,
                "source_type": kc.source_type,
                "source_id": kc.source_id,
                "node_id": kc.node_id,
                "meta": kc.meta_json,
                "score": score,
            }
        )
    items.sort(key=lambda x: x["score"], reverse=True)
    return items[:_CANDIDATE_LIMIT]


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


async def _vector_search(
    db: AsyncSession, *, company_id: int, project_id: int, query: str
) -> list[dict]:
    """向量候选：项目级语料量小，Python 余弦暴力扫描足够；未启用时返回空。"""
    vectors = await embed_texts([query])
    if not vectors:
        return []
    qvec = vectors[0]
    stmt = select(KnowledgeChunk).where(
        KnowledgeChunk.company_id == company_id,
        KnowledgeChunk.project_id == project_id,
        KnowledgeChunk.embedding_json.is_not(None),
    )
    rows = (await db.execute(stmt)).scalars().all()
    items = []
    for kc in rows:
        emb = kc.embedding_json
        if not isinstance(emb, list) or not emb:
            continue
        items.append(
            {
                "chunk_id": kc.id,
                "chunk_text": kc.chunk_text,
                "source_type": kc.source_type,
                "source_id": kc.source_id,
                "node_id": kc.node_id,
                "meta": kc.meta_json,
                "score": _cosine(qvec, emb),
            }
        )
    items.sort(key=lambda x: x["score"], reverse=True)
    return items[:_CANDIDATE_LIMIT]


def _rrf_fuse(list_of_ranked_lists: list[list[dict]], *, k: int = 60) -> list[dict]:
    """Reciprocal Rank Fusion：按 chunk_id 去重，score = Σ 1/(k+rank)。

    现在只有全文一路也走这里，保证后续接入向量/rerank 时融合口径不变。
    """
    fused: dict[int, dict] = {}
    for ranked in list_of_ranked_lists:
        for rank, item in enumerate(ranked, start=1):
            cid = item["chunk_id"]
            if cid in fused:
                fused[cid]["score"] += 1.0 / (k + rank)
            else:
                fused[cid] = {**item, "score": 1.0 / (k + rank)}
    return sorted(fused.values(), key=lambda x: x["score"], reverse=True)


async def search_chunks(
    db: AsyncSession,
    *,
    company_id: int,
    project_id: int,
    query: str,
    top_k: int | None = None,
) -> list[dict]:
    """检索知识块，返回 [{chunk_id, chunk_text, source_type, source_id, node_id, meta, score}]。

    流程：分词 → 方言分派全文检索（PG tsvector / SQLite FTS5，缺 FTS5 降级 LIKE）
    → 可选向量候选 → RRF 融合 → top_k。ACL 由调用方负责。
    """
    top_k = top_k if top_k is not None else settings.RETRIEVAL_TOP_K
    tokens = tokenize(query)
    if not tokens:
        return []

    if settings.is_postgres:
        fulltext = await _pg_fulltext(
            db, company_id=company_id, project_id=project_id, tokens=tokens
        )
    else:
        fulltext = None
        if await _sqlite_fts_available(db):
            try:
                fulltext = await _sqlite_fts(
                    db, company_id=company_id, project_id=project_id, tokens=tokens
                )
            except Exception:
                # 个别 SQLite 构建 FTS5 行为异常：回滚后降级 LIKE
                logger.warning("FTS5 检索失败，降级 LIKE", exc_info=True)
                await db.rollback()
        if fulltext is None:
            fulltext = await _sqlite_like(
                db, company_id=company_id, project_id=project_id, tokens=tokens
            )

    ranked_lists = [fulltext]
    if settings.EMBEDDING_ENABLED:
        vector = await _vector_search(
            db, company_id=company_id, project_id=project_id, query=query
        )
        if vector:
            ranked_lists.append(vector)

    return _rrf_fuse(ranked_lists)[:top_k]
