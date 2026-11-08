"""
用户模型
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import UTCDateTime


class User(Base):
    """用户表"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=True)
    phone = Column(String(20), unique=True, index=True, nullable=True)
    password_hash = Column(String(255), nullable=True)
    nickname = Column(String(50), nullable=True)
    avatar_url = Column(String(255), nullable=True)
    wx_openid = Column(String(100), unique=True, index=True, nullable=True)
    wx_unionid = Column(String(100), unique=True, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    # 双验证时间戳；存量用户在迁移时回填（视同已验证）
    email_verified_at = Column(UTCDateTime(), nullable=True)
    phone_verified_at = Column(UTCDateTime(), nullable=True)
    notify_pref = Column(JSON, default=dict, nullable=True)
    # 强制下线水位线：签发时间（iat）早于该时刻的 access/refresh token 一律失效。
    # 删号与「登出所有设备」都只写这一个字段，无需枚举已发出去的 jti。
    sessions_revoked_at = Column(UTCDateTime(), nullable=True)
    # ICS 订阅令牌：per-user 落库、可重置。旧实现由 SECRET_KEY 推导，
    # 泄露后除了换全站密钥没有别的撤销手段。
    calendar_feed_token = Column(String(64), unique=True, index=True, nullable=True)
    created_at = Column(UTCDateTime(), server_default=func.now())
    updated_at = Column(UTCDateTime(), onupdate=func.now())

    # 关系
    # 不开 selectin：每个请求都会取 User，一旦 selectin 就会顺带把该用户的全部
    # 任务/分类/标签拉进内存。需要时在查询里显式 selectinload。
    tasks = relationship("Task", back_populates="user")
    categories = relationship("Category", back_populates="user")
    tags = relationship("Tag", back_populates="user")

    @property
    def email_verified(self) -> bool:
        return self.email_verified_at is not None

    @property
    def phone_verified(self) -> bool:
        return self.phone_verified_at is not None

    @property
    def is_verified(self) -> bool:
        """邮箱与手机双验证均完成"""
        return self.email_verified and self.phone_verified

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}')>"
