"""notify_pref 读改写互斥：进程内按用户串行 + 数据库行锁 + 重读最新值。

通知开关（PUT /users/me）与界面偏好（PUT /users/me/ui-prefs）写同一个 JSON 列，
并发时后提交者会用旧快照覆盖先提交者。调用方须在 with 块内完成修改并 commit。
PostgreSQL 靠 FOR UPDATE；SQLite 不支持行锁，靠进程内锁（单进程部署足够）。
"""
import asyncio
import weakref
from contextlib import asynccontextmanager

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User

_locks: "weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, dict[int, asyncio.Lock]]" = weakref.WeakKeyDictionary()


@asynccontextmanager
async def locked_pref_update(db: AsyncSession, user: User):
    per_loop = _locks.setdefault(asyncio.get_running_loop(), {})
    lock = per_loop.setdefault(user.id, asyncio.Lock())
    async with lock:
        await db.execute(
            select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True)
        )
        yield user
