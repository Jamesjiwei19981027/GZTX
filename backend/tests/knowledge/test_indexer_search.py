"""索引 + 检索：中文召回 · 公司/项目隔离 · 重建删旧 · FTS5/LIKE 两路 · 零外呼"""
import pytest
from sqlalchemy import select, text

from app.models.knowledge import KnowledgeChunk
from app.models.wiki import ProjectWikiEntry
from app.services.knowledge import search as search_module
from app.services.knowledge.indexer import delete_source, index_wiki_entry
from app.services.knowledge.search import search_chunks
from app.services.knowledge.sqlite_fts import FTS_CREATE_STATEMENTS


async def _make_entry(db, *, company_id=1, project_id=1, node_id=None,
                      title="部署验收标准", body="上线前必须完成数据库迁移与冒烟测试。"):
    entry = ProjectWikiEntry(
        company_id=company_id,
        project_id=project_id,
        node_id=node_id,
        title=title,
        body_text=body,
        source="manual",
    )
    db.add(entry)
    await db.flush()
    return entry


async def _create_fts(engine):
    async with engine.begin() as conn:
        for stmt in FTS_CREATE_STATEMENTS:
            await conn.exec_driver_sql(stmt)


async def test_index_and_search_chinese_keyword(db_session):
    entry = await _make_entry(db_session)
    count = await index_wiki_entry(db_session, entry)
    assert count >= 1

    results = await search_chunks(
        db_session, company_id=1, project_id=1, query="验收标准"
    )
    assert results, "中文关键词应能召回"
    top = results[0]
    assert top["source_type"] == "wiki_entry"
    assert top["source_id"] == entry.id
    assert "验收标准" in top["chunk_text"]
    assert top["meta"]["title"] == entry.title
    assert set(top) >= {"chunk_id", "chunk_text", "source_type", "source_id", "node_id", "meta", "score"}


async def test_company_and_project_isolation(db_session):
    entry = await _make_entry(db_session, company_id=1, project_id=1)
    await index_wiki_entry(db_session, entry)

    # 另一项目 / 另一公司均不可见
    assert await search_chunks(db_session, company_id=1, project_id=2, query="验收标准") == []
    assert await search_chunks(db_session, company_id=2, project_id=1, query="验收标准") == []


async def test_reindex_deletes_old_chunks(db_session):
    entry = await _make_entry(db_session, body="旧版内容：使用甲方案部署。")
    await index_wiki_entry(db_session, entry)

    entry.body_text = "新版内容：改用乙方案部署。"
    await index_wiki_entry(db_session, entry)

    rows = (
        (await db_session.execute(
            select(KnowledgeChunk).where(
                KnowledgeChunk.source_type == "wiki_entry",
                KnowledgeChunk.source_id == entry.id,
            )
        )).scalars().all()
    )
    assert rows
    assert all("甲方案" not in r.chunk_text for r in rows), "旧块必须被删除"
    assert any("乙方案" in r.chunk_text for r in rows)

    # delete_source 后彻底清空
    await delete_source(db_session, "wiki_entry", entry.id)
    remaining = (
        (await db_session.execute(
            select(KnowledgeChunk).where(
                KnowledgeChunk.source_type == "wiki_entry",
                KnowledgeChunk.source_id == entry.id,
            )
        )).scalars().all()
    )
    assert remaining == []


@pytest.mark.sqlite_only
async def test_fts5_path_used_when_available(async_engine, db_session, monkeypatch):
    """建好 FTS5 表+触发器后应走 FTS 路（LIKE 路被禁止调用）。"""
    await _create_fts(async_engine)
    entry = await _make_entry(db_session)
    await index_wiki_entry(db_session, entry)

    async def _fail_like(*args, **kwargs):
        raise AssertionError("FTS5 可用时不应落入 LIKE 降级")

    monkeypatch.setattr(search_module, "_sqlite_like", _fail_like)
    results = await search_chunks(db_session, company_id=1, project_id=1, query="验收标准")
    assert results and results[0]["source_id"] == entry.id

    # 触发器同步：删块后 FTS 里也查不到
    await delete_source(db_session, "wiki_entry", entry.id)
    assert await search_chunks(db_session, company_id=1, project_id=1, query="验收标准") == []


@pytest.mark.sqlite_only
async def test_like_fallback_when_fts_errors(async_engine, db_session, monkeypatch):
    """FTS5 报错时降级 LIKE，返回结构一致（降级路径会 rollback，先提交数据）。"""
    await _create_fts(async_engine)
    entry = await _make_entry(db_session)
    entry_id = entry.id
    await index_wiki_entry(db_session, entry)
    await db_session.commit()

    async def _broken_fts(*args, **kwargs):
        raise RuntimeError("模拟 FTS5 异常")

    monkeypatch.setattr(search_module, "_sqlite_fts", _broken_fts)
    results = await search_chunks(db_session, company_id=1, project_id=1, query="验收标准")
    assert results and results[0]["source_id"] == entry_id
    assert set(results[0]) >= {"chunk_id", "chunk_text", "source_type", "source_id", "node_id", "meta", "score"}


@pytest.mark.sqlite_only
async def test_like_fallback_when_fts_table_missing(db_session):
    """未跑迁移（无 FTS 表）的库自动走 LIKE，不报错。"""
    row = await db_session.execute(
        text("SELECT name FROM sqlite_master WHERE name = 'knowledge_chunks_fts'")
    )
    assert row.scalar_one_or_none() is None
    entry = await _make_entry(db_session)
    await index_wiki_entry(db_session, entry)
    results = await search_chunks(db_session, company_id=1, project_id=1, query="验收标准")
    assert results and results[0]["source_id"] == entry.id


async def test_embedding_disabled_makes_no_http_calls(db_session, monkeypatch):
    """EMBEDDING_ENABLED=false（默认）：embedding_json 留空且零外呼。"""
    from app.core.config import settings

    assert settings.EMBEDDING_ENABLED is False

    import httpx

    def _no_network(*args, **kwargs):
        raise AssertionError("EMBEDDING_ENABLED=false 时不允许任何 HTTP 外呼")

    monkeypatch.setattr(httpx, "AsyncClient", _no_network)

    entry = await _make_entry(db_session)
    await index_wiki_entry(db_session, entry)
    rows = (
        (await db_session.execute(
            select(KnowledgeChunk).where(KnowledgeChunk.source_id == entry.id)
        )).scalars().all()
    )
    assert rows
    assert all(r.embedding_json is None for r in rows)

    results = await search_chunks(db_session, company_id=1, project_id=1, query="验收标准")
    assert results


async def test_empty_query_returns_empty(db_session):
    entry = await _make_entry(db_session)
    await index_wiki_entry(db_session, entry)
    assert await search_chunks(db_session, company_id=1, project_id=1, query="") == []
    assert await search_chunks(db_session, company_id=1, project_id=1, query="，。！") == []
