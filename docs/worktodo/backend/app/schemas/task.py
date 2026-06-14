from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    priority: int = 1
    category_id: int
    due_date: Optional[datetime] = None


class TaskCreate(TaskBase):
    tag_ids: Optional[List[int]] = []
    reminders: Optional[List[dict]] = []
    is_recurring: bool = False
    recurrence_rule: Optional[dict] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[int] = None
    category_id: Optional[int] = None
    due_date: Optional[datetime] = None
    status: Optional[int] = None
    tag_ids: Optional[List[int]] = None
    is_recurring: Optional[bool] = None
    recurrence_rule: Optional[dict] = None


class ReminderSchema(BaseModel):
    id: int
    remind_at: datetime
    is_sent: bool

    class Config:
        from_attributes = True


class CategoryBrief(BaseModel):
    id: int
    name: str
    color: str

    class Config:
        from_attributes = True


class TagBrief(BaseModel):
    id: int
    name: str
    color: str

    class Config:
        from_attributes = True


class TaskResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    priority: int
    priority_label: str = ""
    status: int
    status_label: str = ""
    due_date: Optional[datetime] = None
    due_date_relative: Optional[str] = None
    is_overdue: bool = False
    category: Optional[CategoryBrief] = None
    tags: List[TagBrief] = []
    reminders: List[ReminderSchema] = []
    is_recurring: bool
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    items: List[TaskResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class TaskStatsPriority(BaseModel):
    total: int
    completed: int


class TaskStatsCategory(BaseModel):
    category_id: int
    category_name: str
    total: int
    completed: int


class TaskStatsResponse(BaseModel):
    total: int
    completed: int
    pending: int
    in_progress: int
    overdue: int
    completion_rate: float
    by_priority: dict
    by_category: List[TaskStatsCategory]