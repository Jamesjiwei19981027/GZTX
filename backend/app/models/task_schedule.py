"""Append-only deadline changes, independent of report snapshots."""
from sqlalchemy import Column, DateTime, ForeignKey, Integer
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import UTCDateTime


class TaskScheduleChange(Base):
    __tablename__ = "task_schedule_changes"

    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    old_due_date = Column(UTCDateTime(), nullable=True)
    new_due_date = Column(UTCDateTime(), nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now(), nullable=False)
