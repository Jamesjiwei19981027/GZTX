"""自定义列类型。"""
from datetime import timezone

from sqlalchemy import DateTime
from sqlalchemy.types import TypeDecorator


class UTCDateTime(TypeDecorator):
    """带时区的 UTC 时间列（timestamptz）。

    背景：asyncpg 会把 naive datetime 按“宿主机本地时区”解释后写入 timestamptz，
    在非 UTC 主机上整体偏移（如 UTC+8 偏 8 小时）。业务代码里大量使用
    datetime.utcnow()（naive，语义上就是 UTC），所以在写入边界统一约定：
    - naive 视为 UTC；aware 换算为 UTC；
    - PostgreSQL 保持 aware UTC 写入；SQLite 无时区类型，存去掉 tzinfo 的 UTC 值
      （与原先存储格式一致）。
    读取不做改变（PG 返回 aware，SQLite 返回 naive），保持现有调用方行为。
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if value.tzinfo is None:
            aware = value.replace(tzinfo=timezone.utc)
        else:
            aware = value.astimezone(timezone.utc)
        if dialect.name == "sqlite":
            return aware.replace(tzinfo=None)
        return aware
