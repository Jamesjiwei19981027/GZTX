"""Persistent task-to-user assignments."""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import UTCDateTime


class TaskAssignment(Base):
    __tablename__ = "task_assignees"
    __table_args__ = (
        UniqueConstraint(
            "task_id",
            "user_id",
            "role_key",
            name="uq_task_assignee_role",
        ),
    )

    id = Column(Integer, primary_key=True)
    task_id = Column(
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role_key = Column(String(32), nullable=False, default="primary")
    created_at = Column(UTCDateTime(), server_default=func.now())

    task = relationship("Task", back_populates="assignees")
    user = relationship("User", lazy="joined")

