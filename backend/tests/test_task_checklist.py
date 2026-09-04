"""tasks.checklist 轻量子任务：创建/更新/回读全链路"""
import pytest


async def _make_category(client, auth_headers) -> int:
    res = await client.post(
        "/api/v1/categories",
        headers=auth_headers,
        json={"name": "checklist-cat", "color": "#409EFF"},
    )
    assert res.status_code in (200, 201), res.text
    body = res.json()
    return (body.get("data") or body)["id"]


def _data(response):
    body = response.json()
    return body.get("data", body)


@pytest.mark.asyncio
async def test_checklist_roundtrip_create_update_get(client, auth_headers):
    category_id = await _make_category(client, auth_headers)

    created = await client.post(
        "/api/v1/tasks",
        headers=auth_headers,
        json={
            "title": "带子任务的任务",
            "category_id": category_id,
            "checklist": [
                {"id": "st-1", "title": "第一步", "completed": False},
                {"id": "st-2", "title": "第二步", "completed": True},
            ],
        },
    )
    assert created.status_code == 201, created.text
    task = _data(created)
    assert [item["title"] for item in task["checklist"]] == ["第一步", "第二步"]
    assert [item["completed"] for item in task["checklist"]] == [False, True]

    task_id = task["id"]

    updated = await client.put(
        f"/api/v1/tasks/{task_id}",
        headers=auth_headers,
        json={
            "checklist": [
                {"id": "st-1", "title": "第一步", "completed": True},
            ]
        },
    )
    assert updated.status_code == 200, updated.text
    assert _data(updated)["checklist"] == [
        {"id": "st-1", "title": "第一步", "completed": True}
    ]

    fetched = await client.get(f"/api/v1/tasks/{task_id}", headers=auth_headers)
    assert fetched.status_code == 200, fetched.text
    assert _data(fetched)["checklist"] == [
        {"id": "st-1", "title": "第一步", "completed": True}
    ]


@pytest.mark.asyncio
async def test_checklist_absent_stays_null_and_not_required(client, auth_headers):
    category_id = await _make_category(client, auth_headers)

    created = await client.post(
        "/api/v1/tasks",
        headers=auth_headers,
        json={"title": "无子任务", "category_id": category_id},
    )
    assert created.status_code == 201, created.text
    assert _data(created)["checklist"] in (None, [])

    # 更新其他字段不应清掉 checklist 语义（exclude_unset）
    task_id = _data(created)["id"]
    updated = await client.put(
        f"/api/v1/tasks/{task_id}",
        headers=auth_headers,
        json={"title": "无子任务-改名"},
    )
    assert updated.status_code == 200, updated.text
    assert _data(updated)["checklist"] in (None, [])


@pytest.mark.asyncio
async def test_checklist_rejects_blank_title_and_overflow(client, auth_headers):
    category_id = await _make_category(client, auth_headers)

    blank = await client.post(
        "/api/v1/tasks",
        headers=auth_headers,
        json={
            "title": "非法子任务",
            "category_id": category_id,
            "checklist": [{"id": "x", "title": "   ", "completed": False}],
        },
    )
    assert blank.status_code == 422, blank.text

    overflow = await client.post(
        "/api/v1/tasks",
        headers=auth_headers,
        json={
            "title": "子任务过多",
            "category_id": category_id,
            "checklist": [
                {"id": f"i{i}", "title": f"步骤{i}", "completed": False}
                for i in range(101)
            ],
        },
    )
    assert overflow.status_code == 422, overflow.text
