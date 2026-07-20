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
    APP_URL: str = "http://localhost"  # Base URL for email links (set to your domain in production)

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

    # Team collab / license
    # Production: set LICENSE_VERIFY_MODE=ed25519 and LICENSE_PUBLIC_KEY=<urlsafe-b64 public key>
    # Dev/tests: hmac + shared secret in LICENSE_PUBLIC_KEY is fine.
    DEPLOY_MODE: str = "single_company"  # single_company | saas
    LICENSE_PUBLIC_KEY: str = "dev-secret-key-for-tests-only"
    LICENSE_VERIFY_MODE: str = "hmac"  # hmac | ed25519
    # Optional: only for operator tooling that signs licenses (never ship real prod private key in image)
    LICENSE_PRIVATE_KEY: str = ""
    INTEGRATION_SECRET_KEY: str = ""
    COLLAB_OBJECT_ROOT: str = "data/objects"
    JUDGE_BACKEND: str = "rule"  # rule | llm | auto（auto=有公司 LLM 配置则用 llm）
    # 可选环境变量兜底（优先公司前端配置）
    LLM_PROVIDER: str = "openai_compatible"
    LLM_BASE_URL: str = ""
    LLM_API_KEY: str = ""
    LLM_MODEL: str = ""
    DEFAULT_COMPANY_SLUG: str = "default"
    # Schema: when True (default in DEBUG), lifespan may create_all. Production: alembic only.
    AUTO_CREATE_SCHEMA: bool = True
    # Dev/test only: allow FakeOIDC fake: codes when DEBUG=true
    ALLOW_FAKE_SSO: bool = True

    @property
    def is_sqlite(self) -> bool:
        """是否使用 SQLite"""
        return "sqlite" in self.DATABASE_URL

    @property
    def is_postgres(self) -> bool:
        """是否使用 PostgreSQL"""
        return "postgresql" in self.DATABASE_URL

    def validate_production_secrets(self) -> None:
        """DEBUG=false 时拒绝弱密钥与 hmac 默认 License。"""
        if self.DEBUG:
            return
        weak_secrets = {
            "change-this-to-a-strong-secret-key-in-production",
            "dev-secret-key-for-tests-only",
            "dev-secret-key-please-change-in-production",
            "change-me-to-a-random-secret",
            "",
        }
        if (self.SECRET_KEY or "").strip() in weak_secrets or len(self.SECRET_KEY or "") < 24:
            raise RuntimeError(
                "Production SECRET_KEY is weak or default; set a strong random SECRET_KEY"
            )
        if (self.LICENSE_PUBLIC_KEY or "").strip() in weak_secrets:
            raise RuntimeError(
                "Production LICENSE_PUBLIC_KEY is weak or default; set ed25519 public key"
            )
        mode = (self.LICENSE_VERIFY_MODE or "").lower()
        if mode != "ed25519":
            raise RuntimeError(
                "Production requires LICENSE_VERIFY_MODE=ed25519 (hmac is for dev only)"
            )


# 全局配置实例
settings = Settings()

# 确保必要目录存在
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs("./data", exist_ok=True)
