"""通知策略与派发任务"""
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
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import UTCDateTime


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
    __table_args__ = (
        # 消费者取队首：where status='pending' order by id
        Index("ix_notify_jobs_status_id", "status", "id"),
        # 超时回收：where status='processing' and claimed_at < cutoff
        Index("ix_notify_jobs_claimed", "status", "claimed_at"),
    )

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    channel = Column(String(32), nullable=False)  # in_app|wechat|email|sms
    template_key = Column(String(64), nullable=False)
    payload_json = Column(JSON, nullable=False, default=dict)
    # pending|processing|sent|failed|dead
    # processing = 已被某个消费者原子认领（dead=重试次数用尽，不再消费，避免堵住队列）
    status = Column(String(32), nullable=False, default="pending", index=True)
    # 已尝试投递次数，由 main.drain_notify_jobs 维护
    attempts = Column(Integer, nullable=False, default=0, server_default="0")
    error_message = Column(Text, nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now())
    sent_at = Column(UTCDateTime(), nullable=True)
    # 认领时间：进程崩溃留下的 processing 超时后可被重新认领
    claimed_at = Column(UTCDateTime(), nullable=True)


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
    sender_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    recipient_user_ids = Column(JSON, nullable=False, default=list)
    attachments_json = Column(JSON, nullable=False, default=list)
    requires_reply = Column(Boolean, default=False, nullable=False)
    reply_text = Column(Text, nullable=True)
    replied_at = Column(UTCDateTime(), nullable=True)
    archived_at = Column(UTCDateTime(), nullable=True, index=True)
    deleted_at = Column(UTCDateTime(), nullable=True, index=True)
    created_at = Column(UTCDateTime(), server_default=func.now())


class NotificationRecord(Base):
    """通知发送记录：提醒/测试发送每次尝试各记一条，成功失败都留痕。

    task_id 故意不建外键：任务被回收站物理清理后记录仍保留（审计口径），
    读取侧按 id 反查标题，查不到就返回 None。
    """

    __tablename__ = "notification_records"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False, index=True)
    channel = Column(String(32), nullable=False)  # email|webpush|web_push|sms|wx|app...
    status = Column(String(16), nullable=False)  # sent | failed
    error = Column(Text, nullable=True)
    task_id = Column(Integer, nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now(), index=True)


class PushSubscription(Base):
    """Browser push subscription persisted per user/device."""

    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint = Column(String(2000), nullable=False, unique=True)
    subscription_json = Column(JSON, nullable=False, default=dict)
    user_agent = Column(String(500), nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now())
    updated_at = Column(UTCDateTime(), onupdate=func.now())
