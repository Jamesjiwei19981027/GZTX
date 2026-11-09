"""提醒发送前读取用户通知偏好：渠道开关、静音时段、周末免打扰。

偏好存于 users.notify_pref：
  channels.{email,push,desktop,wechat}.enabled   缺省视为开启
  quiet_hours.{start,end}  "HH:MM"（用户本地时间，可跨午夜）
  weekend_mute             周六、周日整天不发，顺延到周一 00:00
时间一律用 naive UTC 存取，本地时间 = UTC + USER_TIMEZONE_OFFSET 小时。
"""
from datetime import datetime, timedelta
from typing import Optional

from app.core.config import settings

# 提醒渠道 -> 偏好里的渠道名；短信等没有对应开关的渠道不受限
_CHANNEL_TO_PREF = {
    "email": "email",
    "web_push": "push",
    "web_popup": "push",
    "app": "push",
    "desktop": "desktop",
    "alarm": "desktop",
    "wx": "wechat",
    "wechat": "wechat",
}


def channel_enabled(notify_pref: Optional[dict], channel: str) -> bool:
    """该提醒渠道在用户偏好里是否开启；没配置按开启处理。"""
    pref_name = _CHANNEL_TO_PREF.get((channel or "").strip())
    if pref_name is None:
        return True
    channels = (notify_pref or {}).get("channels") or {}
    cfg = channels.get(pref_name)
    if not isinstance(cfg, dict):
        return True
    return cfg.get("enabled") is not False


def _parse_hhmm(value) -> Optional[int]:
    if not isinstance(value, str) or ":" not in value:
        return None
    try:
        h, m = value.strip().split(":")[:2]
        h, m = int(h), int(m)
    except ValueError:
        return None
    if not (0 <= h < 24 and 0 <= m < 60):
        return None
    return h * 60 + m


def deferred_until(notify_pref: Optional[dict], now_utc: datetime) -> Optional[datetime]:
    """若此刻处于静音时段或周末免打扰，返回应顺延到的 UTC 时间；否则返回 None。"""
    pref = notify_pref or {}
    offset = timedelta(hours=settings.USER_TIMEZONE_OFFSET)
    local = now_utc + offset
    moved = False
    # 两种规则可能叠加（如周日深夜静音 -> 周一），最多迭代几次
    for _ in range(4):
        changed = False
        if pref.get("weekend_mute") and local.weekday() >= 5:
            local = (local + timedelta(days=7 - local.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
            changed = True
        quiet = pref.get("quiet_hours") or {}
        start, end = _parse_hhmm(quiet.get("start")), _parse_hhmm(quiet.get("end"))
        if start is not None and end is not None and start != end:
            cur = local.hour * 60 + local.minute
            in_quiet = (start <= cur < end) if start < end else (cur >= start or cur < end)
            if in_quiet:
                end_dt = local.replace(hour=end // 60, minute=end % 60, second=0, microsecond=0)
                if end_dt <= local:
                    end_dt += timedelta(days=1)
                local = end_dt
                changed = True
        if not changed:
            break
        moved = True
    return (local - offset) if moved else None
