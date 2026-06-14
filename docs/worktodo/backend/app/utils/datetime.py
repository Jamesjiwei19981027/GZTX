from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

CHINA_TZ = ZoneInfo("Asia/Shanghai")


def now() -> datetime:
    """获取当前时间（北京时间）"""
    return datetime.now(CHINA_TZ)


def to_utc(dt: datetime) -> datetime:
    """转换到 UTC 时间"""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=CHINA_TZ)
    return dt.astimezone(ZoneInfo("UTC"))


def format_date(dt: datetime, fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    """格式化日期"""
    if dt is None:
        return ""
    return dt.strftime(fmt)


def parse_date(date_str: str) -> Optional[datetime]:
    """解析日期字符串"""
    formats = [
        "%Y-%m-%d",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%z",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    return None