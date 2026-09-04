"""阶段 4 后端可靠性：提醒成功才标 is_sent；notify_jobs 原子认领。

历史缺陷：
- 提醒无论渠道成败都 `is_sent = True`，SMTP 抖一下这条提醒就永久丢失；
- drain_notify_jobs 只有进程内 asyncio 锁，web lifespan 与独立 scheduler
  容器同时跑时会取到同一批 id，同一条通知发两遍。
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models.category import Category
from app.models.notify import NotifyJob
from app.models.reminder import Reminder
from app.models.task import Task


def _seed_reminder(sync_db_session, *, username: str, channels: str = "email"):
    from app.core.security import get_password_hash
    from app.models.user import User

    user = User(
        username=username,
        email=f"{username}@example.com",
        password_hash=get_password_hash("password123"),
        is_active=True,
    )
    sync_db_session.add(user)
    sync_db_session.flush()
    cat = Category(user_id=user.id, name="默认", color="#409EFF", is_default=True)
    sync_db_session.add(cat)
    sync_db_session.flush()
    task = Task(user_id=user.id, category_id=cat.id, title="要提醒的任务")
    sync_db_session.add(task)
    sync_db_session.flush()
    reminder = Reminder(
        task_id=task.id,
        user_id=user.id,
        remind_at=datetime.utcnow() - timedelta(minutes=1),
        notify_channels=channels,
    )
    sync_db_session.add(reminder)
    sync_db_session.commit()
    sync_db_session.refresh(reminder)
    return reminder


def test_all_channels_failed_keeps_reminder_pending(sync_db_session, monkeypatch):
    from app.services.reminder_service import ReminderService

    reminder = _seed_reminder(sync_db_session, username="retry-user")

    monkeypatch.setattr(
        ReminderService,
        "_send_by_channel",
        staticmethod(lambda channel, user, task, reminder: (False, "SMTP 挂了")),
    )
    monkeypatch.setattr(
        ReminderService, "_send_email", staticmethod(lambda user, task: False)
    )

    results = ReminderService.check_and_send_reminders(sync_db_session)
    assert results == [], "全失败时不该报告为已发送"

    sync_db_session.refresh(reminder)
    assert reminder.is_sent is False, "全渠道失败不能标 is_sent，否则提醒永久丢失"
    assert reminder.attempts == 1
    assert reminder.last_error


def test_reminder_gives_up_after_max_attempts(sync_db_session, monkeypatch):
    from app.services.reminder_service import ReminderService

    reminder = _seed_reminder(sync_db_session, username="giveup-user")

    monkeypatch.setattr(
        ReminderService,
        "_send_by_channel",
        staticmethod(lambda channel, user, task, reminder: (False, "SMTP 挂了")),
    )
    monkeypatch.setattr(
        ReminderService, "_send_email", staticmethod(lambda user, task: False)
    )

    for attempt in range(1, ReminderService.MAX_SEND_ATTEMPTS + 1):
        ReminderService.check_and_send_reminders(sync_db_session)
        sync_db_session.refresh(reminder)
        assert reminder.attempts == attempt
        expected_sent = attempt >= ReminderService.MAX_SEND_ATTEMPTS
        assert reminder.is_sent is expected_sent, f"第 {attempt} 次后 is_sent 应为 {expected_sent}"


def test_successful_send_marks_sent_and_clears_error(sync_db_session, monkeypatch):
    from app.services.reminder_service import ReminderService

    reminder = _seed_reminder(sync_db_session, username="ok-user")
    reminder.attempts = 2
    reminder.last_error = "上轮失败"
    sync_db_session.commit()

    monkeypatch.setattr(
        ReminderService,
        "_send_by_channel",
        staticmethod(lambda channel, user, task, reminder: (True, None)),
    )

    results = ReminderService.check_and_send_reminders(sync_db_session)
    assert len(results) == 1

    sync_db_session.refresh(reminder)
    assert reminder.is_sent is True
    assert reminder.sent_at is not None
    assert reminder.last_error is None


@pytest.mark.asyncio
async def test_claim_notify_job_is_exclusive(db_session):
    """同一条 job 只能被认领一次：第二个消费者必须抢不到。"""
    from app.main import _claim_notify_job

    job = NotifyJob(
        company_id=1,
        user_id=1,
        channel="in_app",
        template_key="evidence.rejected",
        payload_json={},
        status="pending",
    )
    db_session.add(job)
    await db_session.commit()
    await db_session.refresh(job)

    assert await _claim_notify_job(db_session, job.id) is True
    assert await _claim_notify_job(db_session, job.id) is False, "重复认领必须失败"

    refreshed = (
        await db_session.execute(select(NotifyJob).where(NotifyJob.id == job.id))
    ).scalar_one()
    await db_session.refresh(refreshed)
    assert refreshed.status == "processing"
    assert refreshed.claimed_at is not None


@pytest.mark.asyncio
async def test_stale_processing_job_is_requeued(db_session):
    """消费者崩在 processing 上：超时后必须放回 pending，否则通知永久卡死。"""
    from app.main import NOTIFY_CLAIM_TIMEOUT_SECONDS, _requeue_stale_notify_jobs

    stale = NotifyJob(
        company_id=1,
        user_id=1,
        channel="in_app",
        template_key="evidence.rejected",
        payload_json={},
        status="processing",
        claimed_at=datetime.now(timezone.utc)
        - timedelta(seconds=NOTIFY_CLAIM_TIMEOUT_SECONDS + 60),
    )
    fresh = NotifyJob(
        company_id=1,
        user_id=1,
        channel="in_app",
        template_key="evidence.rejected",
        payload_json={},
        status="processing",
        claimed_at=datetime.now(timezone.utc),
    )
    db_session.add_all([stale, fresh])
    await db_session.commit()
    await db_session.refresh(stale)
    await db_session.refresh(fresh)

    assert await _requeue_stale_notify_jobs(db_session) == 1

    for job, expected in ((stale, "pending"), (fresh, "processing")):
        row = (
            await db_session.execute(select(NotifyJob).where(NotifyJob.id == job.id))
        ).scalar_one()
        await db_session.refresh(row)
        assert row.status == expected
