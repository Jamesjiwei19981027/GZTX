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
    """初始化数据库（创建所有表）"""
    async with engine.begin() as conn:
        from app.db.base import Base
        # 导入所有模型，确保 Base.metadata 知道它们
        from app.models import user, category, tag, task, reminder  # noqa: F401

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


async def close_db():
    """关闭数据库连接"""
    await engine.dispose()
