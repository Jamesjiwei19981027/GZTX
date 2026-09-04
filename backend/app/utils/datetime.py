from datetime import datetime, timedelta, timezone
from typing import Optional


def get_time_until(remind_at: datetime) -> str:
    """Get human-readable time until a future datetime."""
    now = datetime.now(timezone.utc)
    if remind_at.tzinfo is None:
        remind_at = remind_at.replace(tzinfo=timezone.utc)

    diff = remind_at - now

    if diff.total_seconds() < 0:
        return "已过期"

    total_seconds = diff.total_seconds()
    if total_seconds < 3600:
        minutes = int(total_seconds / 60)
        return f"{minutes}分钟后"
    elif total_seconds < 86400:
        hours = int(total_seconds / 3600)
        return f"{hours}小时后"
    else:
        days = int(total_seconds / 86400)
        return f"{days}天后"


def get_due_date_relative(due_date: datetime) -> Optional[str]:
    """Get human-readable relative time for due date."""
    if not due_date:
        return None

    now = datetime.now(timezone.utc)
    if due_date.tzinfo is None:
        due_date = due_date.replace(tzinfo=timezone.utc)

    diff = due_date - now

    if diff.total_seconds() < 0:
        return "已逾期"
    elif diff.total_seconds() < 86400:
        return "今天"
    elif diff.total_seconds() < 172800:
        return "明天"
    elif diff.days < 7:
        return f"{diff.days}天后"
    else:
        return f"{diff.days}天后"


def is_overdue(due_date: datetime, status: int) -> bool:
    """Check if a task is overdue."""
    if not due_date or status == 2:  # 2 = completed
        return False

    now = datetime.now(timezone.utc)
    if due_date.tzinfo is None:
        due_date = due_date.replace(tzinfo=timezone.utc)

    return now > due_date


def parse_date(date_str: str) -> Optional[datetime]:
    """Parse ISO format date string to datetime."""
    try:
        return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
    except (ValueError, AttributeError):
        return None


def start_of_day(dt: datetime) -> datetime:
    """Get datetime at start of day (00:00:00)."""
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def end_of_day(dt: datetime) -> datetime:
    """Get datetime at end of day (23:59:59.999999)."""
    return dt.replace(hour=23, minute=59, second=59, microsecond=999999)


def format_datetime(dt: datetime) -> str:
    """Format datetime to ISO 8601 string."""
    return dt.isoformat()


def now_utc() -> datetime:
    """Get current UTC datetime."""
    return datetime.now(timezone.utc)


def to_naive_utc(value: Optional[datetime]) -> Optional[datetime]:
    """把任意时区的时间归一成 naive UTC，供入库使用。

    库里（SQLite DATETIME / PG timestamp without tz）统一存 naive UTC。
    历史实现是直接 `replace(tzinfo=None)`，那会把 `+08:00` 的墙上时间当成
    UTC 存下去，整体偏 8 小时；这里改成先转 UTC 再去掉时区。
    """
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def to_utc_iso(value: Optional[datetime]) -> Optional[str]:
    """出参统一带 UTC 时区标记（`...Z`），客户端按本地时区渲染。"""
    if value is None:
        return None
    aware = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
    return aware.isoformat().replace("+00:00", "Z")


def as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """把可能是 naive 的时间统一成 aware（UTC），供比较使用。

    SQLite 的 DATETIME 不存时区，读回来一律是 naive；直接和
    `datetime.now(timezone.utc)` 比较会抛
    TypeError: can't compare offset-naive and offset-aware datetimes。
    凡是"库里读出来的时间 vs 当前时间"的比较都应先过这个函数。
    """
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt