import pytest


@pytest.mark.asyncio
async def test_task_chat_extraction_returns_editable_source_draft(async_client, seed_ids):
    response = await async_client.post(
        "/api/v1/tasks/extract-from-chat",
        headers=seed_ids["member_headers"],
        json={
            "chat_text": "请在 2030-08-15 前完成发布检查，内容很紧急。",
            "source_channel": "wechat",
            "source_title": "项目群",
            "source_url": "https://example.test/message/1",
            "company_id": seed_ids["company_id"],
            "project_id": seed_ids["project_id"],
        },
    )
    assert response.status_code == 200, response.text
    draft = response.json()["data"]["draft"]
    assert draft["title"]
    assert draft["source_channel"] == "wechat"
    assert draft["source_url"] == "https://example.test/message/1"
    assert draft["project_id"] == seed_ids["project_id"]


@pytest.mark.asyncio
async def test_push_subscription_is_database_backed(async_client, seed_ids):
    subscription = {
        "endpoint": "https://push.example.test/subscription-1",
        "keys": {"p256dh": "public", "auth": "auth"},
    }
    created = await async_client.post(
        "/api/v1/notifications/subscribe",
        headers=seed_ids["member_headers"],
        json=subscription,
    )
    assert created.status_code == 200, created.text
    listed = await async_client.get(
        "/api/v1/notifications/subscriptions",
        headers=seed_ids["member_headers"],
    )
    assert listed.status_code == 200
    assert listed.json()["data"]["subscriptions"][0]["endpoint"] == subscription["endpoint"]
    removed = await async_client.delete(
        "/api/v1/notifications/unsubscribe",
        headers=seed_ids["member_headers"],
        params={"endpoint": subscription["endpoint"]},
    )
    assert removed.status_code == 200


@pytest.mark.asyncio
async def test_direct_conversation_round_trip(async_client, seed_ids):
    created = await async_client.post(
        f"/api/v1/companies/{seed_ids['company_id']}/conversations",
        headers=seed_ids["member_headers"],
        json={"member_user_ids": [seed_ids["pm_user_id"]]},
    )
    assert created.status_code == 200, created.text
    conversation_id = created.json()["data"]["id"]
    posted = await async_client.post(
        f"/api/v1/conversations/{conversation_id}/messages",
        headers=seed_ids["member_headers"],
        json={"body": "direct hello", "attachments": [{"name": "brief.pdf", "url": "https://example.test/brief.pdf"}]},
    )
    assert posted.status_code == 200, posted.text
    messages = await async_client.get(
        f"/api/v1/conversations/{conversation_id}/messages",
        headers=seed_ids["member_headers"],
    )
    assert messages.status_code == 200
    item = messages.json()["data"]["items"][0]
    assert item["body"] == "direct hello"
    assert item["attachments"][0]["name"] == "brief.pdf"


@pytest.mark.asyncio
async def test_people_axis_aggregate_is_scoped_to_visible_projects(async_client, seed_ids):
    response = await async_client.get(
        "/api/v1/users/me/people-axis",
        headers=seed_ids["member_headers"],
    )
    assert response.status_code == 200, response.text
    projects = response.json()["data"]["projects"]
    assert any(item["project_id"] == seed_ids["project_id"] for item in projects)
    assert all("nodes" in item for item in projects)
    current = next(item for item in projects if item["project_id"] == seed_ids["project_id"])
    assert current["my_role"] == "member"
    assert current["final_owner_user_id"] == seed_ids["pm_user_id"]
    assert set(current["my_owned_node_ids"]) == {seed_ids["root_node_id"], seed_ids["node_id"]}


@pytest.mark.asyncio
async def test_people_axis_role_is_per_project(async_client, db_session, seed_ids):
    from app.models.project import Project, ProjectMember

    project = Project(company_id=seed_ids["company_id"], name="成员负责的另一项目",
                      created_by=seed_ids["member_user_id"], pm_user_id=seed_ids["member_user_id"])
    db_session.add(project)
    await db_session.flush()
    db_session.add(ProjectMember(project_id=project.id, user_id=seed_ids["member_user_id"], role="pm"))
    await db_session.commit()
    response = await async_client.get("/api/v1/users/me/people-axis", headers=seed_ids["member_headers"])
    assert response.status_code == 200, response.text
    by_id = {item["project_id"]: item for item in response.json()["data"]["projects"]}
    assert by_id[seed_ids["project_id"]]["my_role"] == "member"
    assert by_id[project.id]["my_role"] == "pm"
    assert by_id[project.id]["nodes"] == []


@pytest.mark.asyncio
async def test_people_axis_excludes_inactive_company_membership(async_client, db_session, seed_ids):
    from sqlalchemy import update
    from app.models.company import CompanyMembership

    await db_session.execute(update(CompanyMembership).where(
        CompanyMembership.company_id == seed_ids["company_id"],
        CompanyMembership.user_id == seed_ids["member_user_id"],
    ).values(status="suspended"))
    await db_session.commit()
    response = await async_client.get("/api/v1/users/me/people-axis", headers=seed_ids["member_headers"])
    assert response.status_code == 200, response.text
    assert response.json()["data"]["projects"] == []
