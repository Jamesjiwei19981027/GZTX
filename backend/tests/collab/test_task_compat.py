import pytest


def test_task_has_collab_columns():
    from app.models.task import Task

    assert hasattr(Task, "origin")
    assert hasattr(Task, "project_node_id")
    assert hasattr(Task, "linked_readonly")


@pytest.mark.asyncio
async def test_linked_readonly_blocks_status(async_client, seed_ids, db_session):
    from app.core.security import get_password_hash
    from app.models.category import Category
    from app.models.task import Task
    from app.models.user import User
    from sqlalchemy import select

    # member has auth via seed; create personal category+task as member
    member_id = seed_ids["member_user_id"]
    cat = Category(user_id=member_id, name="工作", color="#000", is_default=True)
    db_session.add(cat)
    await db_session.flush()
    task = Task(
        user_id=member_id,
        category_id=cat.id,
        title="投影任务",
        origin="project_link",
        company_id=seed_ids["company_id"],
        project_id=seed_ids["project_id"],
        project_node_id=seed_ids["node_id"],
        linked_readonly=True,
        status=0,
    )
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)

    r = await async_client.put(
        f"/api/v1/tasks/{task.id}",
        json={"status": 2},
        headers=seed_ids["member_headers"],
    )
    assert r.status_code == 403
    assert r.json()["code"] == 40321
