"""阶段 4：三端 due_date 契约（入参任意时区归一 UTC、出参带 Z）。

历史缺陷：入参只做 `replace(tzinfo=None)`，`2026-05-28T18:00+08:00` 会被当成
18:00 UTC 存下去（整体偏 8 小时）；出参又不带时区，客户端只能猜，
东八区用户在 08:00 前看到的日期整体偏一天。
"""
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient

from app.models.category import Category
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskResponse
from app.utils.datetime import to_naive_utc, to_utc_iso


async def _make_category(db_session, user_id: int) -> Category:
    category = Category(
        user_id=user_id, name="默认", color="#409EFF", sort_order=0, is_default=True
    )
    db_session.add(category)
    await db_session.commit()
    await db_session.refresh(category)
    return category


def test_to_naive_utc_converts_offset_instead_of_dropping_it():
    aware = datetime(2026, 5, 28, 18, 0, tzinfo=timezone.utc).astimezone(
        timezone.utc
    )
    assert to_naive_utc(aware) == datetime(2026, 5, 28, 18, 0)

    from datetime import timedelta

    plus8 = datetime(2026, 5, 28, 18, 0, tzinfo=timezone(timedelta(hours=8)))
    assert to_naive_utc(plus8) == datetime(2026, 5, 28, 10, 0), "+08:00 18:00 == 10:00Z"

    naive = datetime(2026, 5, 28, 18, 0)
    assert to_naive_utc(naive) == naive, "naive 视为已是 UTC"
    assert to_naive_utc(None) is None


def test_to_utc_iso_marks_zulu():
    assert to_utc_iso(datetime(2026, 5, 28, 10, 0)) == "2026-05-28T10:00:00Z"
    assert to_utc_iso(None) is None


def test_schema_normalizes_input_timezone():
    payload = TaskCreate(title="x", due_date="2026-05-28T18:00:00+08:00")
    assert payload.due_date == datetime(2026, 5, 28, 10, 0)
    assert payload.due_date.tzinfo is None, "落库值必须是 naive UTC"


def test_schema_serializes_with_zulu_suffix():
    dumped = TaskResponse(
        id=1, title="x", priority=1, status=0, due_date=datetime(2026, 5, 28, 10, 0)
    ).model_dump()
    assert dumped["due_date"] == "2026-05-28T10:00:00Z"


@pytest.mark.asyncio
async def test_create_task_converts_offset_and_returns_zulu(
    client: AsyncClient, auth_headers, test_user, db_session
):
    category = await _make_category(db_session, test_user.id)

    response = await client.post(
        "/api/v1/tasks",
        headers=auth_headers,
        json={
            "title": "东八区提交",
            "category_id": category.id,
            "due_date": "2026-05-28T18:00:00+08:00",
        },
    )
    assert response.status_code in (200, 201), response.text
    data = response.json()["data"]
    assert data["due_date"] == "2026-05-28T10:00:00Z", "+08:00 18:00 应换算成 10:00Z"

    task = await db_session.get(Task, data["id"])
    await db_session.refresh(task)
    assert to_naive_utc(task.due_date) == datetime(2026, 5, 28, 10, 0)


@pytest.mark.asyncio
async def test_naive_input_is_treated_as_utc(
    client: AsyncClient, auth_headers, test_user, db_session
):
    category = await _make_category(db_session, test_user.id)

    response = await client.post(
        "/api/v1/tasks",
        headers=auth_headers,
        json={
            "title": "naive 提交",
            "category_id": category.id,
            "due_date": "2026-05-28T10:00:00",
        },
    )
    assert response.status_code in (200, 201), response.text
    assert response.json()["data"]["due_date"] == "2026-05-28T10:00:00Z"


@pytest.mark.asyncio
async def test_reminder_input_offset_is_normalized(
    client: AsyncClient, auth_headers, test_user, db_session
):
    category = await _make_category(db_session, test_user.id)

    response = await client.post(
        "/api/v1/tasks",
        headers=auth_headers,
        json={
            "title": "带提醒",
            "category_id": category.id,
            "due_date": "2026-05-28T18:00:00+08:00",
            "reminders": [
                {
                    "task_id": 0,
                    "remind_at": "2026-05-28T17:45:00+08:00",
                    "remind_type": 0,
                }
            ],
        },
    )
    assert response.status_code in (200, 201), response.text
    reminders = response.json()["data"]["reminders"]
    assert reminders, "提醒应随任务一起创建"
    assert reminders[0]["remind_at"] == "2026-05-28T09:45:00Z"


@pytest.mark.asyncio
async def test_timestamps_carry_zulu_suffix(
    client: AsyncClient, auth_headers, test_user, db_session
):
    category = await _make_category(db_session, test_user.id)

    created = await client.post(
        "/api/v1/tasks",
        headers=auth_headers,
        json={"title": "时间戳", "category_id": category.id},
    )
    data = created.json()["data"]
    assert data["created_at"].endswith("Z"), data["created_at"]

    listed = await client.get("/api/v1/tasks", headers=auth_headers)
    items = listed.json()["data"]["items"]
    assert items and items[0]["created_at"].endswith("Z")
