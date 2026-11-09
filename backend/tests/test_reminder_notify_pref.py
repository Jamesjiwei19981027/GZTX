"""WR-03 / A-07：提醒发送必须读取用户通知偏好（渠道开关、静音时段、周末免打扰）。"""
from datetime import datetime, timedelta

from sqlalchemy.orm.attributes import flag_modified

from app.core.config import settings
from app.services.notify_pref_gate import channel_enabled, deferred_until
from tests.test_delivery_reliability import _seed_reminder


def _utc_for_local(y, mo, d, h, mi):
    """本地时间 -> naive UTC"""
    return datetime(y, mo, d, h, mi) - timedelta(hours=settings.USER_TIMEZONE_OFFSET)


def test_channel_enabled_rules():
    assert channel_enabled(None, "email")
    assert not channel_enabled({"channels": {"email": {"enabled": False}}}, "email")
    assert not channel_enabled({"channels": {"push": {"enabled": False}}}, "web_push")
    assert not channel_enabled({"channels": {"wechat": {"enabled": False}}}, "wx")
    assert channel_enabled({"channels": {"push": {"enabled": False}}}, "email")
    assert channel_enabled({"channels": {"email": {"smtp_host": "x"}}}, "email")


def test_quiet_hours_cross_midnight_and_weekend():
    pref = {"quiet_hours": {"start": "22:00", "end": "07:00"}}
    # 2026-11-04 周三 23:30 本地 -> 次日 07:00
    assert deferred_until(pref, _utc_for_local(2026, 11, 4, 23, 30)) == _utc_for_local(2026, 11, 5, 7, 0)
    # 凌晨 03:00 -> 当天 07:00
    assert deferred_until(pref, _utc_for_local(2026, 11, 5, 3, 0)) == _utc_for_local(2026, 11, 5, 7, 0)
    # 白天不顺延
    assert deferred_until(pref, _utc_for_local(2026, 11, 5, 12, 0)) is None
    # 周末免打扰：周六 10:00 -> 周一 00:00（2026-11-07 为周六）
    assert deferred_until({"weekend_mute": True}, _utc_for_local(2026, 11, 7, 10, 0)) == _utc_for_local(2026, 11, 9, 0, 0)
    assert deferred_until({"weekend_mute": True}, _utc_for_local(2026, 11, 4, 10, 0)) is None
    # 叠加：周日 23:00 静音 -> 周一 00:00 仍在静音内 -> 周一 07:00
    both = {"weekend_mute": True, "quiet_hours": pref["quiet_hours"]}
    assert deferred_until(both, _utc_for_local(2026, 11, 8, 23, 0)) == _utc_for_local(2026, 11, 9, 7, 0)


def test_disabled_channel_not_sent_and_no_fallback(sync_db_session, monkeypatch):
    from app.models.user import User
    from app.services.reminder_service import ReminderService

    reminder = _seed_reminder(sync_db_session, username="pref-off", channels="email,web_push")
    user = sync_db_session.get(User, reminder.user_id)
    user.notify_pref = {"channels": {"email": {"enabled": False}, "push": {"enabled": False}}}
    flag_modified(user, "notify_pref")
    sync_db_session.commit()

    called = []
    monkeypatch.setattr(ReminderService, "_send_by_channel", staticmethod(lambda **kw: called.append(kw["channel"]) or (True, None)))
    monkeypatch.setattr(ReminderService, "_send_email", staticmethod(lambda u, t: called.append("fallback") or True))

    assert ReminderService.check_and_send_reminders(sync_db_session) == []
    assert called == [], "全部渠道关闭时不得发送，也不得走兜底邮件"
    sync_db_session.refresh(reminder)
    assert reminder.is_sent is True and "关闭" in (reminder.last_error or "")


def test_only_enabled_channels_used_and_fallback_respects_email_switch(sync_db_session, monkeypatch):
    from app.models.user import User
    from app.services.reminder_service import ReminderService

    reminder = _seed_reminder(sync_db_session, username="pref-partial", channels="email,web_push")
    user = sync_db_session.get(User, reminder.user_id)
    user.notify_pref = {"channels": {"email": {"enabled": False}}}
    flag_modified(user, "notify_pref")
    sync_db_session.commit()

    called = []
    monkeypatch.setattr(ReminderService, "_send_by_channel", staticmethod(lambda **kw: called.append(kw["channel"]) or (False, "失败")))
    monkeypatch.setattr(ReminderService, "_send_email", staticmethod(lambda u, t: called.append("fallback") or True))
    ReminderService.check_and_send_reminders(sync_db_session)
    assert called == ["web_push"], "邮件已关闭：只发推送，失败后也不兜底发邮件"


def test_quiet_hours_defer_reminder(sync_db_session, monkeypatch):
    from app.models.user import User
    from app.services.reminder_service import ReminderService

    reminder = _seed_reminder(sync_db_session, username="pref-quiet")
    user = sync_db_session.get(User, reminder.user_id)
    user.notify_pref = {"quiet_hours": {"start": "22:00", "end": "07:00"}}
    flag_modified(user, "notify_pref")
    sync_db_session.commit()

    called = []
    monkeypatch.setattr(ReminderService, "_send_by_channel", staticmethod(lambda **kw: called.append(1) or (True, None)))
    now = _utc_for_local(2026, 11, 4, 23, 30)
    reminder.remind_at = now - timedelta(minutes=1)
    sync_db_session.commit()

    assert ReminderService.check_and_send_reminders(sync_db_session, now=now) == []
    assert called == []
    sync_db_session.refresh(reminder)
    assert reminder.is_sent is False
    assert reminder.remind_at == _utc_for_local(2026, 11, 5, 7, 0)

    # 到静音结束时发出
    later = _utc_for_local(2026, 11, 5, 7, 1)
    assert len(ReminderService.check_and_send_reminders(sync_db_session, now=later)) == 1
