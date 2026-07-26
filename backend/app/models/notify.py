"""通知策略与派发任务"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    DateTime,
    ForeignKey,
    JSON,
)
from sqlalchemy.sql import func

from app.db.base import Base


class NotifyPolicy(Base):
    __tablename__ = "notify_policies"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    event_key = Column(String(64), nullable=False)
    channels_json = Column(JSON, nullable=False, default=lambda: ["in_app", "wechat", "email"])
    enabled = Column(Boolean, default=True)


class NotifyJob(Base):
    __tablename__ = "notify_jobs"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    channel = Column(String(32), nullable=False)  # in_app|wechat|email|sms
    template_key = Column(String(64), nullable=False)
    payload_json = Column(JSON, nullable=False, default=dict)
    # pending|sent|failed|dead（dead=重试次数用尽，不再消费，避免堵住队列）
    status = Column(String(32), nullable=False, default="pending", index=True)
    # 已尝试投递次数，由 main.drain_notify_jobs 维护
    attempts = Column(Integer, nullable=False, default=0, server_default="0")
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    sent_at = Column(DateTime(timezone=True), nullable=True)


class CollabInboxMessage(Base):
    """协作站内信（与个人 notifications 分离，避免耦合旧表）"""
    __tablename__ = "collab_inbox"

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    template_key = Column(String(64), nullable=False)
    payload_json = Column(JSON, nullable=False, default=dict)
    body_text = Column(Text, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
