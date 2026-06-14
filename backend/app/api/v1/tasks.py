"""
任务相关接口
"""
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload

from app.core.dependencies import CurrentUser, DbSession
from app.models.task import Task
from app.models.category import Category
from app.models.tag import Tag, task_tags
from app.models.reminder import Reminder
from app.schemas.task import (
    TaskCreate,
    TaskUpdate,
    TaskResponse,
    TaskStatsResponse,
    BatchAction,
)
from app.schemas.common import ResponseData, PaginatedData

router = APIRouter(prefix="/tasks", tags=["任务"])


@router.get("", response_model=ResponseData)
async def get_tasks(
    db: DbSession,
    user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[int] = None,
    priority: Optional[int] = None,
    category_id: Optional[int] = None,
    tag_ids: Optional[str] = None,
    due_date_from: Optional[str] = None,
    due_date_to: Optional[str] = None,
    search: Optional[str] = None,
    is_recurring: Optional[bool] = None,
    include_deleted: bool = False,
    sort_by: str = "created_at",
    sort_order: str = "desc",
):
    """获取任务列表"""
    # 基础查询
    query = select(Task).where(Task.user_id == user.id)

    if not include_deleted:
        query = query.where(Task.is_deleted == False)

    # 筛选条件
    if status is not None:
        query = query.where(Task.status == status)
    if priority is not None:
        query = query.where(Task.priority == priority)
    if category_id is not None:
        query = query.where(Task.category_id == category_id)
    if is_recurring is not None:
        query = query.where(Task.is_recurring == is_recurring)
    if search:
        query = query.where(Task.title.ilike(f"%{search}%"))

    # 日期范围筛选
    if due_date_from:
        query = query.where(Task.due_date >= datetime.fromisoformat(due_date_from))
    if due_date_to:
        query = query.where(Task.due_date <= datetime.fromisoformat(due_date_to))

    # 标签筛选
    if tag_ids:
        ids = [int(x) for x in tag_ids.split(",")]
        query = query.join(task_tags).where(task_tags.c.tag_id.in_(ids))

    # 排序
    sort_column = getattr(Task, sort_by, Task.created_at)
    if sort_order == "asc":
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())

    # 计算总数
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # 分页
    query = query.offset((page - 1) * page_size).limit(page_size)
    query = query.options(
        selectinload(Task.category),
        selectinload(Task.tags),
        selectinload(Task.reminders),
    )

    result = await db.execute(query)
    tasks = result.scalars().all()

    # 构建响应
    task_responses = []
    for t in tasks:
        task_dict = TaskResponse.model_validate(t).model_dump()
        task_dict["priority_label"] = t.priority_label
        task_dict["status_label"] = t.status_label
        task_responses.append(task_dict)

    total_pages = (total + page_size - 1) // page_size

    return ResponseData(
        data=PaginatedData(
            items=task_responses,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )
    )


@router.get("/today", response_model=ResponseData)
async def get_today_tasks(
    db: DbSession,
    user: CurrentUser,
):
    """获取今日待办"""
    from datetime import date
    today = date.today()
    tomorrow = today + __import__("datetime").timedelta(days=1)

    query = (
        select(Task)
        .where(
            Task.user_id == user.id,
            Task.is_deleted == False,
            Task.due_date >= datetime.combine(today, datetime.min.time()),
            Task.due_date < datetime.combine(tomorrow, datetime.min.time()),
        )
        .options(
            selectinload(Task.category),
            selectinload(Task.tags),
            selectinload(Task.reminders),
        )
        .order_by(Task.priority.desc(), Task.due_date.asc())
    )

    result = await db.execute(query)
    tasks = result.scalars().all()

    task_responses = []
    for t in tasks:
        task_dict = TaskResponse.model_validate(t).model_dump()
        task_dict["priority_label"] = t.priority_label
        task_dict["status_label"] = t.status_label
        task_responses.append(task_dict)

    return ResponseData(data=task_responses)


@router.get("/stats", response_model=ResponseData)
async def get_task_stats(
    db: DbSession,
    user: CurrentUser,
    period: str = "today",
):
    """获取任务统计"""
    query = select(Task).where(Task.user_id == user.id, Task.is_deleted == False)

    # 按时间范围筛选
    now = datetime.now(timezone.utc)
    if period == "today":
        from datetime import date
        today = date.today()
        query = query.where(
            Task.created_at >= datetime.combine(today, datetime.min.time())
        )
    elif period == "week":
        from datetime import timedelta
        week_ago = now - timedelta(days=7)
        query = query.where(Task.created_at >= week_ago)
    elif period == "month":
        from datetime import timedelta
        month_ago = now - timedelta(days=30)
        query = query.where(Task.created_at >= month_ago)

    result = await db.execute(query)
    tasks = result.scalars().all()

    total = len(tasks)
    completed = sum(1 for t in tasks if t.status == Task.STATUS_DONE)
    pending = sum(1 for t in tasks if t.status == Task.STATUS_TODO)
    in_progress = sum(1 for t in tasks if t.status == Task.STATUS_IN_PROGRESS)
    overdue = sum(
        1 for t in tasks
        if t.due_date and t.due_date < now and t.status != Task.STATUS_DONE
    )

    return ResponseData(
        data=TaskStatsResponse(
            total=total,
            completed=completed,
            pending=pending,
            in_progress=in_progress,
            overdue=overdue,
            completion_rate=completed / total if total > 0 else 0.0,
        )
    )


@router.get("/{task_id}", response_model=ResponseData)
async def get_task(task_id: int, db: DbSession, user: CurrentUser):
    """获取任务详情"""
    query = (
        select(Task)
        .where(Task.id == task_id, Task.user_id == user.id)
        .options(
            selectinload(Task.category),
            selectinload(Task.tags),
            selectinload(Task.reminders),
        )
    )
    result = await db.execute(query)
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    task_dict = TaskResponse.model_validate(task).model_dump()
    task_dict["priority_label"] = task.priority_label
    task_dict["status_label"] = task.status_label

    return ResponseData(data=task_dict)


@router.post("", response_model=ResponseData, status_code=status.HTTP_201_CREATED)
async def create_task(data: TaskCreate, db: DbSession, user: CurrentUser):
    """创建任务"""
    # 获取默认分类
    if data.category_id is None:
        result = await db.execute(
            select(Category).where(
                Category.user_id == user.id,
                Category.is_default == True,
            )
        )
        default_cat = result.scalar_one_or_none()
        category_id = default_cat.id if default_cat else None
    else:
        category_id = data.category_id

    task = Task(
        user_id=user.id,
        category_id=category_id,
        title=data.title,
        description=data.description,
        priority=data.priority,
        due_date=data.due_date,
        is_recurring=data.is_recurring,
        recurrence_rule=data.recurrence_rule,
    )
    db.add(task)
    await db.flush()

    # 添加标签
    if data.tag_ids:
        result = await db.execute(select(Tag).where(Tag.id.in_(data.tag_ids), Tag.user_id == user.id))
        tags = result.scalars().all()
        task.tags = list(tags)

    # 添加提醒
    if data.reminders:
        for r in data.reminders:
            reminder = Reminder(
                task_id=task.id,
                user_id=user.id,
                remind_at=r.remind_at,
                remind_type=r.remind_type,
            )
            db.add(reminder)

    await db.flush()

    # 重新加载关联数据
    await db.refresh(task, ["category", "tags", "reminders"])

    task_dict = TaskResponse.model_validate(task).model_dump()
    task_dict["priority_label"] = task.priority_label
    task_dict["status_label"] = task.status_label

    return ResponseData(data=task_dict)


@router.put("/{task_id}", response_model=ResponseData)
async def update_task(task_id: int, data: TaskUpdate, db: DbSession, user: CurrentUser):
    """更新任务"""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user.id)
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    update_data = data.model_dump(exclude_unset=True)

    # 处理标签更新
    tag_ids = update_data.pop("tag_ids", None)
    if tag_ids is not None:
        result = await db.execute(select(Tag).where(Tag.id.in_(tag_ids), Tag.user_id == user.id))
        task.tags = list(result.scalars().all())

    # 更新其他字段
    for key, value in update_data.items():
        setattr(task, key, value)

    await db.flush()
    await db.refresh(task, ["category", "tags", "reminders"])

    task_dict = TaskResponse.model_validate(task).model_dump()
    task_dict["priority_label"] = task.priority_label
    task_dict["status_label"] = task.status_label

    return ResponseData(data=task_dict)


@router.patch("/{task_id}/complete", response_model=ResponseData)
async def complete_task(task_id: int, db: DbSession, user: CurrentUser):
    """标记任务完成"""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user.id)
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    task.status = Task.STATUS_DONE
    task.completed_at = datetime.now(timezone.utc)

    return ResponseData(
        data={"id": task.id, "status": task.status, "completed_at": task.completed_at.isoformat()}
    )


@router.patch("/{task_id}/uncomplete", response_model=ResponseData)
async def uncomplete_task(task_id: int, db: DbSession, user: CurrentUser):
    """取消任务完成"""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user.id)
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    task.status = Task.STATUS_TODO
    task.completed_at = None

    return ResponseData(
        data={"id": task.id, "status": task.status, "completed_at": None}
    )


@router.delete("/{task_id}", response_model=ResponseData)
async def delete_task(task_id: int, db: DbSession, user: CurrentUser):
    """删除任务（软删除）"""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user.id)
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    task.is_deleted = True
    task.deleted_at = datetime.now(timezone.utc)

    return ResponseData(message="删除成功")


@router.patch("/batch/complete", response_model=ResponseData)
async def batch_complete(data: BatchAction, db: DbSession, user: CurrentUser):
    """批量完成"""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Task).where(
            Task.id.in_(data.task_ids),
            Task.user_id == user.id,
            Task.is_deleted == False,
        )
    )
    tasks = result.scalars().all()

    for task in tasks:
        task.status = Task.STATUS_DONE
        task.completed_at = now

    return ResponseData(data={"completed_count": len(tasks)})


@router.delete("/batch", response_model=ResponseData)
async def batch_delete(data: BatchAction, db: DbSession, user: CurrentUser):
    """批量删除"""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Task).where(
            Task.id.in_(data.task_ids),
            Task.user_id == user.id,
            Task.is_deleted == False,
        )
    )
    tasks = result.scalars().all()

    for task in tasks:
        task.is_deleted = True
        task.deleted_at = now

    return ResponseData(data={"deleted_count": len(tasks)})
