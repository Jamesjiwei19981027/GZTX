from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ReminderBase(BaseModel):
    task_id: int
    remind_at: datetime
    remind_type: int = 0


class ReminderCreate(ReminderBase):
    pass


class ReminderResponse(BaseModel):
    id: int
    task_id: int
    remind_at: datetime
    remind_type: int
    is_sent: bool
    sent_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ReminderTodayItem(BaseModel):
    id: int
    task_id: int
    task_title: str
    remind_at: datetime
    remind_type: int
    time_until: str


class ReminderTodayResponse(BaseModel):
    upcoming: list[ReminderTodayItem]
    sent_today: int
    total_today: int