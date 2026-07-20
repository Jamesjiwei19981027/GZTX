"""注册/绑定验证码"""
from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.sql import func

from app.db.base import Base


class VerificationCode(Base):
    """邮箱/手机验证码。

    purpose: register | bind（注册前无 user_id；登录后补验/换绑有 user_id）
    channel: email | sms
    target: 邮箱地址或手机号（统一小写/去空格后存储）
    """

    __tablename__ = "verification_codes"

    id = Column(Integer, primary_key=True)
    channel = Column(String(16), nullable=False, index=True)
    target = Column(String(100), nullable=False, index=True)
    purpose = Column(String(16), nullable=False, default="register")
    code_hash = Column(String(64), nullable=False)
    user_id = Column(Integer, nullable=True, index=True)
    attempts = Column(Integer, nullable=False, default=0)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    consumed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
