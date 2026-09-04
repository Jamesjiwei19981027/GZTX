"""被指派人任务可见性：读路径 owner OR assignee，写路径仍 owner-only。"""
import io

import pytest

from app.models.category import Category


async def _category(db_session, user_id: int) -> int:
    category = Category(
        user_id=user_id,
        name=f"visibility-{user_id}",
        color="#409EFF",
        is_default=True,
    )
    db_session.add(category)
    await db_session.flush()
    await db_session.commit()
    return category.id


def _data(response):
    body = response.json()
    return body.get("data", body)


async def _create_project_task(async_client, db_session, seed_ids) -> int:
    category_id = await _category(db_session, seed_ids["pm_user_id"])
    created = await async_client.post(
        "/api/v1/tasks",
        headers=seed_ids["pm_headers"],
        json={
            "title": "指派给成员的项目任务",
            "category_id": category_id,
            "origin": "project_link",
            "company_id": seed_ids["company_id"],
            "project_id": seed_ids["project_id"],
            "assignee_user_ids": [seed_ids["member_user_id"]],
        },
    )
    assert created.status_code == 201, created.text
    return _data(created)["id"]


@pytest.mark.asyncio
async def test_assignee_sees_task_in_list_and_detail(
    async_client, db_session, seed_ids
):
    task_id = await _create_project_task(async_client, db_session, seed_ids)

    listed = await async_client.get(
        "/api/v1/tasks", headers=seed_ids["member_headers"]
    )
    assert listed.status_code == 200, listed.text
    ids = [item["id"] for item in _data(listed)["items"]]
    assert task_id in ids

    detail = await async_client.get(
        f"/api/v1/tasks/{task_id}", headers=seed_ids["member_headers"]
    )
    assert detail.status_code == 200, detail.text
    assert _data(detail)["id"] == task_id


@pytest.mark.asyncio
async def test_outsider_cannot_see_task(async_client, db_session, seed_ids):
    task_id = await _create_project_task(async_client, db_session, seed_ids)

    detail = await async_client.get(
        f"/api/v1/tasks/{task_id}", headers=seed_ids["outsider_headers"]
    )
    assert detail.status_code == 404, detail.text

    listed = await async_client.get(
        "/api/v1/tasks", headers=seed_ids["outsider_headers"]
    )
    assert listed.status_code == 200
    assert task_id not in [item["id"] for item in _data(listed)["items"]]


@pytest.mark.asyncio
async def test_assignee_cannot_update_or_delete(async_client, db_session, seed_ids):
    task_id = await _create_project_task(async_client, db_session, seed_ids)

    updated = await async_client.put(
        f"/api/v1/tasks/{task_id}",
        headers=seed_ids["member_headers"],
        json={"title": "越权改名"},
    )
    assert updated.status_code == 404, updated.text

    deleted = await async_client.delete(
        f"/api/v1/tasks/{task_id}", headers=seed_ids["member_headers"]
    )
    assert deleted.status_code == 404, deleted.text


@pytest.mark.asyncio
async def test_assignee_can_read_task_attachments(async_client, db_session, seed_ids):
    task_id = await _create_project_task(async_client, db_session, seed_ids)

    uploaded = await async_client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        headers=seed_ids["pm_headers"],
        files={"file": ("note.txt", io.BytesIO("附件内容".encode("utf-8")), "text/plain")},
    )
    assert uploaded.status_code == 201, uploaded.text
    attachment_id = _data(uploaded)["id"]

    listed = await async_client.get(
        f"/api/v1/tasks/{task_id}/attachments",
        headers=seed_ids["member_headers"],
    )
    assert listed.status_code == 200, listed.text
    assert [a["id"] for a in _data(listed)] == [attachment_id]

    content = await async_client.get(
        f"/api/v1/attachments/{attachment_id}/content",
        headers=seed_ids["member_headers"],
    )
    assert content.status_code == 200, content.text
    assert _data(content)["is_text"] is True

    # 无关用户不可见
    outsider_list = await async_client.get(
        f"/api/v1/tasks/{task_id}/attachments",
        headers=seed_ids["outsider_headers"],
    )
    assert outsider_list.status_code == 404, outsider_list.text
    outsider_content = await async_client.get(
        f"/api/v1/attachments/{attachment_id}/content",
        headers=seed_ids["outsider_headers"],
    )
    assert outsider_content.status_code == 404, outsider_content.text
