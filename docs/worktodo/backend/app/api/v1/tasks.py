from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, and_
from typing import Optional, List
from datetime import datetime, date, timedelta, timezone
from app.core.dependencies import get_db, get_current_user
from app.models.user import User
from app.models.task import Task, TaskTag
from app.models.category import Category
from app.models.tag import Tag
from app.models.reminder import Reminder
from app.schemas.task import (
    TaskCreate, TaskUpdate, TaskResponse, TaskListResponse, TaskStatsResponse,
    CategoryBrief, TagBrief, ReminderSchema
)
from app.schemas.common import APIResponse

router = APIRouter(prefix="/tasks", tags=["任务"])

PRIORITY_LABELS = {0: "低", 1: "中", 2: "高"}
STATUS_LABELS = {0: "待办", 1: "进行中", 2: "已完成"}


def get_relative_date(due_date: datetime) -> str:
    """获取相对日期描述"""
    if not due_date:
        return ""
    now = datetime.now(timezone.utc)
    if due_date.tzinfo is None:
        due_date = due_date.replace(tzinfo=timezone.utc)
    delta = due_date - now
    if delta.days == 0:
        return "今天"
    elif delta.days == 1:
        return "明天"
    elif delta.days == -1:
        return "昨天"
    elif delta.days > 1:
        return f"{delta.days}天后"
    else:
        return f"{-delta.days}天前"


def is_overdue(due_date: datetime) -> bool:
    """检查是否逾期"""
    if not due_date:
        return False
    now = datetime.now(timezone.utc)
    if due_date.tzinfo is None:
        due_date = due_date.replace(tzinfo=timezone.utc)
    return due_date < now


def transform_task(task: Task) -> dict:
    """转换任务对象"""
    category_brief = None
    if task.category:
        category_brief = CategoryBrief(
            id=task.category.id,
            name=task.category.name,
            color=task.category.color
        )

    tags = []
    if task.tags:
        tags = [
            TagBrief(id=t.id, name=t.name, color=t.color)
            for t in task.tags
        ]

    reminders = []
    if task.reminders:
        reminders = [
            ReminderSchema(id=r.id, remind_at=r.remind_at, is_sent=r.is_sent)
            for r in task.reminders
        ]

    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "priority": task.priority,
        "priority_label": PRIORITY_LABELS.get(task.priority, ""),
        "status": task.status,
        "status_label": STATUS_LABELS.get(task.status, ""),
        "due_date": task.due_date,
        "due_date_relative": get_relative_date(task.due_date),
        "is_overdue": is_overdue(task.due_date),
        "category": category_brief,
        "tags": tags,
        "reminders": reminders,
        "is_recurring": task.is_recurring,
        "created_at": task.created_at,
        "completed_at": task.completed_at,
    }


@router.get("", response_model=APIResponse)
def get_tasks(
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
    include_deleted: bool = Query(False),
    sort_by: Optional[str] = "created_at",
    sort_order: str = Query("desc", regex="^(asc|desc)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取任务列表"""
    query = db.query(Task).filter(
        Task.user_id == current_user.id,
        Task.is_deleted == (True if include_deleted else False)
    )

    # 筛选
    if status is not None:
        query = query.filter(Task.status == status)
    if priority is not None:
        query = query.filter(Task.priority == priority)
    if category_id is not None:
        query = query.filter(Task.category_id == category_id)
    if is_recurring is not None:
        query = query.filter(Task.is_recurring == is_recurring)
    if due_date_from:
        query = query.filter(Task.due_date >= due_date_from)
    if due_date_to:
        query = query.filter(Task.due_date <= due_date_to)
    if search:
        query = query.filter(
            (Task.title.contains(search)) | (Task.description.contains(search))
        )

    # 标签筛选
    if tag_ids:
        tag_id_list = [int(t) for t in tag_ids.split(",")]
        query = query.join(TaskTag).filter(TaskTag.tag_id.in_(tag_id_list))

    # 排序
    sort_column = getattr(Task, sort_by, Task.created_at)
    if sort_order == "desc":
        query = query.order_by(sort_column.desc())
    else:
        query = query.order_by(sort_column.asc())

    # 总数
    total = query.count()

    # 分页
    tasks = query.offset((page - 1) * page_size).limit(page_size).all()

    # 转换
    items = [transform_task(t) for t in tasks]

    return APIResponse(
        code=200,
        message="success",
        data={
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size if page_size > 0 else 0
        }
    )


@router.get("/today", response_model=APIResponse)
def get_today_tasks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取今日待办"""
    today = date.today()
    tomorrow = today + timedelta(days=1)

    tasks = db.query(Task).filter(
        Task.user_id == current_user.id,
        Task.is_deleted == False,
        Task.status != 2,
        Task.due_date >= datetime.combine(today, datetime.min.time()),
        Task.due_date < datetime.combine(tomorrow, datetime.min.time())
    ).all()

    items = [transform_task(t) for t in tasks]

    return APIResponse(
        code=200,
        message="success",
        data={
            "items": items,
            "total": len(items),
            "page": 1,
            "page_size": len(items),
            "total_pages": 1
        }
    )


@router.get("/stats", response_model=APIResponse)
def get_task_stats(
    period: str = Query("today", regex="^(today|week|month|year)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取任务统计"""
    now = datetime.now(timezone.utc)
    if period == "today":
        start_date = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start_date = now - timedelta(days=now.weekday())
    elif period == "month":
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        start_date = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)

    # 基本统计
    base_query = db.query(Task).filter(
        Task.user_id == current_user.id,
        Task.is_deleted == False,
        Task.created_at >= start_date
    )

    total = base_query.count()
    completed = base_query.filter(Task.status == 2).count()
    pending = base_query.filter(Task.status == 0).count()
    in_progress = base_query.filter(Task.status == 1).count()
    overdue = base_query.filter(
        Task.status != 2,
        Task.due_date < now
    ).count()
    completion_rate = completed / total if total > 0 else 0.0

    # 按优先级统计
    by_priority = {}
    for p in [0, 1, 2]:
        p_total = base_query.filter(Task.priority == p).count()
        p_completed = base_query.filter(Task.priority == p, Task.status == 2).count()
        by_priority[PRIORITY_LABELS[p].lower()] = {"total": p_total, "completed": p_completed}

    # 按分类统计
    by_category = []
    categories = db.query(Category).filter(Category.user_id == current_user.id).all()
    for cat in categories:
        cat_total = base_query.filter(Task.category_id == cat.id).count()
        cat_completed = base_query.filter(Task.category_id == cat.id, Task.status == 2).count()
        by_category.append({
            "category_id": cat.id,
            "category_name": cat.name,
            "total": cat_total,
            "completed": cat_completed
        })

    return APIResponse(
        code=200,
        message="success",
        data={
            "total": total,
            "completed": completed,
            "pending": pending,
            "in_progress": in_progress,
            "overdue": overdue,
            "completion_rate": round(completion_rate, 2),
            "by_priority": by_priority,
            "by_category": by_category
        }
    )


@router.get("/{task_id}", response_model=APIResponse)
def get_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取任务详情"""
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.user_id == current_user.id,
        Task.is_deleted == False
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    return APIResponse(
        code=200,
        message="success",
        data=transform_task(task)
    )


@router.post("", response_model=APIResponse)
def create_task(
    data: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """创建任务"""
    # 验证分类
    category = db.query(Category).filter(
        Category.id == data.category_id,
        Category.user_id == current_user.id
    ).first()
    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")

    task = Task(
        user_id=current_user.id,
        category_id=data.category_id,
        title=data.title,
        description=data.description,
        priority=data.priority,
        due_date=data.due_date,
        is_recurring=data.is_recurring,
        recurrence_rule=data.recurrence_rule,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    # 添加标签
    if data.tag_ids:
        for tag_id in data.tag_ids:
            tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == current_user.id).first()
            if tag:
                task_tag = TaskTag(task_id=task.id, tag_id=tag_id)
                db.add(task_tag)

    # 添加提醒
    if data.reminders:
        for r in data.reminders:
            reminder = Reminder(
                task_id=task.id,
                user_id=current_user.id,
                remind_at=r.get("remind_at"),
                remind_type=r.get("remind_type", 0)
            )
            db.add(reminder)

    db.commit()
    db.refresh(task)

    return APIResponse(code=201, message="创建成功", data=transform_task(task))


@router.put("/{task_id}", response_model=APIResponse)
def update_task(
    task_id: int,
    data: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """更新任务"""
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.user_id == current_user.id,
        Task.is_deleted == False
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    if data.title is not None:
        task.title = data.title
    if data.description is not None:
        task.description = data.description
    if data.priority is not None:
        task.priority = data.priority
    if data.category_id is not None:
        task.category_id = data.category_id
    if data.due_date is not None:
        task.due_date = data.due_date
    if data.status is not None:
        task.status = data.status
    if data.is_recurring is not None:
        task.is_recurring = data.is_recurring
    if data.recurrence_rule is not None:
        task.recurrence_rule = data.recurrence_rule

    # 更新标签
    if data.tag_ids is not None:
        db.query(TaskTag).filter(TaskTag.task_id == task_id).delete()
        for tag_id in data.tag_ids:
            tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == current_user.id).first()
            if tag:
                task_tag = TaskTag(task_id=task.id, tag_id=tag_id)
                db.add(task_tag)

    db.commit()
    db.refresh(task)

    return APIResponse(code=200, message="更新成功", data=transform_task(task))


@router.patch("/{task_id}/complete", response_model=APIResponse)
def complete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """标记任务完成"""
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.user_id == current_user.id,
        Task.is_deleted == False
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    if task.status == 2:
        raise HTTPException(status_code=422, detail="任务已完成")

    task.status = 2
    task.completed_at = datetime.now(timezone.utc)
    db.commit()

    return APIResponse(
        code=200,
        message="success",
        data={"id": task.id, "status": task.status, "completed_at": task.completed_at}
    )


@router.patch("/{task_id}/uncomplete", response_model=APIResponse)
def uncomplete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """取消任务完成"""
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.user_id == current_user.id,
        Task.is_deleted == False
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    task.status = 0
    task.completed_at = None
    db.commit()

    return APIResponse(code=200, message="success", data={"id": task.id, "status": task.status})


@router.delete("/{task_id}", response_model=APIResponse)
def delete_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """删除任务"""
    task = db.query(Task).filter(
        Task.id == task_id,
        Task.user_id == current_user.id,
        Task.is_deleted == False
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    task.is_deleted = True
    task.deleted_at = datetime.now(timezone.utc)
    db.commit()

    return APIResponse(code=204, message="删除成功")


@router.patch("/batch/complete", response_model=APIResponse)
def batch_complete_tasks(
    task_ids: List[int],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """批量完成任务"""
    now = datetime.now(timezone.utc)
    db.query(Task).filter(
        Task.id.in_(task_ids),
        Task.user_id == current_user.id,
        Task.is_deleted == False
    ).update({Task.status: 2, Task.completed_at: now}, synchronize_session=False)
    db.commit()

    return APIResponse(code=200, message="批量完成成功")


@router.delete("/batch", response_model=APIResponse)
def batch_delete_tasks(
    task_ids: List[int],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """批量删除任务"""
    now = datetime.now(timezone.utc)
    db.query(Task).filter(
        Task.id.in_(task_ids),
        Task.user_id == current_user.id,
        Task.is_deleted == False
    ).update({Task.is_deleted: True, Task.deleted_at: now}, synchronize_session=False)
    db.commit()

    return APIResponse(code=204, message="批量删除成功")