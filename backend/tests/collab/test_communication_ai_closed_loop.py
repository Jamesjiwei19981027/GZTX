"""聊天记录与通话 AI 闭环的红绿回归测试。"""

import pytest

from app.models.shell import DirectConversation, DirectConversationMember


@pytest.mark.asyncio
async def test_channel_history_can_be_summarized_and_is_project_scoped(async_client, seed_ids):
    info = seed_ids
    channels = await async_client.get(
        f"/api/v1/companies/{info['company_id']}/channels?project_id={info['project_id']}",
        headers=info["member_headers"],
    )
    channel_id = channels.json()["data"]["items"][0]["id"]
    for text in ("决定周五前完成联调", "待办：林悦补充接口材料", "风险：测试环境缺少录音转写"):
        response = await async_client.post(
            f"/api/v1/channels/{channel_id}/messages",
            headers=info["member_headers"],
            json={"body": text},
        )
        assert response.status_code == 200, response.text

    created = await async_client.post(
        f"/api/v1/channels/{channel_id}/summaries",
        headers=info["member_headers"],
        json={},
    )
    assert created.status_code == 200, created.text
    body = created.json()["data"]
    assert body["source_count"] >= 3
    assert "周五" in body["summary_text"]
    assert body["provider"] == "deterministic"

    listed = await async_client.get(
        f"/api/v1/channels/{channel_id}/summaries",
        headers=info["member_headers"],
    )
    assert listed.status_code == 200
    assert listed.json()["data"]["items"][0]["id"] == body["id"]


@pytest.mark.asyncio
async def test_direct_conversation_summary_rejects_non_member(async_client, db_session, seed_ids):
    info = seed_ids
    conversation = DirectConversation(
        company_id=info["company_id"],
        project_id=info["project_id"],
        kind="direct",
        created_by=info["member_user_id"],
    )
    db_session.add(conversation)
    await db_session.flush()
    db_session.add(DirectConversationMember(conversation_id=conversation.id, user_id=info["member_user_id"]))
    await db_session.commit()

    denied = await async_client.post(
        f"/api/v1/conversations/{conversation.id}/summaries",
        headers=info["outsider_headers"],
        json={},
    )
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_call_session_recording_transcription_and_summary(async_client, db_session, seed_ids, monkeypatch):
    info = seed_ids
    conversation = DirectConversation(
        company_id=info["company_id"],
        project_id=info["project_id"],
        kind="group",
        created_by=info["member_user_id"],
    )
    db_session.add(conversation)
    await db_session.flush()
    db_session.add_all([
        DirectConversationMember(conversation_id=conversation.id, user_id=info["member_user_id"]),
        DirectConversationMember(conversation_id=conversation.id, user_id=info["pm_user_id"]),
    ])
    await db_session.commit()

    started = await async_client.post(
        "/api/v1/calls/sessions",
        headers=info["member_headers"],
        json={"conversation_id": conversation.id, "call_type": "audio"},
    )
    assert started.status_code == 200, started.text
    session_id = started.json()["data"]["id"]

    uploaded = await async_client.post(
        f"/api/v1/calls/sessions/{session_id}/recordings",
        headers=info["member_headers"],
        files={"file": ("call.wav", b"fake-audio", "audio/wav")},
    )
    assert uploaded.status_code == 201, uploaded.text

    class FakeAsr:
        provider_id = "fake"

        async def transcribe(self, audio, mime, language="zh"):
            return "会议决定周五发布；待办：王宁确认上线窗口；风险：缺少验收材料。"

    async def resolve(*args, **kwargs):
        return FakeAsr()

    monkeypatch.setattr("app.api.v1.calls.AsrRouter.resolve", resolve)
    transcribed = await async_client.post(
        f"/api/v1/calls/sessions/{session_id}/transcribe",
        headers=info["member_headers"],
    )
    assert transcribed.status_code == 200, transcribed.text
    assert transcribed.json()["data"]["status"] == "completed"

    summarized = await async_client.post(
        f"/api/v1/calls/sessions/{session_id}/summarize",
        headers=info["member_headers"],
    )
    assert summarized.status_code == 200, summarized.text
    assert summarized.json()["data"]["provider"] == "deterministic"
    assert "周五" in summarized.json()["data"]["summary_text"]

    ended = await async_client.post(
        f"/api/v1/calls/sessions/{session_id}/end",
        headers=info["member_headers"],
        json={},
    )
    assert ended.status_code == 200
    assert ended.json()["data"]["status"] == "ended"
