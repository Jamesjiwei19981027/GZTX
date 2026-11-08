from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Date, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import UTCDateTime


class RecurringInstance(Base):
    __tablename__ = "recurring_instances"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    instance_date = Column(Date, nullable=False)
    title = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    status = Column(Integer, default=0, nullable=False)  # 0=pending, 1=in_progress, 2=completed
    completed_at = Column(UTCDateTime(), nullable=True)
    is_modified = Column(Boolean, default=False, nullable=False)
    created_at = Column(UTCDateTime(), server_default=func.now(), nullable=False)

    # Relationships
    task = relationship("Task", back_populates="recurring_instances")

    def __repr__(self):
        return f"<RecurringInstance(id={self.id}, task_id={self.task_id}, instance_date={self.instance_date})>"