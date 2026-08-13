"""
任务相关的 Pydantic 数据模型
"""
from typing import Optional, List, Union
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


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
    task_id: int  # 提醒必须挂在具体任务上，否则发送时取不到任务内容
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

class TaskAssigneeResponse(BaseModel):
    """A task assignee with stable display metadata for clients."""

    user_id: int
    role_key: str
    display_name: str
    nickname: Optional[str] = None
    username: Optional[str] = None
    avatar_url: Optional[str] = None


class TaskCreate(BaseModel):
    """创建任务"""
    title: str
    description: Optional[str] = None
    priority: int = 1
    status: int = 0
    category_id: Optional[int] = None
    tag_ids: List[int] = Field(default_factory=list)
    due_date: Optional[datetime] = None
    reminders: List[ReminderCreate] = Field(default_factory=list)
    is_recurring: bool = False
    # Web 端发字符串（"daily"|"weekdays"|"weekly"|"monthly"），
    # 历史/高级形态是 dict（{"frequency","interval"}），两者都接受
    recurrence_rule: Optional[Union[str, dict]] = None
    # 协作任务兼容字段：创建时可直接挂到用户有权访问的项目。
    company_id: Optional[int] = None
    project_id: Optional[int] = None
    project_node_id: Optional[int] = None
    origin: str = "personal"
    linked_readonly: bool = True
    source_channel: Optional[str] = None
    source_title: Optional[str] = None
    source_url: Optional[str] = None
    source_message_id: Optional[str] = None
    source_meta: Optional[dict] = None
    assignee_user_ids: List[int] = Field(default_factory=list)

    @field_validator("origin")
    @classmethod
    def origin_valid(cls, v):
        if v not in ("personal", "project_link"):
            raise ValueError("任务来源必须为 personal 或 project_link")
        return v

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

    @field_validator("status")
    @classmethod
    def status_valid(cls, v):
        if v not in (0, 1, 2):
            raise ValueError("状态必须为 0(待办)、1(进行中) 或 2(已完成)")
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
    recurrence_rule: Optional[Union[str, dict]] = None
    sort_order: Optional[int] = None
    # 关联人轴事项（单向 Task → TreeNode）
    project_id: Optional[int] = None
    project_node_id: Optional[int] = None
    origin: Optional[str] = None
    company_id: Optional[int] = None
    linked_readonly: Optional[bool] = None
    source_channel: Optional[str] = None
    source_title: Optional[str] = None
    source_url: Optional[str] = None
    source_message_id: Optional[str] = None
    source_meta: Optional[dict] = None
    assignee_user_ids: Optional[List[int]] = None

    @field_validator("origin")
    @classmethod
    def origin_valid(cls, v):
        if v is not None and v not in ("personal", "project_link"):
            raise ValueError("任务来源必须为 personal 或 project_link")
        return v

    @field_validator("priority")
    @classmethod
    def priority_valid(cls, v):
        if v is not None and v not in (0, 1, 2):
            raise ValueError("优先级必须为 0(低)、1(中) 或 2(高)")
        return v

    @field_validator("status")
    @classmethod
    def status_valid(cls, v):
        if v is not None and v not in (0, 1, 2):
            raise ValueError("状态必须为 0(待办)、1(进行中) 或 2(已完成)")
        return v


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
    recurrence_rule: Optional[Union[str, dict]] = None
    parent_task_id: Optional[int] = None
    category: Optional[CategoryResponse] = None
    tags: List[TagResponse] = []
    reminders: List[ReminderResponse] = []
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
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
    source_channel: Optional[str] = None
    source_title: Optional[str] = None
    source_url: Optional[str] = None
    source_message_id: Optional[str] = None
    source_meta: Optional[dict] = None
    assignees: List[TaskAssigneeResponse] = Field(default_factory=list)
    assignee: Optional[TaskAssigneeResponse] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TaskExtractRequest(BaseModel):
    """Extract a task draft from chat text without creating a task implicitly."""

    chat_text: str = Field(..., min_length=1, max_length=20000)
    source_channel: str = "wechat"
    source_title: Optional[str] = None
    source_url: Optional[str] = None
    source_message_id: Optional[str] = None
    source_meta: Optional[dict] = None
    company_id: Optional[int] = None
    project_id: Optional[int] = None

    @field_validator("chat_text")
    @classmethod
    def chat_text_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("chat_text cannot be blank")
        return value


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


class BatchReschedule(BaseModel):
    """批量顺延：把 task_ids 的截止日期改到 due_date（仅替换日期，保留原时刻）"""
    task_ids: List[int]
    due_date: date
