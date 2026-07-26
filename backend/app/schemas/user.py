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
        # 原逻辑 `not isalnum() and "_" not in v` 有误：含下划线时其余非法字符也会放行
        if not v.replace("_", "").isalnum():
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


_SECRET_KEY_MARKERS = (
    "password",
    "api_key",
    "apikey",
    "secret",
    "token",
    "credential",
    "private_key",
)


def scrub_secrets(value):
    """递归剔除任何疑似凭证的键，替换为 has_<key> 布尔。

    notify_pref 里混着个人 SMTP 密码与 LLM API Key。/notifications 下有专门的
    脱敏接口，但 UserDetail 直接把整个 notify_pref 原样回显，脱敏被完全绕过——
    任何拿到 access_token 的一方（XSS、日志、代理、前端缓存）都能读到用户的
    邮箱授权码与 LLM 密钥。这里在序列化层统一拦一道，保证所有回显路径都覆盖到。
    """
    if isinstance(value, dict):
        out: dict = {}
        for k, v in value.items():
            kl = str(k).lower()
            # has_password 这类"是否已配置"标志本身不是凭证，原样保留
            if kl.startswith("has_"):
                out[k] = v
                continue
            if any(m in kl for m in _SECRET_KEY_MARKERS):
                out[f"has_{k}"] = bool(v)
                continue
            out[k] = scrub_secrets(v)
        return out
    if isinstance(value, list):
        return [scrub_secrets(v) for v in value]
    return value


class UserDetail(UserBasic):
    """用户详细信息"""
    email: Optional[str] = None
    phone: Optional[str] = None
    email_verified: bool = False
    phone_verified: bool = False
    notify_pref: Optional[dict] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @field_validator("notify_pref", mode="after")
    @classmethod
    def _scrub_notify_pref(cls, v):
        return scrub_secrets(v) if isinstance(v, dict) else v


class TokenResponse(BaseModel):
    """Token 响应"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserBasic
