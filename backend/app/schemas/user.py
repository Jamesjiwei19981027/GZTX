"""
用户相关的 Pydantic 数据模型
"""
from typing import Optional
from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator


# ===== 请求模型 =====

class UserRegister(BaseModel):
    """用户注册请求（REGISTER_VERIFICATION_REQUIRED 时邮箱+邮箱验证码必填；手机登录后绑定）"""
    username: str
    password: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    email_code: Optional[str] = None
    phone_code: Optional[str] = None
    nickname: Optional[str] = None

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v):
        if not v.isalnum() and "_" not in v:
            raise ValueError("用户名只能包含字母、数字和下划线")
        if len(v) < 3 or len(v) > 50:
            raise ValueError("用户名长度需要在3-50个字符之间")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 6:
            raise ValueError("密码长度不能少于6个字符")
        return v


class UserLogin(BaseModel):
    """用户登录请求"""
    username: str
    password: str


class WxLogin(BaseModel):
    """微信登录请求"""
    code: str


class UserUpdate(BaseModel):
    """用户更新请求"""
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    notify_pref: Optional[dict] = None


class PasswordChange(BaseModel):
    """修改密码请求"""
    old_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 6:
            raise ValueError("密码长度不能少于6个字符")
        return v


class RefreshToken(BaseModel):
    """刷新 Token 请求"""
    refresh_token: str


# ===== 响应模型 =====

class UserBasic(BaseModel):
    """用户基本信息"""
    id: int
    username: str
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    email_verified: bool = False
    phone_verified: bool = False

    model_config = {"from_attributes": True}


class UserDetail(UserBasic):
    """用户详细信息"""
    email: Optional[str] = None
    phone: Optional[str] = None
    email_verified: bool = False
    phone_verified: bool = False
    notify_pref: Optional[dict] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    """Token 响应"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserBasic
