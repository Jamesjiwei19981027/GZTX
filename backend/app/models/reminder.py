"""
提醒模型
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import UTCDateTime


class Reminder(Base):
    """提醒表"""
    __tablename__ = "reminders"
    __table_args__ = (
        # 每分钟的到点扫描：where is_sent=false and remind_at <= now
        Index("ix_reminders_due_scan", "is_sent", "remind_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    remind_at = Column(UTCDateTime(), nullable=False, index=True)
    remind_type = Column(Integer, nullable=False, default=0)  # 0=截止前, 1=截止时, 2=逾期, 3=自定义
    notify_channels = Column(String(255), nullable=True)  # 通知方式，逗号分隔: web_popup,email,sms,wechat,alarm
    is_sent = Column(Boolean, default=False, nullable=False)
    sent_at = Column(UTCDateTime(), nullable=True)
    # 发送重试计数：全渠道失败时不标 is_sent，靠 attempts 兜住无限重试
    attempts = Column(Integer, nullable=False, default=0, server_default="0")
    last_error = Column(String(500), nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now())

    # 关系
    task = relationship("Task", back_populates="reminders")

    # 提醒类型枚举
    TYPE_BEFORE_DUE = 0
    TYPE_AT_DUE = 1
    TYPE_OVERDUE = 2
    TYPE_CUSTOM = 3

    def __repr__(self):
        return f"<Reminder(id={self.id}, task_id={self.task_id}, remind_at={self.remind_at})>"
