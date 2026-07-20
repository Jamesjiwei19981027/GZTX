"""
数据库会话管理
"""
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

# 将异步 URL 转换为同步 URL（用于后台任务）
SYNC_DATABASE_URL = settings.DATABASE_URL.replace("+aiosqlite", "").replace("+asyncpg", "")

# 创建异步引擎
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    # SQLite 需要这个配置来支持外键
    connect_args={"check_same_thread": False} if settings.is_sqlite else {},
)

# 创建同步引擎（用于后台任务）
sync_engine = create_engine(
    SYNC_DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False} if settings.is_sqlite else {},
)

# 创建异步会话工厂
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# 创建同步会话工厂（用于后台任务）
SyncSessionLocal = sessionmaker(
    bind=sync_engine,
    autocommit=False,
    autoflush=False,
)


async def get_db():
    """获取数据库会话（依赖注入用）"""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """初始化数据库。

    生产（DEBUG=false 且 AUTO_CREATE_SCHEMA=false）：不 create_all，依赖 Alembic。
    开发/测试：create_all + 幂等兼容列 ALTER。
    """
    auto = settings.AUTO_CREATE_SCHEMA if hasattr(settings, "AUTO_CREATE_SCHEMA") else settings.DEBUG
    if not settings.DEBUG and not auto:
        # Production path: schema only via `alembic upgrade head`
        return

    async with engine.begin() as conn:
        from app.db.base import Base
        # 导入所有模型，确保 Base.metadata 知道它们
        import app.models  # noqa: F401 — full personal + collab registry

        await conn.run_sync(Base.metadata.create_all)

        # 迁移：为 reminders 表添加 notify_channels 列（如果不存在）
        if settings.is_sqlite:
            from sqlalchemy import text
            try:
                await conn.execute(
                    text("ALTER TABLE reminders ADD COLUMN notify_channels VARCHAR(255)")
                )
            except Exception:
                pass  # 列已存在，忽略错误

            # 迁移：为 tasks 表添加跟进相关列（如果不存在）
            try:
                await conn.execute(
                    text("ALTER TABLE tasks ADD COLUMN follow_up_remind_at DATETIME")
                )
            except Exception:
                pass  # 列已存在，忽略错误
            try:
                await conn.execute(
                    text("ALTER TABLE tasks ADD COLUMN follow_up_notify_channels VARCHAR(255)")
                )
            except Exception:
                pass  # 列已存在，忽略错误

            # 协作兼容列
            for col_sql in (
                "ALTER TABLE tasks ADD COLUMN origin VARCHAR(32) DEFAULT 'personal'",
                "ALTER TABLE tasks ADD COLUMN company_id INTEGER",
                "ALTER TABLE tasks ADD COLUMN project_id INTEGER",
                "ALTER TABLE tasks ADD COLUMN project_node_id INTEGER",
                "ALTER TABLE tasks ADD COLUMN linked_readonly BOOLEAN DEFAULT 1",
            ):
                try:
                    await conn.execute(text(col_sql))
                except Exception:
                    pass

            # 注册验证兼容列（存量开发库；新增列后把老用户回填为已验证）
            verify_cols_added = False
            for col_sql in (
                "ALTER TABLE users ADD COLUMN phone VARCHAR(20)",
                "ALTER TABLE users ADD COLUMN email_verified_at DATETIME",
                "ALTER TABLE users ADD COLUMN phone_verified_at DATETIME",
            ):
                try:
                    await conn.execute(text(col_sql))
                    verify_cols_added = True
                except Exception:
                    pass
            if verify_cols_added:
                try:
                    await conn.execute(text(
                        "UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE email_verified_at IS NULL"
                    ))
                    await conn.execute(text(
                        "UPDATE users SET phone_verified_at = CURRENT_TIMESTAMP WHERE phone_verified_at IS NULL"
                    ))
                except Exception:
                    pass


async def close_db():
    """关闭数据库连接"""
    await engine.dispose()
