"""
提醒相关接口
"""
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DbSession
from app.models.reminder import Reminder
from app.models.task import Task
from app.schemas.task import ReminderCreate, ReminderResponse
from app.schemas.common import ResponseData

router = APIRouter(prefix="/reminders", tags=["提醒"])


@router.get("", response_model=ResponseData)
async def get_reminders(
    db: DbSession,
    user: CurrentUser,
    is_sent: Optional[bool] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
):
    """获取提醒列表"""
    query = select(Reminder).where(Reminder.user_id == user.id)

    if is_sent is not None:
        query = query.where(Reminder.is_sent == is_sent)
    if from_date:
        query = query.where(Reminder.remind_at >= datetime.fromisoformat(from_date))
    if to_date:
        query = query.where(Reminder.remind_at <= datetime.fromisoformat(to_date))

    query = query.order_by(Reminder.remind_at)

    result = await db.execute(query)
    reminders = result.scalars().all()

    return ResponseData(
        data=[ReminderResponse.model_validate(r).model_dump() for r in reminders]
    )


@router.post("", response_model=ResponseData, status_code=status.HTTP_201_CREATED)
async def create_reminder(data: ReminderCreate, db: DbSession, user: CurrentUser):
    """创建提醒"""
    # 此前这里硬编码 task_id=0（schema 里也没有该字段）：
    # 每条提醒都是指向不存在任务的孤儿，发送时取不到任务只能失败。
    task = (
        await db.execute(
            select(Task).where(
                Task.id == data.task_id,
                Task.user_id == user.id,
                Task.is_deleted.is_(False),
            )
        )
    ).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    reminder = Reminder(
        task_id=task.id,
        user_id=user.id,
        remind_at=data.remind_at,
        remind_type=data.remind_type,
        notify_channels=data.notify_channels or "web_push",
    )
    db.add(reminder)
    await db.flush()

    return ResponseData(data=ReminderResponse.model_validate(reminder).model_dump())


@router.delete("/{reminder_id}", response_model=ResponseData)
async def delete_reminder(reminder_id: int, db: DbSession, user: CurrentUser):
    """删除提醒"""
    result = await db.execute(
        select(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == user.id)
    )
    reminder = result.scalar_one_or_none()

    if not reminder:
        raise HTTPException(status_code=404, detail="提醒不存在")

    await db.delete(reminder)

    return ResponseData(message="删除成功")


@router.get("/today", response_model=ResponseData)
async def get_today_reminders(db: DbSession, user: CurrentUser):
    """获取今日提醒概览"""
    from datetime import date, timedelta

    today = date.today()
    tomorrow = today + timedelta(days=1)

    query = select(Reminder).where(
        Reminder.user_id == user.id,
        Reminder.remind_at >= datetime.combine(today, datetime.min.time()),
        Reminder.remind_at < datetime.combine(tomorrow, datetime.min.time()),
    ).order_by(Reminder.remind_at)

    result = await db.execute(query)
    reminders = result.scalars().all()

    upcoming = []
    for r in reminders:
        if not r.is_sent:
            # 获取关联任务标题
            task_result = await db.execute(select(Task).where(Task.id == r.task_id))
            task = task_result.scalar_one_or_none()
            upcoming.append({
                "id": r.id,
                "task_id": r.task_id,
                "task_title": task.title if task else "未知任务",
                "remind_at": r.remind_at.isoformat(),
                "remind_type": r.remind_type,
            })

    sent_today = sum(1 for r in reminders if r.is_sent)

    return ResponseData(
        data={
            "upcoming": upcoming,
            "sent_today": sent_today,
            "total_today": len(reminders),
        }
    )
