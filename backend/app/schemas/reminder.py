from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


class ReminderBase(BaseModel):
    """Base reminder schema."""
    task_id: int
    remind_at: datetime
    remind_type: int = 0  # 0=before, 1=on_time, 2=overdue, 3=custom
    notify_channels: str = "web_push"  # email,sms,web_push,desktop,wx,app


class ReminderCreate(ReminderBase):
    """Schema for creating a reminder."""
    pass


class ReminderUpdate(BaseModel):
    """Schema for updating a reminder."""
    remind_at: Optional[datetime] = None
    remind_type: Optional[int] = None
    notify_channels: Optional[str] = None


class ReminderResponse(BaseModel):
    """Schema for reminder response."""
    id: int
    task_id: int
    remind_at: datetime
    remind_type: int
    notify_channels: str
    is_sent: bool
    sent_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ReminderBriefResponse(BaseModel):
    """Schema for brief reminder response (nested in tasks)."""
    id: int
    remind_at: datetime
    remind_type: int
    notify_channels: str
    is_sent: bool

    class Config:
        from_attributes = True