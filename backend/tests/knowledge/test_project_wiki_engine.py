import pytest


@pytest.mark.asyncio
async def test_real_engine_searches_chinese_body_and_isolates_snapshots():
    from app.services.project_wiki_engine import inspect_wiki

    result = await inspect_wiki([
        {"id": 7, "title": "工作项 A", "body_text": "上线前必须完成数据库迁移。", "topic": "work"},
        {"id": 8, "title": "设计方案", "body_text": "交互已确认。", "topic": "work"},
    ], query="数据库迁移")
    assert [row["id"] for row in result["matches"]] == [7]
    assert len(result["index"]) == 2
    assert result["engine"] == "microsoft/llmwiki"
    other = await inspect_wiki([], query="数据库迁移")
    assert other["matches"] == []
    assert other["index"] == []


@pytest.mark.asyncio
async def test_engine_treats_markdown_titles_as_data():
    from app.services.project_wiki_engine import inspect_wiki

    result = await inspect_wiki([
        {"id": 10, "title": "报告 [A](../../outside.md)", "body_text": "测试说明", "topic": "work"},
    ])
    assert len(result["index"]) == 1
    assert result["index"][0]["path"] == "concepts/entry-10.md"
