import pytest


@pytest.mark.asyncio
async def test_agent_quota_and_wechat_tool_ban(async_client, seed_ids):
    # create 5 agents ok, 6th 40902
    for i in range(5):
        r = await async_client.post(
            "/api/v1/agents",
            json={
                "company_id": seed_ids["company_id"],
                "name": f"agent-{i}",
            },
            headers=seed_ids["member_headers"],
        )
        assert r.json()["code"] == 200, r.text

    r6 = await async_client.post(
        "/api/v1/agents",
        json={"company_id": seed_ids["company_id"], "name": "agent-x"},
        headers=seed_ids["member_headers"],
    )
    assert r6.status_code == 409
    assert r6.json()["code"] == 40902

    chat = await async_client.post(
        "/api/v1/agents/chat",
        json={
            "company_id": seed_ids["company_id"],
            "project_id": seed_ids["project_id"],
            "channel": "wechat",
            "message": "更新一下说明文字内容足够长",
        },
        headers=seed_ids["member_headers"],
    )
    assert chat.json()["code"] == 200
    assert chat.json()["data"]["tool_submit_evidence_allowed"] is False


def test_authorize_tool_wechat():
    from app.services.agent_runtime import AgentRuntime

    rt = AgentRuntime()
    assert rt.authorize_tool(channel="web", tool_name="submit_evidence") is True
    assert rt.authorize_tool(channel="wechat", tool_name="submit_evidence") is False


@pytest.mark.asyncio
async def test_tool_get_node_and_send_notify_confirm(db_session, seed_ids):
    from app.services.agent_runtime import AgentRuntime

    rt = AgentRuntime()
    r = await rt.invoke_tool(
        db_session,
        channel="web",
        tool_name="get_node",
        args={"node_id": seed_ids["node_id"]},
        user_id=seed_ids["member_user_id"],
        company_id=seed_ids["company_id"],
        session_project_id=seed_ids["project_id"],
    )
    assert r["ok"] is True
    assert r["data"]["id"] == seed_ids["node_id"]

    # outsider / missing auth context
    no_auth = await rt.invoke_tool(
        db_session,
        channel="web",
        tool_name="get_node",
        args={"node_id": seed_ids["node_id"]},
    )
    assert no_auth["ok"] is False

    need = await rt.invoke_tool(
        db_session,
        channel="web",
        tool_name="send_notify",
        args={"user_ids": [1]},
        confirmed=False,
        user_id=seed_ids["member_user_id"],
        company_id=seed_ids["company_id"],
    )
    assert need.get("need_confirmation") is True

    ok = await rt.invoke_tool(
        db_session,
        channel="web",
        tool_name="send_notify",
        args={"user_ids": [1]},
        confirmed=True,
        user_id=seed_ids["member_user_id"],
        company_id=seed_ids["company_id"],
    )
    assert ok["ok"] is True


@pytest.mark.asyncio
async def test_chat_tool_slash(async_client, seed_ids):
    r = await async_client.post(
        "/api/v1/agents/chat",
        json={
            "company_id": seed_ids["company_id"],
            "project_id": seed_ids["project_id"],
            "channel": "web",
            "message": f"/tool get_node node_id={seed_ids['node_id']}",
        },
        headers=seed_ids["member_headers"],
    )
    assert r.status_code == 200
    assert "get_node" in r.json()["data"]["reply"]
