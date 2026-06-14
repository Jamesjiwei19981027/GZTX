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