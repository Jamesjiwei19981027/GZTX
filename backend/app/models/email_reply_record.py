"""Email reply record model - stores email reply interactions"""
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, ForeignKey
from sqlalchemy.sql import func
from app.db.base import Base
from app.db.types import UTCDateTime


class EmailReplyRecord(Base):
    __tablename__ = "email_reply_records"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    command = Column(String(50), nullable=False)
    # raw_content stored truncated at 2000 chars at write time
    raw_content = Column(Text, nullable=False)
    # parsed_params stored as JSON directly
    parsed_params = Column(JSON, nullable=True)
    reply_type = Column(String(20), nullable=False, default="success")
    error_message = Column(String(500), nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<EmailReplyRecord(task_id={self.task_id}, command={self.command})>"