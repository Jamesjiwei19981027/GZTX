"""知识检索 API：正常召回 · 非成员 403 · 项目不存在 404 · 空 q · 跨项目隔离 · top_k 截断"""


async def test_search_returns_indexed_chunks(async_client, seed_knowledge):
    r = await async_client.get(
        f"/api/v1/projects/{seed_knowledge['project_id']}/knowledge/search",
        params={"q": "验收标准"},
        headers=seed_knowledge["member_headers"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["code"] == 200
    items = body["data"]["items"]
    assert items, "已索引的 wiki 条目应能召回"
    top = items[0]
    assert top["source_type"] == "wiki_entry"
    assert top["source_id"] == seed_knowledge["wiki_id"]
    assert "验收标准" in top["chunk_text"]
    assert set(top) >= {"chunk_id", "chunk_text", "source_type", "source_id", "node_id", "meta", "score"}


async def test_search_non_member_403(async_client, seed_knowledge):
    r = await async_client.get(
        f"/api/v1/projects/{seed_knowledge['project_id']}/knowledge/search",
        params={"q": "验收标准"},
        headers=seed_knowledge["outsider_headers"],
    )
    assert r.status_code == 403
    assert r.json()["code"] == 40301


async def test_search_project_not_found_404(async_client, seed_knowledge):
    r = await async_client.get(
        "/api/v1/projects/999999/knowledge/search",
        params={"q": "验收标准"},
        headers=seed_knowledge["member_headers"],
    )
    assert r.status_code == 404
    assert r.json()["code"] == 40400


async def test_search_empty_query_returns_empty_items(async_client, seed_knowledge):
    r = await async_client.get(
        f"/api/v1/projects/{seed_knowledge['project_id']}/knowledge/search",
        params={"q": "   "},
        headers=seed_knowledge["member_headers"],
    )
    assert r.status_code == 200
    assert r.json()["data"]["items"] == []


async def test_search_cross_project_isolation(async_client, seed_knowledge):
    """同公司另一项目（无知识块）用同样关键词查询应为空。"""
    r = await async_client.get(
        f"/api/v1/projects/{seed_knowledge['project2_id']}/knowledge/search",
        params={"q": "验收标准"},
        headers=seed_knowledge["member_headers"],
    )
    assert r.status_code == 200
    assert r.json()["data"]["items"] == []


async def test_search_top_k_capped(async_client, seed_knowledge):
    """top_k 超过上限 20 时按 20 截断，不报错。"""
    r = await async_client.get(
        f"/api/v1/projects/{seed_knowledge['project_id']}/knowledge/search",
        params={"q": "验收标准", "top_k": 100},
        headers=seed_knowledge["member_headers"],
    )
    assert r.status_code == 200, r.text
    items = r.json()["data"]["items"]
    assert len(items) <= 20
    assert items, "截断 top_k 不应影响正常召回"
