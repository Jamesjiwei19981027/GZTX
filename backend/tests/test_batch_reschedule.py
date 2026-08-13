"""批量顺延：日期替换保留时刻 / 只读投影跳过 / 越权与未授权"""
from datetime import datetime

import pytest
from httpx import AsyncClient

from app.core.security import get_password_hash
from app.models.category import Category
from app.models.task import Task
from app.models.user import User


async def _make_category(db_session, user_id: int) -> Category:
    category = Category(
        user_id=user_id, name="默认", color="#409EFF", sort_order=0, is_default=True
    )
    db_session.add(category)
    await db_session.commit()
    await db_session.refresh(category)
    return category


@pytest.mark.asyncio
async def test_batch_reschedule_replaces_date_keeps_time(
    client: AsyncClient, auth_headers, test_user, db_session
):
    cat = await _make_category(db_session, test_user.id)
    with_time = Task(
        user_id=test_user.id,
        category_id=cat.id,
        title="有时刻",
        due_date=datetime(2026, 8, 1, 14, 30, 0),
    )
    without_due = Task(user_id=test_user.id, category_id=cat.id, title="无截止")
    db_session.add_all([with_time, without_due])
    await db_session.commit()
    await db_session.refresh(with_time)
    await db_session.refresh(without_due)

    r = await client.patch(
        "/api/v1/tasks/batch/reschedule",
        headers=auth_headers,
        json={"task_ids": [with_time.id, without_due.id], "due_date": "2026-08-20"},
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["updated_count"] == 2
    assert data["skipped_readonly"] == 0

    await db_session.refresh(with_time)
    await db_session.refresh(without_due)
    assert with_time.due_date == datetime(2026, 8, 20, 14, 30, 0), "原时刻必须保留"
    assert without_due.due_date == datetime(2026, 8, 20, 0, 0, 0)


@pytest.mark.asyncio
async def test_batch_reschedule_skips_readonly_projection(
    client: AsyncClient, auth_headers, test_user, db_session
):
    cat = await _make_category(db_session, test_user.id)
    normal = Task(
        user_id=test_user.id,
        category_id=cat.id,
        title="普通任务",
        due_date=datetime(2026, 8, 1, 9, 0, 0),
    )
    readonly = Task(
        user_id=test_user.id,
        category_id=cat.id,
        title="项目投影",
        origin="project_link",
        linked_readonly=True,
        due_date=datetime(2026, 8, 1, 9, 0, 0),
    )
    db_session.add_all([normal, readonly])
    await db_session.commit()
    await db_session.refresh(normal)
    await db_session.refresh(readonly)

    r = await client.patch(
        "/api/v1/tasks/batch/reschedule",
        headers=auth_headers,
        json={"task_ids": [normal.id, readonly.id], "due_date": "2026-09-01"},
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["updated_count"] == 1
    assert data["skipped_readonly"] == 1

    await db_session.refresh(normal)
    await db_session.refresh(readonly)
    assert normal.due_date.date().isoformat() == "2026-09-01"
    assert readonly.due_date == datetime(2026, 8, 1, 9, 0, 0), "只读投影不得被改"


@pytest.mark.asyncio
async def test_batch_reschedule_ignores_deleted_and_other_users_tasks(
    client: AsyncClient, auth_headers, test_user, db_session
):
    cat = await _make_category(db_session, test_user.id)
    other = User(
        username="reschedule-other",
        email="reschedule-other@example.com",
        password_hash=get_password_hash("password123"),
        is_active=True,
    )
    db_session.add(other)
    await db_session.flush()
    other_cat = Category(user_id=other.id, name="别人的", color="#000", is_default=True)
    db_session.add(other_cat)
    await db_session.flush()

    others_task = Task(
        user_id=other.id,
        category_id=other_cat.id,
        title="别人的任务",
        due_date=datetime(2026, 8, 1, 9, 0, 0),
    )
    deleted_task = Task(
        user_id=test_user.id,
        category_id=cat.id,
        title="已删任务",
        is_deleted=True,
        deleted_at=datetime.utcnow(),
        due_date=datetime(2026, 8, 1, 9, 0, 0),
    )
    db_session.add_all([others_task, deleted_task])
    await db_session.commit()
    await db_session.refresh(others_task)
    await db_session.refresh(deleted_task)

    r = await client.patch(
        "/api/v1/tasks/batch/reschedule",
        headers=auth_headers,
        json={"task_ids": [others_task.id, deleted_task.id], "due_date": "2026-09-01"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["updated_count"] == 0

    await db_session.refresh(others_task)
    await db_session.refresh(deleted_task)
    assert others_task.due_date == datetime(2026, 8, 1, 9, 0, 0)
    assert deleted_task.due_date == datetime(2026, 8, 1, 9, 0, 0)


@pytest.mark.asyncio
async def test_batch_reschedule_requires_auth(client: AsyncClient):
    r = await client.patch(
        "/api/v1/tasks/batch/reschedule",
        json={"task_ids": [1], "due_date": "2026-09-01"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_batch_reschedule_rejects_bad_date(client: AsyncClient, auth_headers):
    r = await client.patch(
        "/api/v1/tasks/batch/reschedule",
        headers=auth_headers,
        json={"task_ids": [1], "due_date": "not-a-date"},
    )
    assert r.status_code == 422
