"""
任务相关的 Pydantic 数据模型
"""
from typing import Optional, List
from datetime import datetime

from pydantic import BaseModel, field_validator


# ===== 分类模型 =====

class CategoryCreate(BaseModel):
    """创建分类"""
    name: str
    color: str = "#409EFF"
    icon: Optional[str] = None
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    """更新分类"""
    name: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class CategoryResponse(BaseModel):
    """分类响应"""
    id: int
    name: str
    color: str
    icon: Optional[str] = None
    sort_order: int
    is_default: bool
    task_count: int = 0

    model_config = {"from_attributes": True}


# ===== 标签模型 =====

class TagCreate(BaseModel):
    """创建标签"""
    name: str
    color: str = "#67C23A"


class TagUpdate(BaseModel):
    """更新标签"""
    name: Optional[str] = None
    color: Optional[str] = None


class TagResponse(BaseModel):
    """标签响应"""
    id: int
    name: str
    color: str

    model_config = {"from_attributes": True}


# ===== 提醒模型 =====

class ReminderCreate(BaseModel):
    """创建提醒"""
    remind_at: datetime
    remind_type: int = 0
    notify_channels: Optional[str] = None  # 通知方式，逗号分隔: web_popup,email,sms,wechat,alarm


class ReminderResponse(BaseModel):
    """提醒响应"""
    id: int
    remind_at: datetime
    remind_type: int
    notify_channels: Optional[str] = None
    is_sent: bool

    model_config = {"from_attributes": True}


# ===== 任务模型 =====

class TaskCreate(BaseModel):
    """创建任务"""
    title: str
    description: Optional[str] = None
    priority: int = 1
    category_id: Optional[int] = None
    tag_ids: List[int] = []
    due_date: Optional[datetime] = None
    reminders: List[ReminderCreate] = []
    is_recurring: bool = False
    recurrence_rule: Optional[dict] = None

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v):
        if not v or not v.strip():
            raise ValueError("任务标题不能为空")
        if len(v) > 200:
            raise ValueError("任务标题不能超过200字")
        return v.strip()

    @field_validator("priority")
    @classmethod
    def priority_valid(cls, v):
        if v not in (0, 1, 2):
            raise ValueError("优先级必须为 0(低)、1(中) 或 2(高)")
        return v


class TaskUpdate(BaseModel):
    """更新任务"""
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[int] = None
    status: Optional[int] = None
    category_id: Optional[int] = None
    tag_ids: Optional[List[int]] = None
    due_date: Optional[datetime] = None
    reminders: Optional[List[ReminderCreate]] = None
    is_recurring: Optional[bool] = None
    recurrence_rule: Optional[dict] = None
    sort_order: Optional[int] = None


class TaskResponse(BaseModel):
    """任务响应"""
    id: int
    title: str
    description: Optional[str] = None
    priority: int
    priority_label: str = "中"
    status: int
    status_label: str = "待办"
    due_date: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    is_recurring: bool = False
    recurrence_rule: Optional[dict] = None
    category: Optional[CategoryResponse] = None
    tags: List[TagResponse] = []
    reminders: List[ReminderResponse] = []
    is_deleted: bool = False
    # 完成评价相关字段
    completion_rate: int = 100
    completion_comment: Optional[str] = None
    needs_follow_up: bool = False
    follow_up_reason: Optional[str] = None
    follow_up_remind_at: Optional[datetime] = None
    follow_up_notify_channels: Optional[str] = None
    # 协作兼容
    origin: str = "personal"
    company_id: Optional[int] = None
    project_id: Optional[int] = None
    project_node_id: Optional[int] = None
    linked_readonly: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TaskComplete(BaseModel):
    """完成任务请求"""
    completion_rate: int = 100
    completion_comment: Optional[str] = None
    needs_follow_up: bool = False
    follow_up_reason: Optional[str] = None
    follow_up_remind_at: Optional[datetime] = None
    follow_up_notify_channels: Optional[str] = None


class PriorityStat(BaseModel):
    """优先级统计"""
    total: int
    completed: int


class CategoryStat(BaseModel):
    """分类统计"""
    category_id: Optional[int] = None
    category_name: str
    total: int
    completed: int


class TaskStatsResponse(BaseModel):
    """任务统计响应"""
    total: int
    completed: int
    pending: int
    in_progress: int
    overdue: int
    completion_rate: float
    by_priority: Optional[dict] = None  # {"high": {total, completed}, "medium": {...}, "low": {...}}
    by_category: Optional[List[CategoryStat]] = None


class BatchAction(BaseModel):
    """批量操作"""
    task_ids: List[int]
