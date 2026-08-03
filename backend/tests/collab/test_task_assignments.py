"""Task assignee persistence and project ACL regression tests."""

import pytest

from app.models.category import Category


async def _category(db_session, user_id: int) -> int:
    category = Category(
        user_id=user_id,
        name=f"assignment-{user_id}",
        color="#409EFF",
        is_default=True,
    )
    db_session.add(category)
    await db_session.flush()
    return category.id


def _data(response):
    body = response.json()
    return body.get("data", body)


@pytest.mark.asyncio
async def test_personal_task_defaults_to_creator_as_primary(async_client, db_session, seed_ids):
    category_id = await _category(db_session, seed_ids["member_user_id"])
    response = await async_client.post(
        "/api/v1/tasks",
        headers=seed_ids["member_headers"],
        json={"title": "personal assignment default", "category_id": category_id},
    )

    assert response.status_code == 201, response.text
    task = _data(response)
    assert task["assignees"] == [
        {
            "user_id": seed_ids["member_user_id"],
            "role_key": "primary",
            "display_name": "member_user",
            "nickname": "member_user",
            "username": "member_user",
            "avatar_url": None,
        }
    ]
    assert task["assignee"]["user_id"] == seed_ids["member_user_id"]


@pytest.mark.asyncio
async def test_personal_task_cannot_assign_another_user(async_client, db_session, seed_ids):
    category_id = await _category(db_session, seed_ids["member_user_id"])
    response = await async_client.post(
        "/api/v1/tasks",
        headers=seed_ids["member_headers"],
        json={
            "title": "personal assignment ACL",
            "category_id": category_id,
            "assignee_user_ids": [seed_ids["pm_user_id"]],
        },
    )

    assert response.status_code == 403, response.text


@pytest.mark.asyncio
async def test_project_task_accepts_active_project_members_and_deduplicates(
    async_client, db_session, seed_ids
):
    category_id = await _category(db_session, seed_ids["pm_user_id"])
    response = await async_client.post(
        "/api/v1/tasks",
        headers=seed_ids["pm_headers"],
        json={
            "title": "project assignment",
            "category_id": category_id,
            "origin": "project_link",
            "company_id": seed_ids["company_id"],
            "project_id": seed_ids["project_id"],
            "assignee_user_ids": [
                seed_ids["member_user_id"],
                seed_ids["member_user_id"],
                seed_ids["pm_user_id"],
            ],
        },
    )

    assert response.status_code == 201, response.text
    task = _data(response)
    assert [a["user_id"] for a in task["assignees"]] == [
        seed_ids["member_user_id"],
        seed_ids["pm_user_id"],
    ]
    assert [a["role_key"] for a in task["assignees"]] == ["primary", "collaborator"]
    assert task["assignee"]["user_id"] == seed_ids["member_user_id"]


@pytest.mark.asyncio
async def test_project_task_rejects_non_project_member(async_client, db_session, seed_ids):
    category_id = await _category(db_session, seed_ids["pm_user_id"])
    response = await async_client.post(
        "/api/v1/tasks",
        headers=seed_ids["pm_headers"],
        json={
            "title": "project assignment ACL",
            "category_id": category_id,
            "origin": "project_link",
            "company_id": seed_ids["company_id"],
            "project_id": seed_ids["project_id"],
            "assignee_user_ids": [seed_ids["outsider_user_id"]],
        },
    )

    assert response.status_code == 403, response.text


@pytest.mark.asyncio
async def test_update_task_replaces_assignments_and_can_clear_project_task(
    async_client, db_session, seed_ids
):
    category_id = await _category(db_session, seed_ids["pm_user_id"])
    created = await async_client.post(
        "/api/v1/tasks",
        headers=seed_ids["pm_headers"],
        json={
            "title": "project assignment update",
            "category_id": category_id,
            "origin": "project_link",
            "company_id": seed_ids["company_id"],
            "project_id": seed_ids["project_id"],
            "assignee_user_ids": [seed_ids["member_user_id"]],
        },
    )
    assert created.status_code == 201, created.text
    task_id = _data(created)["id"]

    updated = await async_client.put(
        f"/api/v1/tasks/{task_id}",
        headers=seed_ids["pm_headers"],
        json={"assignee_user_ids": []},
    )

    assert updated.status_code == 200, updated.text
    assert _data(updated)["assignees"] == []
    assert _data(updated)["assignee"] is None
