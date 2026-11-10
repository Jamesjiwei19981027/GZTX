"""
应用配置模块
使用 pydantic-settings 管理配置，支持 .env 文件
"""
import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, Field


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
    # 默认 false（fail-closed）。DEBUG=true 会回显验证码明文、跳过生产密钥门禁、
    # 打开 SSO 桩并把全部 SQL 打进日志——绝不能是"忘了配就生效"的那一档。
    # 本地开发请显式在 .env 里写 DEBUG=true（backend/.env.example 已如此）。
    DEBUG: bool = False
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

    # 为空表示关闭；禁止把这两个字段输出到日志或接口。
    JPUSH_APP_KEY: str = Field(default="", repr=False)
    JPUSH_MASTER_SECRET: str = Field(default="", repr=False)
    JPUSH_APNS_PRODUCTION: bool = False

    @property
    def jpush_enabled(self) -> bool:
        return bool(self.JPUSH_APP_KEY.strip() and self.JPUSH_MASTER_SECRET.strip())

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
    WEBRTC_STUN_URLS: str = ""
    WEBRTC_TURN_URLS: str = ""
    WEBRTC_TURN_USERNAME: str = ""
    WEBRTC_TURN_CREDENTIAL: str = ""
    JUDGE_BACKEND: str = "rule"  # rule | llm | auto（auto=有公司 LLM 配置则用 llm）
    # 可选环境变量兜底（优先公司前端配置）
    LLM_PROVIDER: str = "openai_compatible"
    LLM_BASE_URL: str = ""
    LLM_API_KEY: str = ""
    LLM_MODEL: str = ""
    DEFAULT_COMPANY_SLUG: str = "default"
    # Schema: when True (default in DEBUG), lifespan may create_all. Production: alembic only.
    AUTO_CREATE_SCHEMA: bool = True
    # Dev/test only: allow FakeOIDC fake: codes.
    # 必须默认 false：为 true 时任何人都能用 code=fake:x:<受害者邮箱> 换到该邮箱
    # 对应账号的完整 access_token（完全绕过密码与验证码）。
    # 生产门禁在 validate_production_secrets 里对 DEBUG=false + 本项为 true 直接硬失败。
    ALLOW_FAKE_SSO: bool = False

    # 是否在本进程启动 APScheduler。
    # gunicorn -w N 时每个 worker 都会跑 lifespan，N 个进程各起一套调度器会把
    # 提醒/每日摘要重复发 N 遍。多 worker 部署请只让一个进程为 true。
    SCHEDULER_ENABLED: bool = True

    # 人轴形态规则（主干只排人、事项只能挂人下）是否在服务端强制。
    # 默认 true。仅当存量库里有大量非人轴形状的旧树、需要过渡期时才临时关闭。
    ENFORCE_WORK_TREE_SHAPE: bool = True

    # /docs /redoc /openapi.json 是否暴露。默认跟随 DEBUG：
    # 生产开着等于把全部接口形状、字段名与枚举白送给攻击者。
    EXPOSE_API_DOCS: bool | None = None
    # 文档页 HTTP Basic 门禁；DEBUG=false 且开启文档时必填（启动门禁强制）
    API_DOCS_USERNAME: str = "apidocs"
    API_DOCS_PASSWORD: str = ""
    # Swagger「Servers」下拉追加的地址，逗号分隔，每项 `地址|说明`，
    # 如 `https://api.example.com|线上,https://staging.example.com|测试`
    API_DOCS_SERVERS: str = ""
    # Swagger UI 静态资源地址；国内访问 jsdelivr 不稳时可换镜像
    API_DOCS_ASSET_BASE: str = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5"

    # 注册双验证（邮箱+手机）总开关；短信服务商：fake（开发桩）| 后续 aliyun/tencent
    REGISTER_VERIFICATION_REQUIRED: bool = True
    PHONE_VERIFICATION_REQUIRED: bool = False
    REGISTRATION_MODE: str = "open"  # open | invite_only
    SMS_PROVIDER: str = "fake"

    # —— 知识检索 / RAG（见 services/knowledge/，设计文档 docs/superpowers/specs/
    # 2026-08-12-rag-knowledge-retrieval-design.md）——
    # 材料抽取模式：off=不抽取（现状）| sync=请求内轻量抽取 | worker=extractor 容器异步抽取
    EXTRACTION_MODE: str = "off"
    # 单文件抽取正文上限字符数，超出截断并记 meta
    EXTRACTION_MAX_CHARS: int = 200000
    # 知识块目标大小（字符）与相邻块重叠（字符）
    KNOWLEDGE_CHUNK_SIZE: int = 500
    KNOWLEDGE_CHUNK_OVERLAP: int = 80
    # 检索默认返回条数
    RETRIEVAL_TOP_K: int = 5
    # 智能体对话装载的历史消息条数上限
    AGENT_HISTORY_LIMIT: int = 20
    # 未摘要消息超过此阈值时触发滚动摘要
    AGENT_SUMMARY_THRESHOLD: int = 30
    # 向量召回开关；关闭时 embedding_json 留空且零外呼（默认关闭）
    EMBEDDING_ENABLED: bool = False
    # OpenAI 兼容 embedding 配置；base_url/api_key 未配时回落公司 LLM 配置
    EMBEDDING_MODEL: str = ""
    EMBEDDING_BASE_URL: str = ""
    EMBEDDING_API_KEY: str = ""

    # —— 认证限流（DB 支撑，见 services/rate_limit.py）——
    RATE_LIMIT_ENABLED: bool = True
    # 采信 X-Forwarded-For 做限流。默认 **false**（fail-closed）：
    # 采信该头时任何人都能靠伪造它把每次请求算到不同 IP 上，等于关掉 IP 维度限流。
    # 只有确认后端仅经受信反代（nginx 用 $proxy_add_x_forwarded_for 重写）时才打开；
    # compose 里显式设 true。
    TRUST_PROXY_HEADERS: bool = False
    RATE_LIMIT_LOGIN_WINDOW: int = 300  # 5 分钟
    RATE_LIMIT_LOGIN_PER_IP: int = 20
    RATE_LIMIT_LOGIN_PER_ACCOUNT: int = 10
    RATE_LIMIT_SEND_CODE_WINDOW: int = 3600  # 1 小时
    RATE_LIMIT_SEND_CODE_PER_IP: int = 20
    RATE_LIMIT_SEND_CODE_PER_TARGET: int = 5
    # refresh：正常客户端 15 分钟才换一次，给足余量仍能挡住拿到一枚 token 后的批量试探
    RATE_LIMIT_REFRESH_WINDOW: int = 300
    RATE_LIMIT_REFRESH_PER_IP: int = 60
    # 微信 code2session 外呼有配额，且 code 可穷举尝试
    RATE_LIMIT_WX_LOGIN_WINDOW: int = 300
    RATE_LIMIT_WX_LOGIN_PER_IP: int = 30
    # 上传：按用户限，防单账号刷满磁盘
    RATE_LIMIT_UPLOAD_WINDOW: int = 3600
    RATE_LIMIT_UPLOAD_PER_USER: int = 200
    # ICS 订阅：匿名端点，按 IP 限；日历客户端通常 15 分钟才拉一次
    RATE_LIMIT_FEED_WINDOW: int = 300
    RATE_LIMIT_FEED_PER_IP: int = 60
    # 测试发送：真实发邮件/推送，按用户限，防当成免费发信通道
    RATE_LIMIT_TEST_SEND_WINDOW: int = 3600
    RATE_LIMIT_TEST_SEND_PER_USER: int = 20

    @property
    def expose_api_docs(self) -> bool:
        """是否暴露 /docs /redoc /openapi.json；未显式设置时跟随 DEBUG。"""
        if self.EXPOSE_API_DOCS is None:
            return self.DEBUG
        return self.EXPOSE_API_DOCS

    @property
    def is_sqlite(self) -> bool:
        """是否使用 SQLite"""
        return "sqlite" in self.DATABASE_URL

    @property
    def is_postgres(self) -> bool:
        """是否使用 PostgreSQL"""
        return "postgresql" in self.DATABASE_URL

    @staticmethod
    def _is_placeholder_secret(value: str) -> bool:
        """判断是否是占位/示例密钥。

        只列黑名单不够：.env.example 里的 `change-me-to-a-long-random-string`
        长 33 字符且不在旧黑名单内，照着 `cp .env.example .env` 却忘了改的部署，
        会带着这个公开已知的密钥正常启动，JWT 可被任意伪造。
        改成模式匹配，任何含 change-me / example / dev- / placeholder 的值一律拒绝。
        """
        v = (value or "").strip().lower()
        if not v:
            return True
        exact = {
            "change-this-to-a-strong-secret-key-in-production",
            "dev-secret-key-for-tests-only",
            "dev-secret-key-please-change-in-production",
            "change-me-to-a-random-secret",
            "change-me-to-a-long-random-string",
            "worktodo123",
        }
        if v in exact:
            return True
        patterns = (
            "change-me", "changeme", "change-this", "your-", "yourdomain",
            "placeholder", "example", "dev-secret", "test-secret", "secret-key",
            "password", "insecure", "todo",
        )
        return any(p in v for p in patterns)

    def validate_production_secrets(self) -> None:
        """DEBUG=false 时拒绝弱密钥、示例占位符与不安全开关。

        在 main.py 的 lifespan 里调用，任一项不合格直接拒绝启动（fail-closed）。
        """
        if self.DEBUG:
            return

        for name in ("JPUSH_APP_KEY", "JPUSH_MASTER_SECRET"):
            value = getattr(self, name).strip()
            if value and self._is_placeholder_secret(value):
                raise RuntimeError(f"{name} 是占位值；请填写真实凭据或留空关闭极光推送")

        if self._is_placeholder_secret(self.SECRET_KEY) or len(self.SECRET_KEY or "") < 24:
            raise RuntimeError(
                "SECRET_KEY 是默认/占位值或过短（<24 字符）。"
                "请生成强随机密钥：python -c \"import secrets;print(secrets.token_urlsafe(48))\""
            )
        if self._is_placeholder_secret(self.LICENSE_PUBLIC_KEY):
            raise RuntimeError(
                "LICENSE_PUBLIC_KEY 是默认/占位值；生产必须设置 ed25519 公钥"
            )
        mode = (self.LICENSE_VERIFY_MODE or "").lower()
        if mode != "ed25519":
            raise RuntimeError(
                "生产要求 LICENSE_VERIFY_MODE=ed25519（hmac 仅供开发）"
            )
        if self.ALLOW_FAKE_SSO:
            raise RuntimeError(
                "ALLOW_FAKE_SSO=true 时任何人都能用 code=fake:x:<任意邮箱> 换取该账号令牌；"
                "生产必须设为 false"
            )
        # 生产开放接口文档必须加门禁，否则全部接口形状对公网可见
        if self.expose_api_docs and (
            self._is_placeholder_secret(self.API_DOCS_PASSWORD) or len(self.API_DOCS_PASSWORD) < 12
        ):
            raise RuntimeError(
                "生产开启 EXPOSE_API_DOCS 时必须设置 API_DOCS_PASSWORD（≥12 字符、非占位值），"
                "文档页将要求该账号密码"
            )
        # 邮件指令通道仅凭 From 地址 + 该密钥鉴权，弱默认值等于任何人都能伪造指令邮件
        if self.IMAP_USER and self._is_placeholder_secret(self.EMAIL_REPLY_SECRET):
            raise RuntimeError(
                "EMAIL_REPLY_SECRET 是默认/占位值；启用邮件指令通道时必须设置强随机值"
            )
        if self.PHONE_VERIFICATION_REQUIRED and (self.SMS_PROVIDER or "").lower() == "fake":
            raise RuntimeError(
                "PHONE_VERIFICATION_REQUIRED=true 但 SMS_PROVIDER 为 fake；"
                "生产环境启用手机验证时必须配置真实短信服务商，否则用户无法完成手机验证"
            )


# 全局配置实例
settings = Settings()

# 确保必要目录存在
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs("./data", exist_ok=True)
