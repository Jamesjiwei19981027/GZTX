import pytest
from httpx import AsyncClient

from app.models.user import User
from app.models.category import Category
from app.models.task import Task


@pytest.mark.asyncio
async def test_create_task(client: AsyncClient, auth_headers, test_user, db_session):
    """Test task creation."""
    # Create a category first
    category = Category(
        user_id=test_user.id,
        name="工作",
        color="#409EFF",
        sort_order=0,
        is_default=True
    )
    db_session.add(category)
    db_session.commit()
    db_session.refresh(category)

    response = await client.post(
        "/api/v1/tasks",
        headers=auth_headers,
        json={
            "title": "完成项目文档",
            "description": "编写API接口文档",
            "priority": 2,
            "category_id": category.id,
            "due_date": "2026-05-28T18:00:00+08:00"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 200
    assert data["data"]["title"] == "完成项目文档"
    assert data["data"]["priority"] == 2
    assert data["data"]["status"] == 0


@pytest.mark.asyncio
async def test_get_tasks(client: AsyncClient, auth_headers, test_user, db_session):
    """Test getting task list."""
    # Create a category and task
    category = Category(
        user_id=test_user.id,
        name="工作",
        color="#409EFF",
        sort_order=0,
        is_default=True
    )
    db_session.add(category)
    db_session.commit()
    db_session.refresh(category)

    task = Task(
        user_id=test_user.id,
        category_id=category.id,
        title="测试任务",
        priority=1
    )
    db_session.add(task)
    db_session.commit()

    response = await client.get(
        "/api/v1/tasks",
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 200
    assert len(data["data"]["items"]) == 1
    assert data["data"]["items"][0]["title"] == "测试任务"


@pytest.mark.asyncio
async def test_update_task(client: AsyncClient, auth_headers, test_user, db_session):
    """Test task update."""
    # Create category and task
    category = Category(
        user_id=test_user.id,
        name="工作",
        color="#409EFF",
        sort_order=0,
        is_default=True
    )
    db_session.add(category)
    db_session.commit()
    db_session.refresh(category)

    task = Task(
        user_id=test_user.id,
        category_id=category.id,
        title="原始标题",
        priority=1
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    response = await client.put(
        f"/api/v1/tasks/{task.id}",
        headers=auth_headers,
        json={
            "title": "更新后的标题",
            "priority": 2
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["title"] == "更新后的标题"
    assert data["data"]["priority"] == 2


@pytest.mark.asyncio
async def test_complete_task(client: AsyncClient, auth_headers, test_user, db_session):
    """Test task completion."""
    category = Category(
        user_id=test_user.id,
        name="工作",
        color="#409EFF",
        sort_order=0,
        is_default=True
    )
    db_session.add(category)
    db_session.commit()
    db_session.refresh(category)

    task = Task(
        user_id=test_user.id,
        category_id=category.id,
        title="待完成任务",
        priority=1
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    response = await client.patch(
        f"/api/v1/tasks/{task.id}/complete",
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["status"] == 2
    assert data["data"]["completed_at"] is not None


@pytest.mark.asyncio
async def test_delete_task(client: AsyncClient, auth_headers, test_user, db_session):
    """Test task deletion (soft delete)."""
    category = Category(
        user_id=test_user.id,
        name="工作",
        color="#409EFF",
        sort_order=0,
        is_default=True
    )
    db_session.add(category)
    db_session.commit()
    db_session.refresh(category)

    task = Task(
        user_id=test_user.id,
        category_id=category.id,
        title="待删除任务",
        priority=1
    )
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)

    response = await client.delete(
        f"/api/v1/tasks/{task.id}",
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "删除成功"

    # Verify task is soft deleted (not in normal query)
    list_response = await client.get(
        "/api/v1/tasks",
        headers=auth_headers
    )
    tasks = list_response.json()["data"]["items"]
    assert not any(t["id"] == task.id for t in tasks)


@pytest.mark.asyncio
async def test_get_task_stats(client: AsyncClient, auth_headers, test_user, db_session):
    """Test task statistics."""
    category = Category(
        user_id=test_user.id,
        name="工作",
        color="#409EFF",
        sort_order=0,
        is_default=True
    )
    db_session.add(category)
    db_session.commit()
    db_session.refresh(category)

    # Create some tasks
    for i in range(3):
        task = Task(
            user_id=test_user.id,
            category_id=category.id,
            title=f"任务{i+1}",
            priority=i % 3
        )
        db_session.add(task)
    db_session.commit()

    response = await client.get(
        "/api/v1/tasks/stats",
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 200
    assert data["data"]["total"] == 3