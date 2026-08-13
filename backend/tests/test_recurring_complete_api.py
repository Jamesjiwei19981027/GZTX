"""异步 complete 端点接通重复任务：实例生成 / 幂等 / weekdays / 越权"""
from datetime import datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.security import get_password_hash
from app.models.category import Category
from app.models.tag import Tag
from app.models.task import Task
from app.models.user import User


async def _make_template(
    db_session,
    user_id: int,
    *,
    rule: dict,
    due: datetime,
    tags: list | None = None,
) -> Task:
    cat = Category(user_id=user_id, name="默认", color="#409EFF", is_default=True)
    db_session.add(cat)
    await db_session.flush()
    task = Task(
        user_id=user_id,
        category_id=cat.id,
        title="每日站会",
        description="10 分钟同步",
        priority=2,
        due_date=due,
        is_recurring=True,
        recurrence_rule=rule,
    )
    if tags:
        task.tags = tags
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)
    return task


@pytest.mark.asyncio
async def test_complete_recurring_template_creates_next_instance(
    client: AsyncClient, auth_headers, test_user, db_session
):
    tag = Tag(user_id=test_user.id, name="例行", color="#67C23A")
    db_session.add(tag)
    await db_session.flush()
    template = await _make_template(
        db_session,
        test_user.id,
        rule={"frequency": "daily", "interval": 1},
        due=datetime(2026, 8, 13, 9, 30, 0),
        tags=[tag],
    )

    r = await client.patch(
        f"/api/v1/tasks/{template.id}/complete", headers=auth_headers, json={}
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["status"] == 2
    assert data["is_recurring"] is True
    assert data["recurrence_rule"] == {"frequency": "daily", "interval": 1}
    assert data["parent_task_id"] is None

    nxt = data["next_instance"]
    assert nxt is not None, "完成重复模板必须返回下一实例"
    assert nxt["parent_task_id"] == template.id
    assert nxt["status"] == 0
    assert nxt["title"] == "每日站会"
    assert nxt["description"] == "10 分钟同步"
    assert nxt["priority"] == 2
    assert nxt["is_recurring"] is False
    assert nxt["due_date"].startswith("2026-08-14T09:30:00"), "日期+1 且保留原时刻"
    assert [t["name"] for t in nxt["tags"]] == ["例行"]

    row = await db_session.get(Task, nxt["id"])
    assert row is not None and row.parent_task_id == template.id


@pytest.mark.asyncio
async def test_create_with_string_rule_then_complete_spawns_next(
    client: AsyncClient, auth_headers, test_user, db_session
):
    """Web 端全链路回归：recurrence_rule 以字符串（"daily"）从创建 API 进来，
    完成后照样生成下一实例。此前 schema 只声明 dict，字符串会被 422 挡在门口。"""
    cat = Category(user_id=test_user.id, name="默认S", color="#409EFF", is_default=True)
    db_session.add(cat)
    await db_session.commit()

    r = await client.post(
        "/api/v1/tasks",
        headers=auth_headers,
        json={
            "title": "每周周报",
            "priority": 1,
            "status": 0,
            "due_date": "2026-08-14T17:00:00",
            "is_recurring": True,
            "recurrence_rule": "weekly",
        },
    )
    assert r.status_code in (200, 201), r.text
    created = r.json()["data"]
    assert created["is_recurring"] is True
    assert created["recurrence_rule"] == "weekly"

    r2 = await client.patch(
        f"/api/v1/tasks/{created['id']}/complete", headers=auth_headers, json={}
    )
    assert r2.status_code == 200, r2.text
    nxt = r2.json()["data"]["next_instance"]
    assert nxt is not None
    assert nxt["due_date"].startswith("2026-08-21T17:00:00"), "weekly：+7 天保留时刻"


@pytest.mark.asyncio
async def test_complete_recurring_is_idempotent(
    client: AsyncClient, auth_headers, test_user, db_session
):
    """同模板同日期重复 complete 不得重复建实例。"""
    template = await _make_template(
        db_session,
        test_user.id,
        rule={"frequency": "daily", "interval": 1},
        due=datetime(2026, 8, 13, 9, 0, 0),
    )

    r1 = await client.patch(
        f"/api/v1/tasks/{template.id}/complete", headers=auth_headers, json={}
    )
    r2 = await client.patch(
        f"/api/v1/tasks/{template.id}/complete", headers=auth_headers, json={}
    )
    assert r1.status_code == 200 and r2.status_code == 200
    assert (
        r1.json()["data"]["next_instance"]["id"]
        == r2.json()["data"]["next_instance"]["id"]
    ), "幂等：第二次返回同一实例"

    instances = (
        await db_session.execute(
            select(Task).where(Task.parent_task_id == template.id)
        )
    ).scalars().all()
    assert len(instances) == 1


@pytest.mark.asyncio
async def test_complete_weekdays_rule_skips_weekend(
    client: AsyncClient, auth_headers, test_user, db_session
):
    # 2026-08-14 是周五 → 下一工作日为周一 2026-08-17
    template = await _make_template(
        db_session,
        test_user.id,
        rule={"frequency": "weekdays"},
        due=datetime(2026, 8, 14, 18, 0, 0),
    )

    r = await client.patch(
        f"/api/v1/tasks/{template.id}/complete", headers=auth_headers, json={}
    )
    assert r.status_code == 200, r.text
    nxt = r.json()["data"]["next_instance"]
    assert nxt["due_date"].startswith("2026-08-17T18:00:00")


@pytest.mark.asyncio
async def test_complete_instance_does_not_spawn_again(
    client: AsyncClient, auth_headers, test_user, db_session
):
    template = await _make_template(
        db_session,
        test_user.id,
        rule={"frequency": "daily", "interval": 1},
        due=datetime(2026, 8, 13, 9, 0, 0),
    )
    instance = Task(
        user_id=test_user.id,
        category_id=template.category_id,
        title="每日站会",
        due_date=datetime(2026, 8, 14, 9, 0, 0),
        is_recurring=False,
        parent_task_id=template.id,
    )
    db_session.add(instance)
    await db_session.commit()
    await db_session.refresh(instance)

    r = await client.patch(
        f"/api/v1/tasks/{instance.id}/complete", headers=auth_headers, json={}
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["next_instance"] is None

    children = (
        await db_session.execute(
            select(Task).where(Task.parent_task_id == instance.id)
        )
    ).scalars().all()
    assert children == []


@pytest.mark.asyncio
async def test_complete_with_follow_up_does_not_spawn(
    client: AsyncClient, auth_headers, test_user, db_session
):
    template = await _make_template(
        db_session,
        test_user.id,
        rule={"frequency": "daily", "interval": 1},
        due=datetime(2026, 8, 13, 9, 0, 0),
    )

    r = await client.patch(
        f"/api/v1/tasks/{template.id}/complete",
        headers=auth_headers,
        json={"needs_follow_up": True, "follow_up_reason": "还没做完"},
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["status"] == 0, "需要跟进时不标记完成"
    assert data["next_instance"] is None

    children = (
        await db_session.execute(
            select(Task).where(Task.parent_task_id == template.id)
        )
    ).scalars().all()
    assert children == []


@pytest.mark.asyncio
async def test_complete_others_recurring_task_rejected(
    client: AsyncClient, auth_headers, db_session
):
    other = User(
        username="recurring-other",
        email="recurring-other@example.com",
        password_hash=get_password_hash("password123"),
        is_active=True,
    )
    db_session.add(other)
    await db_session.flush()
    template = await _make_template(
        db_session,
        other.id,
        rule={"frequency": "daily", "interval": 1},
        due=datetime(2026, 8, 13, 9, 0, 0),
    )

    r = await client.patch(
        f"/api/v1/tasks/{template.id}/complete", headers=auth_headers, json={}
    )
    assert r.status_code == 404
