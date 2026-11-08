"""
任务模型
"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    JSON,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.tag import task_tags
from app.db.types import UTCDateTime


class Task(Base):
    """任务表"""
    __tablename__ = "tasks"
    __table_args__ = (
        # 任务列表默认口径：本人 + 未删除，按 created_at 倒序分页
        Index("ix_tasks_user_live_created", "user_id", "is_deleted", "created_at"),
        # 日历/我的任务按截止时间取区间
        Index("ix_tasks_user_live_due", "user_id", "is_deleted", "due_date"),
        # 回收站清理 job：where is_deleted and deleted_at < cutoff
        Index("ix_tasks_deleted_at", "is_deleted", "deleted_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(Integer, nullable=False, default=1)  # 0=低, 1=中, 2=高
    status = Column(Integer, nullable=False, default=0)    # 0=待办, 1=进行中, 2=已完成
    due_date = Column(UTCDateTime(), nullable=True, index=True)
    completed_at = Column(UTCDateTime(), nullable=True)
    is_recurring = Column(Boolean, default=False, nullable=False)
    recurrence_rule = Column(JSON, nullable=True)
    parent_task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    # 轻量子任务清单 [{id,title,completed}]；独立于 parent_task_id（后者是重复实例语义）
    checklist = Column(JSON, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    deleted_at = Column(UTCDateTime(), nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now())
    updated_at = Column(UTCDateTime(), onupdate=func.now())

    # 完成评价相关字段
    completion_rate = Column(Integer, default=100, nullable=False)  # 完成度 0-100
    completion_comment = Column(Text, nullable=True)  # 完成评价/备注
    needs_follow_up = Column(Boolean, default=False, nullable=False)  # 是否需要继续提示/跟进
    follow_up_reason = Column(Text, nullable=True)  # 需要跟进的原因
    follow_up_remind_at = Column(DateTime, nullable=True)  # 跟进提醒时间
    follow_up_notify_channels = Column(String(255), nullable=True)  # 跟进通知渠道，逗号分隔

    # 邮件回复跟踪字段
    email_reply_count = Column(Integer, default=0, nullable=False)
    last_reply_at = Column(UTCDateTime(), nullable=True)
    last_reply_command = Column(String(50), nullable=True)

    # 个人/协作兼容字段（附录 C.22）
    origin = Column(String(32), nullable=False, default="personal")  # personal | project_link
    company_id = Column(Integer, nullable=True, index=True)
    project_id = Column(Integer, nullable=True, index=True)
    project_node_id = Column(Integer, nullable=True, index=True)
    linked_readonly = Column(Boolean, default=True, nullable=False)

    # Source metadata for tasks created from WeChat/chat/email workflows.  Keep
    # the common display fields indexed in regular columns while preserving
    # provider-specific payloads in JSON for forward compatibility.
    source_channel = Column(String(32), nullable=True, index=True)
    source_title = Column(String(200), nullable=True)
    source_url = Column(String(1000), nullable=True)
    source_message_id = Column(String(255), nullable=True)
    source_meta = Column(JSON, nullable=True)

    # 关系
    user = relationship("User", back_populates="tasks")
    category = relationship("Category", back_populates="tasks")
    tags = relationship("Tag", secondary=task_tags, back_populates="tasks", lazy="selectin")
    reminders = relationship("Reminder", back_populates="task", cascade="all, delete-orphan")
    sub_tasks = relationship("Task", backref="parent", remote_side=[id], lazy="selectin")
    # 出参里没有 recurring_instances，不必每次列任务都多一条 selectin 查询；
    # 删除任务时的级联会在 await db.delete(task) 内部按需加载。
    recurring_instances = relationship(
        "RecurringInstance",
        back_populates="task",
        cascade="all, delete-orphan",
    )
    assignees = relationship(
        "TaskAssignment",
        back_populates="task",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="TaskAssignment.id",
    )

    # 优先级枚举
    PRIORITY_LOW = 0
    PRIORITY_MEDIUM = 1
    PRIORITY_HIGH = 2

    # 状态枚举
    STATUS_TODO = 0
    STATUS_IN_PROGRESS = 1
    STATUS_DONE = 2

    @property
    def priority_label(self) -> str:
        labels = {0: "低", 1: "中", 2: "高"}
        return labels.get(self.priority, "中")

    @property
    def status_label(self) -> str:
        labels = {0: "待办", 1: "进行中", 2: "已完成"}
        return labels.get(self.status, "待办")

    def __repr__(self):
        return f"<Task(id={self.id}, title='{self.title}')>"
