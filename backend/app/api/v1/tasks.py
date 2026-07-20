"""
任务相关接口
"""
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload

from app.core.dependencies import CurrentUser, DbSession
from app.core.collab_errors import fail
from app.models.task import Task
from app.models.category import Category
from app.models.tag import Tag, task_tags
from app.models.reminder import Reminder
from app.schemas.task import (
    TaskCreate,
    TaskUpdate,
    TaskResponse,
    TaskComplete,
    TaskStatsResponse,
    PriorityStat,
    CategoryStat,
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
    needs_follow_up: Optional[bool] = None,
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
    if needs_follow_up:
        query = query.where(Task.needs_follow_up == True)
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

    # 按时间范围筛选 — 统一用 naive UTC，与 SQLite func.now()/server_default 一致
    # （勿用 date.today() 本地日界：UTC 库时会把「今天」任务滤成 0）
    from datetime import timedelta

    now = datetime.utcnow()
    if period == "today":
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        query = query.where(Task.created_at >= today_start)
    elif period == "week":
        week_ago = now - timedelta(days=7)
        query = query.where(Task.created_at >= week_ago)
    elif period == "month":
        month_ago = now - timedelta(days=30)
        query = query.where(Task.created_at >= month_ago)
    elif period == "year":
        year_ago = now - timedelta(days=365)
        query = query.where(Task.created_at >= year_ago)

    result = await db.execute(query)
    tasks = result.scalars().all()

    total = len(tasks)
    completed = sum(1 for t in tasks if t.status == Task.STATUS_DONE)
    pending = sum(1 for t in tasks if t.status == Task.STATUS_TODO)
    in_progress = sum(1 for t in tasks if t.status == Task.STATUS_IN_PROGRESS)
    # 确保 due_date 比较时两者都是 naive datetime
    overdue = sum(
        1 for t in tasks
        if t.due_date and t.due_date < now and t.status != Task.STATUS_DONE
    )

    # 按优先级统计
    by_priority = {
        "high": PriorityStat(
            total=sum(1 for t in tasks if t.priority == 2),
            completed=sum(1 for t in tasks if t.priority == 2 and t.status == Task.STATUS_DONE),
        ).model_dump(),
        "medium": PriorityStat(
            total=sum(1 for t in tasks if t.priority == 1),
            completed=sum(1 for t in tasks if t.priority == 1 and t.status == Task.STATUS_DONE),
        ).model_dump(),
        "low": PriorityStat(
            total=sum(1 for t in tasks if t.priority == 0),
            completed=sum(1 for t in tasks if t.priority == 0 and t.status == Task.STATUS_DONE),
        ).model_dump(),
    }

    # 按分类统计
    cat_map = {}  # {category_id: {"name": str, "total": int, "completed": int}}
    for t in tasks:
        cid = t.category_id
        if cid not in cat_map:
            cat_map[cid] = {"name": "", "total": 0, "completed": 0}
        cat_map[cid]["total"] += 1
        if t.status == Task.STATUS_DONE:
            cat_map[cid]["completed"] += 1

    # 查询分类名称
    if cat_map:
        cat_ids = [cid for cid in cat_map.keys() if cid is not None]
        if cat_ids:
            cat_result = await db.execute(
                select(Category.id, Category.name).where(Category.id.in_(cat_ids))
            )
            for cid, cname in cat_result.all():
                if cid in cat_map:
                    cat_map[cid]["name"] = cname

    # 处理无分类的任务
    by_category = []
    for cid, info in cat_map.items():
        by_category.append(CategoryStat(
            category_id=cid,
            category_name=info["name"] if info["name"] else "未分类",
            total=info["total"],
            completed=info["completed"],
        ))

    return ResponseData(
        data=TaskStatsResponse(
            total=total,
            completed=completed,
            pending=pending,
            in_progress=in_progress,
            overdue=overdue,
            completion_rate=completed / total if total > 0 else 0.0,
            by_priority=by_priority,
            by_category=by_category,
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

    # SQLite 不支持时区信息，转换为 naive datetime
    due_date_val = data.due_date
    if due_date_val and due_date_val.tzinfo is not None:
        due_date_val = due_date_val.replace(tzinfo=None)

    task = Task(
        user_id=user.id,
        category_id=category_id,
        title=data.title,
        description=data.description,
        priority=data.priority,
        due_date=due_date_val,
        is_recurring=data.is_recurring,
        recurrence_rule=data.recurrence_rule,
    )
    db.add(task)
    await db.flush()

    # 添加标签
    if data.tag_ids:
        result = await db.execute(select(Tag).where(Tag.id.in_(data.tag_ids), Tag.user_id == user.id))
        tags = result.scalars().all()
        # 先异步加载 tags 关系，避免赋值时触发同步懒加载导致 MissingGreenlet
        await db.refresh(task, ["tags"])
        task.tags = list(tags)

    # 添加提醒
    if data.reminders:
        for r in data.reminders:
            # SQLite 不支持时区信息，转换为 naive datetime 避免 MissingGreenlet 错误
            remind_at = r.remind_at
            if remind_at and remind_at.tzinfo is not None:
                remind_at = remind_at.replace(tzinfo=None)

            reminder = Reminder(
                task_id=task.id,
                user_id=user.id,
                remind_at=remind_at,
                remind_type=r.remind_type,
                notify_channels=r.notify_channels,
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

    # 投影只读：禁止改 status
    if (
        getattr(task, "origin", "personal") == "project_link"
        and getattr(task, "linked_readonly", True)
        and "status" in update_data
        and update_data["status"] != task.status
    ):
        return fail(403, 40321, "项目投影待办不可直接修改状态，请通过材料/进度流程")

    # 处理标签更新
    tag_ids = update_data.pop("tag_ids", None)
    if tag_ids is not None:
        result = await db.execute(select(Tag).where(Tag.id.in_(tag_ids), Tag.user_id == user.id))
        # 先异步加载 tags 关系，避免赋值时触发同步懒加载导致 MissingGreenlet
        await db.refresh(task, ["tags"])
        task.tags = list(result.scalars().all())

    # 处理提醒更新：先删后建
    reminders_data = update_data.pop("reminders", None)
    if reminders_data is not None:
        # 删除旧提醒
        old_reminders = await db.execute(
            select(Reminder).where(Reminder.task_id == task.id)
        )
        for old_r in old_reminders.scalars().all():
            await db.delete(old_r)
        await db.flush()

        # 创建新提醒
        for r in reminders_data:
            remind_at = r.get("remind_at") if isinstance(r, dict) else r.remind_at
            remind_type = r.get("remind_type", 0) if isinstance(r, dict) else r.remind_type
            notify_channels = r.get("notify_channels") if isinstance(r, dict) else r.notify_channels

            # SQLite 不支持时区信息，转换为 naive datetime
            if remind_at and hasattr(remind_at, 'tzinfo') and remind_at.tzinfo is not None:
                remind_at = remind_at.replace(tzinfo=None)

            reminder = Reminder(
                task_id=task.id,
                user_id=user.id,
                remind_at=remind_at,
                remind_type=remind_type or 0,
                notify_channels=notify_channels,
            )
            db.add(reminder)

    # 更新其他字段
    for key, value in update_data.items():
        setattr(task, key, value)

    await db.flush()
    await db.refresh(task)  # 刷新所有列属性（包括 updated_at 等 onupdate 生成的值）
    await db.refresh(task, ["category", "tags", "reminders"])

    task_dict = TaskResponse.model_validate(task).model_dump()
    task_dict["priority_label"] = task.priority_label
    task_dict["status_label"] = task.status_label

    return ResponseData(data=task_dict)


@router.patch("/{task_id}/complete", response_model=ResponseData)
async def complete_task(task_id: int, data: TaskComplete, db: DbSession, user: CurrentUser):
    """标记任务完成（含完成评价）"""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == user.id)
    )
    task = result.scalar_one_or_none()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    if (
        getattr(task, "origin", "personal") == "project_link"
        and getattr(task, "linked_readonly", True)
    ):
        return fail(403, 40321, "项目投影待办不可直接标记完成")

    # 保存完成评价数据
    task.completion_rate = data.completion_rate
    task.completion_comment = data.completion_comment
    task.needs_follow_up = data.needs_follow_up

    if data.needs_follow_up:
        # 需要跟进：不标记为已完成，保留在未完成列表
        task.follow_up_reason = data.follow_up_reason

        # 处理时区：SQLite 不支持时区信息
        follow_up_remind_at = data.follow_up_remind_at
        if follow_up_remind_at and follow_up_remind_at.tzinfo is not None:
            follow_up_remind_at = follow_up_remind_at.replace(tzinfo=None)
        task.follow_up_remind_at = follow_up_remind_at
        task.follow_up_notify_channels = data.follow_up_notify_channels

        # 创建跟进提醒
        if follow_up_remind_at:
            reminder = Reminder(
                task_id=task.id,
                user_id=user.id,
                remind_at=follow_up_remind_at,
                remind_type=3,  # 3=跟进
                notify_channels=data.follow_up_notify_channels,
            )
            db.add(reminder)

        # 不修改 task.status，保持原状态（待办/进行中）
    else:
        # 不需要跟进：正常标记完成
        task.status = Task.STATUS_DONE
        task.completed_at = datetime.utcnow()

    await db.flush()
    await db.refresh(task)  # 刷新所有列属性（包括 updated_at 等 onupdate 生成的值）
    await db.refresh(task, ["category", "tags", "reminders"])

    task_dict = TaskResponse.model_validate(task).model_dump()
    task_dict["priority_label"] = task.priority_label
    task_dict["status_label"] = task.status_label

    return ResponseData(data=task_dict)


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
    task.deleted_at = datetime.utcnow()

    return ResponseData(message="删除成功")


@router.patch("/batch/complete", response_model=ResponseData)
async def batch_complete(data: BatchAction, db: DbSession, user: CurrentUser):
    """批量完成"""
    now = datetime.utcnow()
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
    now = datetime.utcnow()
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
