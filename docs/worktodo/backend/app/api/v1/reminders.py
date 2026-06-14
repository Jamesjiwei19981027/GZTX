from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, date, timedelta, timezone
from app.core.dependencies import get_db, get_current_user
from app.models.user import User
from app.models.reminder import Reminder
from app.models.task import Task
from app.schemas.reminder import ReminderCreate, ReminderResponse, ReminderTodayResponse, ReminderTodayItem
from app.schemas.common import APIResponse

router = APIRouter(prefix="/reminders", tags=["提醒"])


def get_time_until(remind_at: datetime) -> str:
    """获取距离提醒时间的描述"""
    now = datetime.now(timezone.utc)
    if remind_at.tzinfo is None:
        remind_at = remind_at.replace(tzinfo=timezone.utc)
    delta = remind_at - now
    total_seconds = int(delta.total_seconds())
    if total_seconds < 0:
        return "已过期"
    elif total_seconds < 60:
        return "即将提醒"
    elif total_seconds < 3600:
        return f"{total_seconds // 60}分钟后"
    elif total_seconds < 86400:
        return f"{total_seconds // 3600}小时后"
    else:
        return f"{total_seconds // 86400}天后"


@router.get("", response_model=APIResponse)
def get_reminders(
    is_sent: Optional[bool] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取提醒列表"""
    query = db.query(Reminder).filter(Reminder.user_id == current_user.id)

    if is_sent is not None:
        query = query.filter(Reminder.is_sent == is_sent)
    if from_date:
        query = query.filter(Reminder.remind_at >= from_date)
    if to_date:
        query = query.filter(Reminder.remind_at <= to_date)

    reminders = query.order_by(Reminder.remind_at).all()

    items = []
    for r in reminders:
        task = db.query(Task).filter(Task.id == r.task_id).first()
        items.append({
            "id": r.id,
            "task_id": r.task_id,
            "task_title": task.title if task else "已删除任务",
            "remind_at": r.remind_at,
            "remind_type": r.remind_type,
            "is_sent": r.is_sent,
            "sent_at": r.sent_at,
            "created_at": r.created_at
        })

    return APIResponse(code=200, message="success", data=items)


@router.post("", response_model=APIResponse)
def create_reminder(
    data: ReminderCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """创建提醒"""
    # 验证任务存在且属于当前用户
    task = db.query(Task).filter(
        Task.id == data.task_id,
        Task.user_id == current_user.id,
        Task.is_deleted == False
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    reminder = Reminder(
        task_id=data.task_id,
        user_id=current_user.id,
        remind_at=data.remind_at,
        remind_type=data.remind_type
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)

    return APIResponse(code=201, message="创建成功", data={
        "id": reminder.id,
        "task_id": reminder.task_id,
        "remind_at": reminder.remind_at,
        "remind_type": reminder.remind_type,
        "is_sent": reminder.is_sent,
        "created_at": reminder.created_at
    })


@router.delete("/{reminder_id}", response_model=APIResponse)
def delete_reminder(
    reminder_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """删除提醒"""
    reminder = db.query(Reminder).filter(
        Reminder.id == reminder_id,
        Reminder.user_id == current_user.id
    ).first()

    if not reminder:
        raise HTTPException(status_code=404, detail="提醒不存在")

    db.delete(reminder)
    db.commit()

    return APIResponse(code=204, message="删除成功")


@router.get("/today", response_model=APIResponse)
def get_today_reminders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取今日提醒概览"""
    today = date.today()
    tomorrow = today + timedelta(days=1)
    now = datetime.now(timezone.utc)

    # 获取今天的提醒
    reminders = db.query(Reminder).filter(
        Reminder.user_id == current_user.id,
        Reminder.remind_at >= datetime.combine(today, datetime.min.time()),
        Reminder.remind_at < datetime.combine(tomorrow, datetime.min.time())
    ).order_by(Reminder.remind_at).all()

    upcoming = []
    for r in reminders:
        task = db.query(Task).filter(Task.id == r.task_id, Task.is_deleted == False).first()
        if task:
            upcoming.append(ReminderTodayItem(
                id=r.id,
                task_id=r.task_id,
                task_title=task.title,
                remind_at=r.remind_at,
                remind_type=r.remind_type,
                time_until=get_time_until(r.remind_at)
            ))

    # 统计今天已发送和总数
    sent_today = db.query(Reminder).filter(
        Reminder.user_id == current_user.id,
        Reminder.is_sent == True,
        Reminder.sent_at >= datetime.combine(today, datetime.min.time())
    ).count()

    total_today = len(reminders)

    return APIResponse(
        code=200,
        message="success",
        data={
            "upcoming": [item.model_dump() for item in upcoming],
            "sent_today": sent_today,
            "total_today": total_today
        }
    )