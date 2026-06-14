from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(Integer, default=1, nullable=False)  # 0=low, 1=medium, 2=high
    status = Column(Integer, default=0, nullable=False)  # 0=todo, 1=in_progress, 2=done
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

    user = relationship("User", backref="tasks")
    category = relationship("Category", back_populates="tasks")
    tags = relationship("Tag", secondary="task_tags", back_populates="tasks")
    reminders = relationship("Reminder", back_populates="task", cascade="all, delete-orphan")
    sub_tasks = relationship("Task", backref="parent", remote_side=[id])

    def __repr__(self):
        return f"<Task {self.title}>"