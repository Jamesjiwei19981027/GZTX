"""Shared calendar periods and read visibility for homepage statistics."""
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import or_, select

from app.models.task import Task
from app.models.task_assignment import TaskAssignment


def statistics_window(period: str, timezone_offset: int, now: datetime | None = None):
    now = now or datetime.utcnow()
    offset = timedelta(minutes=timezone_offset)
    local_today = (now + offset).replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "today":
        local_start = local_today
    elif period == "week":
        local_start = local_today - timedelta(days=local_today.weekday())
    elif period == "month":
        local_start = local_today.replace(day=1)
    elif period == "quarter":
        local_start = local_today.replace(month=(local_today.month - 1) // 3 * 3 + 1, day=1)
    elif period == "year":
        local_start = local_today.replace(month=1, day=1)
    else:
        raise HTTPException(status_code=422, detail="无效统计周期")
    return local_start - offset, now, local_start, local_today


def statistics_query(user_id: int, project_id: int | None):
    # Same scope as the workbench: owned or assigned tasks, plus personal
    # tasks when a project is selected. Project selection never grants access.
    query = select(Task).where(
        Task.is_deleted.is_(False),
        or_(Task.user_id == user_id, Task.id.in_(
            select(TaskAssignment.task_id).where(TaskAssignment.user_id == user_id)
        )),
    )
    if project_id is not None:
        query = query.where(or_(Task.project_id == project_id, Task.project_id.is_(None)))
    return query
