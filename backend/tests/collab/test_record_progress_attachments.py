"""WR-14：记录进展存为汇报草稿 / 个人知识时，附件随记录保存。"""
import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.agent import AgentMessage


async def _upload(client, ids, headers, name="a.txt"):
    r = await client.post(
        "/api/v1/evidence/files",
        headers=headers,
        data={"company_id": ids["company_id"], "project_id": ids["project_id"]},
        files={"file": (name, b"hello", "text/plain")},
    )
    assert r.status_code == 200, r.text
    return r.json()["data"]["file_id"]


@pytest.mark.asyncio
async def test_report_draft_chat_keeps_attachments(async_client, db_session, seed_ids, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "COLLAB_OBJECT_ROOT", str(tmp_path))
    ids = seed_ids
    mine = await _upload(async_client, ids, ids["member_headers"], "mine.txt")
    others = await _upload(async_client, ids, ids["pm_headers"], "others.txt")
    r = await async_client.post(
        "/api/v1/agents/chat",
        headers=ids["member_headers"],
        json={"company_id": ids["company_id"], "project_id": ids["project_id"], "channel": "web",
              "message": "今天完成了联调并整理了说明", "file_ids": [mine, others]},
    )
    assert r.status_code == 200, r.text
    msgs = (await db_session.execute(select(AgentMessage).where(AgentMessage.role == "user"))).scalars().all()
    att = [m.meta_json["attachments"] for m in msgs if m.meta_json and m.meta_json.get("attachments")]
    assert len(att) == 1
    assert [a["file_id"] for a in att[0]] == [mine], "只保存自己上传的附件，别人的文件被忽略"
    assert att[0][0]["original_name"] == "mine.txt"


@pytest.mark.asyncio
async def test_personal_knowledge_entry_keeps_attachments(async_client, seed_ids, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "COLLAB_OBJECT_ROOT", str(tmp_path))
    ids = seed_ids
    mine = await _upload(async_client, ids, ids["member_headers"], "note.txt")
    r = await async_client.post(
        f"/api/v1/projects/{ids['project_id']}/personal-knowledge/entries",
        headers=ids["member_headers"],
        json={"title": "带附件的笔记", "body_text": "正文", "tags": [], "file_ids": [mine, 999999]},
    )
    assert r.status_code == 200, r.text
    ref = r.json()["data"]["source_ref"]
    assert [a["file_id"] for a in ref["attachments"]] == [mine]
    # 无附件时保持原行为
    r2 = await async_client.post(
        f"/api/v1/projects/{ids['project_id']}/personal-knowledge/entries",
        headers=ids["member_headers"], json={"title": "无附件", "body_text": "", "tags": []},
    )
    assert r2.json()["data"]["source_ref"] == {}
