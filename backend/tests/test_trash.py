"""回收站：列表 / 恢复 / 越权 / 30 天物理清理"""
from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.security import create_access_token, get_password_hash
from app.models.category import Category
from app.models.reminder import Reminder
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


async def _make_other_user(db_session) -> User:
    other = User(
        username="trash-other",
        email="trash-other@example.com",
        password_hash=get_password_hash("password123"),
        is_active=True,
    )
    db_session.add(other)
    await db_session.commit()
    await db_session.refresh(other)
    return other


@pytest.mark.asyncio
async def test_trash_lists_only_own_deleted_tasks_with_deleted_at(
    client: AsyncClient, auth_headers, test_user, db_session
):
    cat = await _make_category(db_session, test_user.id)
    other = await _make_other_user(db_session)
    other_cat = Category(user_id=other.id, name="别人的", color="#000", is_default=True)
    db_session.add(other_cat)
    await db_session.flush()

    deleted_at = datetime.utcnow() - timedelta(days=1)
    mine_deleted = Task(
        user_id=test_user.id,
        category_id=cat.id,
        title="我删的",
        is_deleted=True,
        deleted_at=deleted_at,
    )
    mine_alive = Task(user_id=test_user.id, category_id=cat.id, title="没删的")
    others_deleted = Task(
        user_id=other.id,
        category_id=other_cat.id,
        title="别人删的",
        is_deleted=True,
        deleted_at=deleted_at,
    )
    db_session.add_all([mine_deleted, mine_alive, others_deleted])
    await db_session.commit()

    r = await client.get("/api/v1/tasks/trash", headers=auth_headers)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["total"] == 1
    assert len(data["items"]) == 1
    item = data["items"][0]
    assert item["title"] == "我删的"
    assert item["is_deleted"] is True
    assert item["deleted_at"] is not None


@pytest.mark.asyncio
async def test_trash_requires_auth(client: AsyncClient):
    r = await client.get("/api/v1/tasks/trash")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_delete_then_trash_then_restore_roundtrip(
    client: AsyncClient, auth_headers, test_user, db_session
):
    """软删写入 deleted_at；恢复返回完整序列化任务并回到列表。"""
    cat = await _make_category(db_session, test_user.id)
    task = Task(
        user_id=test_user.id, category_id=cat.id, title="回收站往返", description="desc"
    )
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)

    r = await client.delete(f"/api/v1/tasks/{task.id}", headers=auth_headers)
    assert r.status_code == 200

    r = await client.get("/api/v1/tasks/trash", headers=auth_headers)
    items = r.json()["data"]["items"]
    assert [t["id"] for t in items] == [task.id]
    assert items[0]["deleted_at"] is not None, "软删必须写入 deleted_at"

    r = await client.post(f"/api/v1/tasks/{task.id}/restore", headers=auth_headers)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["is_deleted"] is False
    assert data["deleted_at"] is None
    assert data["title"] == "回收站往返"
    assert data["description"] == "desc"
    assert data["category"]["id"] == cat.id

    r = await client.get("/api/v1/tasks", headers=auth_headers)
    assert any(t["id"] == task.id for t in r.json()["data"]["items"])
    r = await client.get("/api/v1/tasks/trash", headers=auth_headers)
    assert r.json()["data"]["total"] == 0


@pytest.mark.asyncio
async def test_restore_rejects_other_users_task(
    client: AsyncClient, auth_headers, test_user, db_session
):
    other = await _make_other_user(db_session)
    other_cat = Category(user_id=other.id, name="别人的", color="#000", is_default=True)
    db_session.add(other_cat)
    await db_session.flush()
    task = Task(
        user_id=other.id,
        category_id=other_cat.id,
        title="别人删的",
        is_deleted=True,
        deleted_at=datetime.utcnow(),
    )
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)

    r = await client.post(f"/api/v1/tasks/{task.id}/restore", headers=auth_headers)
    assert r.status_code == 404, "别人的任务不可恢复"

    await db_session.refresh(task)
    assert task.is_deleted is True


@pytest.mark.asyncio
async def test_restore_rejects_task_not_in_trash(
    client: AsyncClient, auth_headers, test_user, db_session
):
    cat = await _make_category(db_session, test_user.id)
    task = Task(user_id=test_user.id, category_id=cat.id, title="没删过")
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)

    r = await client.post(f"/api/v1/tasks/{task.id}/restore", headers=auth_headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_purge_removes_tasks_older_than_30_days(test_user, db_session):
    from app.services.trash_service import purge_soft_deleted_tasks

    cat = await _make_category(db_session, test_user.id)
    old = Task(
        user_id=test_user.id,
        category_id=cat.id,
        title="过期软删",
        is_deleted=True,
        deleted_at=datetime.utcnow() - timedelta(days=31),
    )
    recent = Task(
        user_id=test_user.id,
        category_id=cat.id,
        title="近期软删",
        is_deleted=True,
        deleted_at=datetime.utcnow() - timedelta(days=5),
    )
    alive = Task(user_id=test_user.id, category_id=cat.id, title="活着")
    db_session.add_all([old, recent, alive])
    await db_session.flush()
    # 附属数据 + 子任务引用一并处理
    db_session.add(
        Reminder(task_id=old.id, user_id=test_user.id, remind_at=datetime.utcnow())
    )
    child = Task(
        user_id=test_user.id,
        category_id=cat.id,
        title="旧模板的实例",
        parent_task_id=old.id,
    )
    db_session.add(child)
    await db_session.commit()
    old_id, child_id = old.id, child.id

    purged = await purge_soft_deleted_tasks(db_session)
    await db_session.commit()
    assert purged == 1

    remaining_ids = set(
        (await db_session.execute(select(Task.id))).scalars().all()
    )
    assert old_id not in remaining_ids
    assert {recent.id, alive.id, child_id} <= remaining_ids

    child_row = await db_session.get(Task, child_id)
    await db_session.refresh(child_row)  # 批量 update 不同步 identity map，需刷新
    assert child_row.parent_task_id is None, "被清理模板的子任务引用应断开"

    reminders = (await db_session.execute(select(Reminder))).scalars().all()
    assert reminders == [], "附属提醒应随任务一并物理删除"
