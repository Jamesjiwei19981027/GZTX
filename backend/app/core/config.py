"""
应用配置模块
使用 pydantic-settings 管理配置，支持 .env 文件
"""
import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator


class Settings(BaseSettings):
    """应用配置"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # 应用配置
    APP_NAME: str = "WorkTodo"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # 数据库配置
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/worktodo.db"

    # JWT 配置
    SECRET_KEY: str = "change-this-to-a-strong-secret-key-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # 微信小程序配置
    WX_APP_ID: str = ""
    WX_APP_SECRET: str = ""

    # CORS 配置
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v

    # 上传配置
    UPLOAD_DIR: str = "./data/uploads"
    MAX_UPLOAD_SIZE: int = 5 * 1024 * 1024  # 5MB

    # Email (SMTP) - from .env
    SMTP_HOST: str = "smtp.qq.com"
    SMTP_PORT: int = 465
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""

    # IMAP (Email receiving) - from .env
    IMAP_HOST: str = "imap.qq.com"
    IMAP_PORT: int = 993
    IMAP_USER: str = ""
    IMAP_PASSWORD: str = ""

    # Email reply configuration
    EMAIL_CHECK_INTERVAL: int = 300  # 5 minutes
    EMAIL_REPLY_DOMAIN: str = "yourdomain.com"
    EMAIL_REPLY_SECRET: str = "change-me-to-a-random-secret"

    # Daily digest configuration
    DAILY_DIGEST_HOUR: int = 8  # Hour to send daily digest (local time)
    USER_TIMEZONE_OFFSET: int = 8  # User timezone offset from UTC (hours)

    # Web Push VAPID configuration
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_SUBJECT: str = "mailto:admin@example.com"

    @property
    def is_sqlite(self) -> bool:
        """是否使用 SQLite"""
        return "sqlite" in self.DATABASE_URL

    @property
    def is_postgres(self) -> bool:
        """是否使用 PostgreSQL"""
        return "postgresql" in self.DATABASE_URL


# 全局配置实例
settings = Settings()

# 确保必要目录存在
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs("./data", exist_ok=True)
