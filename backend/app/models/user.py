"""
用户模型
"""
from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class User(Base):
    """用户表"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=True)
    password_hash = Column(String(255), nullable=True)
    nickname = Column(String(50), nullable=True)
    avatar_url = Column(String(255), nullable=True)
    wx_openid = Column(String(100), unique=True, index=True, nullable=True)
    wx_unionid = Column(String(100), unique=True, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    notify_pref = Column(JSON, default=dict, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # 关系
    tasks = relationship("Task", back_populates="user", lazy="selectin")
    categories = relationship("Category", back_populates="user", lazy="selectin")
    tags = relationship("Tag", back_populates="user", lazy="selectin")

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}')>"
