"""通知可靠性：发送记录写入 / 查询隔离 / 测试发送成败与留痕"""
from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.notify import NotificationRecord
from app.models.task import Task
from app.models.category import Category


async def _make_task(db_session, user_id: int, title: str = "提醒任务") -> Task:
    cat = Category(user_id=user_id, name="默认", color="#409EFF", is_default=True)
    db_session.add(cat)
    await db_session.flush()
    task = Task(user_id=user_id, category_id=cat.id, title=title)
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)
    return task


@pytest.mark.asyncio
async def test_records_returns_own_records_with_task_title(
    client: AsyncClient, auth_headers, test_user, db_session
):
    task = await _make_task(db_session, test_user.id, title="带标题的任务")
    db_session.add_all(
        [
            NotificationRecord(
                user_id=test_user.id,
                channel="email",
                status="failed",
                error="SMTP 未配置",
                task_id=task.id,
            ),
            NotificationRecord(
                user_id=test_user.id, channel="webpush", status="sent"
            ),
            NotificationRecord(
                user_id=test_user.id + 999, channel="email", status="sent"
            ),
        ]
    )
    await db_session.commit()

    r = await client.get("/api/v1/notify/records?limit=10", headers=auth_headers)
    assert r.status_code == 200, r.text
    items = r.json()["data"]["items"]
    assert len(items) == 2, "只能看到自己的记录"
    # 倒序：最新在前
    assert items[0]["channel"] == "webpush"
    assert items[0]["status"] == "sent"
    assert items[0]["error"] is None
    assert items[1]["channel"] == "email"
    assert items[1]["status"] == "failed"
    assert items[1]["error"] == "SMTP 未配置"
    assert items[1]["task_title"] == "带标题的任务"


@pytest.mark.asyncio
async def test_records_requires_auth(client: AsyncClient):
    r = await client.get("/api/v1/notify/records")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_test_send_email_without_smtp_reports_error_and_records(
    client: AsyncClient, auth_headers, test_user, db_session, monkeypatch
):
    """SMTP 未配置：ok=false 带原因，且写入 failed 记录。"""
    from app.services import smtp_settings

    async def _no_smtp(db=None, *, user=None, company_id=None):
        return None

    monkeypatch.setattr(smtp_settings, "resolve_smtp", _no_smtp)

    r = await client.post(
        "/api/v1/notify/test-send", headers=auth_headers, json={"channel": "email"}
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["ok"] is False
    assert "SMTP" in data["error"]

    rows = (
        await db_session.execute(
            select(NotificationRecord).where(
                NotificationRecord.user_id == test_user.id
            )
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].channel == "email"
    assert rows[0].status == "failed"
    assert rows[0].error


@pytest.mark.asyncio
async def test_test_send_email_success_records_sent(
    client: AsyncClient, auth_headers, test_user, db_session, monkeypatch
):
    from app.services import smtp_settings
    from app.services.smtp_settings import ResolvedSmtp
    from app.utils import email as email_utils

    async def _fake_smtp(db=None, *, user=None, company_id=None):
        return ResolvedSmtp(
            host="smtp.example.com",
            port=465,
            user="bot@example.com",
            password="secret",
            from_addr="bot@example.com",
            source="env",
        )

    sent = {}

    def _fake_send(**kwargs):
        sent.update(kwargs)
        return True

    monkeypatch.setattr(smtp_settings, "resolve_smtp", _fake_smtp)
    monkeypatch.setattr(email_utils, "_send_smtp", _fake_send)

    r = await client.post(
        "/api/v1/notify/test-send", headers=auth_headers, json={"channel": "email"}
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["ok"] is True
    assert data["error"] is None
    assert sent["to_email"] == test_user.email

    rows = (
        await db_session.execute(
            select(NotificationRecord).where(
                NotificationRecord.user_id == test_user.id
            )
        )
    ).scalars().all()
    assert [(x.channel, x.status) for x in rows] == [("email", "sent")]


@pytest.mark.asyncio
async def test_test_send_webpush_without_subscription_fails_and_records(
    client: AsyncClient, auth_headers, test_user, db_session, monkeypatch
):
    from app.utils import web_push as web_push_utils

    monkeypatch.setattr(web_push_utils, "get_subscriptions", lambda user_id: [])

    r = await client.post(
        "/api/v1/notify/test-send", headers=auth_headers, json={"channel": "webpush"}
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["ok"] is False
    assert "订阅" in data["error"]

    rows = (
        await db_session.execute(
            select(NotificationRecord).where(
                NotificationRecord.user_id == test_user.id
            )
        )
    ).scalars().all()
    assert [(x.channel, x.status) for x in rows] == [("webpush", "failed")]


@pytest.mark.asyncio
async def test_test_send_rejects_unknown_channel(client: AsyncClient, auth_headers):
    r = await client.post(
        "/api/v1/notify/test-send", headers=auth_headers, json={"channel": "sms"}
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_test_send_requires_auth(client: AsyncClient):
    r = await client.post("/api/v1/notify/test-send", json={"channel": "email"})
    assert r.status_code == 401


def test_reminder_send_path_writes_records(sync_db_session, monkeypatch):
    """真实提醒发送路径：每个渠道尝试各留一条记录，失败带原因。"""
    from app.core.security import get_password_hash
    from app.models.user import User
    from app.services.reminder_service import ReminderService
    from app.models.reminder import Reminder

    user = User(
        username="reminder-record-user",
        email="rr@example.com",
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
        notify_channels="email,web_push",
    )
    sync_db_session.add(reminder)
    sync_db_session.commit()

    calls = []

    def _fake_send(channel, user, task, reminder):
        calls.append(channel)
        if channel == "email":
            return True, None
        return False, "无订阅"

    monkeypatch.setattr(ReminderService, "_send_by_channel", staticmethod(_fake_send))

    results = ReminderService.check_and_send_reminders(sync_db_session)
    assert len(results) == 1
    assert calls == ["email", "web_push"]

    rows = (
        sync_db_session.query(NotificationRecord)
        .order_by(NotificationRecord.id)
        .all()
    )
    assert [(r.channel, r.status) for r in rows] == [
        ("email", "sent"),
        ("web_push", "failed"),
    ]
    assert rows[0].error is None
    assert rows[1].error == "无订阅"
    assert rows[1].task_id == task.id
