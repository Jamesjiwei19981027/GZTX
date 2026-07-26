import pytest
from httpx import AsyncClient

from app.models.category import Category
from app.models.task import Task


async def _make_category(db_session, user_id: int) -> Category:
    category = Category(
        user_id=user_id,
        name="工作",
        color="#409EFF",
        sort_order=0,
        is_default=True,
    )
    db_session.add(category)
    await db_session.commit()
    await db_session.refresh(category)
    return category


@pytest.mark.asyncio
async def test_create_task(client: AsyncClient, auth_headers, test_user, db_session):
    category = await _make_category(db_session, test_user.id)

    response = await client.post(
        "/api/v1/tasks",
        headers=auth_headers,
        json={
            "title": "完成项目文档",
            "description": "编写API接口文档",
            "priority": 2,
            "category_id": category.id,
            "due_date": "2026-05-28T18:00:00+08:00",
        },
    )
    assert response.status_code in (200, 201)
    data = response.json()
    assert data["code"] == 200
    assert data["data"]["title"] == "完成项目文档"
    assert data["data"]["priority"] == 2
    assert data["data"]["status"] == 0
    assert data["data"].get("origin", "personal") == "personal"


@pytest.mark.asyncio
async def test_get_tasks(client: AsyncClient, auth_headers, test_user, db_session):
    category = await _make_category(db_session, test_user.id)
    task = Task(
        user_id=test_user.id,
        category_id=category.id,
        title="测试任务",
        priority=1,
    )
    db_session.add(task)
    await db_session.commit()

    response = await client.get("/api/v1/tasks", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 200
    assert len(data["data"]["items"]) == 1
    assert data["data"]["items"][0]["title"] == "测试任务"


@pytest.mark.asyncio
async def test_update_task(client: AsyncClient, auth_headers, test_user, db_session):
    category = await _make_category(db_session, test_user.id)
    task = Task(
        user_id=test_user.id,
        category_id=category.id,
        title="原始标题",
        priority=1,
    )
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)

    response = await client.put(
        f"/api/v1/tasks/{task.id}",
        headers=auth_headers,
        json={"title": "更新后的标题", "priority": 2},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["title"] == "更新后的标题"
    assert data["data"]["priority"] == 2


@pytest.mark.asyncio
async def test_complete_task(client: AsyncClient, auth_headers, test_user, db_session):
    category = await _make_category(db_session, test_user.id)
    task = Task(
        user_id=test_user.id,
        category_id=category.id,
        title="待完成任务",
        priority=1,
    )
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)

    response = await client.patch(
        f"/api/v1/tasks/{task.id}/complete",
        headers=auth_headers,
        json={},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["status"] == 2
    assert data["data"]["completed_at"] is not None


@pytest.mark.asyncio
async def test_delete_task(client: AsyncClient, auth_headers, test_user, db_session):
    category = await _make_category(db_session, test_user.id)
    task = Task(
        user_id=test_user.id,
        category_id=category.id,
        title="待删除任务",
        priority=1,
    )
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)

    response = await client.delete(f"/api/v1/tasks/{task.id}", headers=auth_headers)
    assert response.status_code == 200

    list_response = await client.get("/api/v1/tasks", headers=auth_headers)
    tasks = list_response.json()["data"]["items"]
    assert not any(t["id"] == task.id for t in tasks)


@pytest.mark.asyncio
async def test_get_task_stats(client: AsyncClient, auth_headers, test_user, db_session):
    category = await _make_category(db_session, test_user.id)
    db_session.add(
        Task(user_id=test_user.id, category_id=category.id, title="a", priority=1, status=0)
    )
    db_session.add(
        Task(user_id=test_user.id, category_id=category.id, title="b", priority=2, status=2)
    )
    await db_session.commit()

    response = await client.get("/api/v1/tasks/stats", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 200
    assert data["data"]["total"] >= 2


@pytest.mark.asyncio
async def test_status_filter_accepts_multiple_values(
    client: AsyncClient, db_session, test_user, auth_headers
):
    """?status=0&status=1 表示"未完成"。

    此前 status 是 Optional[int]，重复传只有一个生效，小程序待办列表
    因此把"进行中"的任务全漏掉了。
    """
    from app.models.category import Category
    from app.models.task import Task

    cat = Category(user_id=test_user.id, name="默认", color="#409EFF", is_default=True)
    db_session.add(cat)
    await db_session.flush()
    for title, st in (("待办", 0), ("进行中", 1), ("已完成", 2)):
        db_session.add(
            Task(user_id=test_user.id, category_id=cat.id, title=title, status=st)
        )
    await db_session.commit()

    r = await client.get(
        "/api/v1/tasks?status=0&status=1&page_size=50", headers=auth_headers
    )
    assert r.status_code == 200, r.text
    titles = {t["title"] for t in r.json()["data"]["items"]}
    assert titles == {"待办", "进行中"}, titles

    # 单值老用法保持等价
    r2 = await client.get("/api/v1/tasks?status=2", headers=auth_headers)
    assert {t["title"] for t in r2.json()["data"]["items"]} == {"已完成"}


@pytest.mark.asyncio
async def test_stats_completion_rate_is_percentage(
    client: AsyncClient, db_session, test_user, auth_headers
):
    """completion_rate 必须是 0-100 百分数。

    此前返回 completed/total 的 0-1 比率，而 Web 用 Math.round、APP 用
    toStringAsFixed(0) 直接当百分数展示——2/7 显示成 0%，进度环永远是空的。
    """
    from app.models.category import Category
    from app.models.task import Task

    cat = Category(user_id=test_user.id, name="默认", color="#409EFF", is_default=True)
    db_session.add(cat)
    await db_session.flush()
    for i in range(4):
        db_session.add(
            Task(
                user_id=test_user.id,
                category_id=cat.id,
                title=f"T{i}",
                status=2 if i < 1 else 0,
            )
        )
    await db_session.commit()

    r = await client.get("/api/v1/tasks/stats", headers=auth_headers)
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["total"] == 4 and d["completed"] == 1
    assert d["completion_rate"] == 25.0, d["completion_rate"]
