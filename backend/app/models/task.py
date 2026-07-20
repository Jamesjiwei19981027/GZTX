"""
任务模型
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.models.tag import task_tags


class Task(Base):
    """任务表"""
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(Integer, nullable=False, default=1)  # 0=低, 1=中, 2=高
    status = Column(Integer, nullable=False, default=0)    # 0=待办, 1=进行中, 2=已完成
    due_date = Column(DateTime(timezone=True), nullable=True, index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    is_recurring = Column(Boolean, default=False, nullable=False)
    recurrence_rule = Column(JSON, nullable=True)
    parent_task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # 完成评价相关字段
    completion_rate = Column(Integer, default=100, nullable=False)  # 完成度 0-100
    completion_comment = Column(Text, nullable=True)  # 完成评价/备注
    needs_follow_up = Column(Boolean, default=False, nullable=False)  # 是否需要继续提示/跟进
    follow_up_reason = Column(Text, nullable=True)  # 需要跟进的原因
    follow_up_remind_at = Column(DateTime, nullable=True)  # 跟进提醒时间
    follow_up_notify_channels = Column(String(255), nullable=True)  # 跟进通知渠道，逗号分隔

    # 邮件回复跟踪字段
    email_reply_count = Column(Integer, default=0, nullable=False)
    last_reply_at = Column(DateTime(timezone=True), nullable=True)
    last_reply_command = Column(String(50), nullable=True)

    # 个人/协作兼容字段（附录 C.22）
    origin = Column(String(32), nullable=False, default="personal")  # personal | project_link
    company_id = Column(Integer, nullable=True, index=True)
    project_id = Column(Integer, nullable=True, index=True)
    project_node_id = Column(Integer, nullable=True, index=True)
    linked_readonly = Column(Boolean, default=True, nullable=False)

    # 关系
    user = relationship("User", back_populates="tasks")
    category = relationship("Category", back_populates="tasks")
    tags = relationship("Tag", secondary=task_tags, back_populates="tasks", lazy="selectin")
    reminders = relationship("Reminder", back_populates="task", cascade="all, delete-orphan")
    sub_tasks = relationship("Task", backref="parent", remote_side=[id], lazy="selectin")
    recurring_instances = relationship(
        "RecurringInstance",
        back_populates="task",
        cascade="all, delete-orphan",
        lazy="selectin",
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
