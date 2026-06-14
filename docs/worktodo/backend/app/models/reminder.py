from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.session import Base


class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    remind_at = Column(DateTime(timezone=True), nullable=False)
    remind_type = Column(Integer, default=0, nullable=False)  # 0=before, 1=at_due, 2=overdue, 3=custom
    is_sent = Column(Boolean, default=False, nullable=False)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    task = relationship("Task", back_populates="reminders")
    user = relationship("User", backref="reminders")

    def __repr__(self):
        return f"<Reminder for Task {self.task_id} at {self.remind_at}>"