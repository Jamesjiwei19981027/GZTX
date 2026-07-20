from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.notify import NotifyJob
from app.models.progress import ProgressRecord
from app.models.tree import TreeNode
from app.services.notify.service import NotificationService
from app.workers.notify_worker import process_one_job


@pytest.mark.asyncio
async def test_enqueue_creates_jobs_per_channel(db_session: AsyncSession, seed_ids):
    svc = NotificationService()
    ids = await svc.enqueue(
        db_session,
        company_id=seed_ids["company_id"],
        user_ids=[seed_ids["member_user_id"]],
        template_key="evidence.adopted",
        payload={"package_id": 1, "node_title": "登录"},
        channels=["in_app", "email"],
    )
    assert len(ids) == 2
    q = await db_session.execute(select(NotifyJob).where(NotifyJob.id.in_(ids)))
    jobs = list(q.scalars().all())
    assert {j.channel for j in jobs} == {"in_app", "email"}
    assert all(j.status == "pending" for j in jobs)


@pytest.mark.asyncio
async def test_worker_marks_sent(db_session: AsyncSession, seed_ids, monkeypatch):
    svc = NotificationService()
    ids = await svc.enqueue(
        db_session,
        company_id=seed_ids["company_id"],
        user_ids=[seed_ids["member_user_id"]],
        template_key="evidence.adopted",
        payload={"node_title": "登录"},
        channels=["email"],
    )
    monkeypatch.setattr(
        "app.services.notify.channels.send_email_channel",
        AsyncMock(return_value=True),
    )
    job = await process_one_job(db_session, ids[0])
    assert job is not None
    assert job.status == "sent"
    assert job.sent_at is not None


@pytest.mark.asyncio
async def test_worker_in_app_writes_inbox(db_session: AsyncSession, seed_ids):
    from app.models.notify import CollabInboxMessage

    svc = NotificationService()
    ids = await svc.enqueue(
        db_session,
        company_id=seed_ids["company_id"],
        user_ids=[seed_ids["member_user_id"]],
        template_key="evidence.adopted",
        payload={"node_title": "登录"},
        channels=["in_app"],
    )
    await process_one_job(db_session, ids[0])
    q = await db_session.execute(
        select(CollabInboxMessage).where(
            CollabInboxMessage.user_id == seed_ids["member_user_id"]
        )
    )
    msg = q.scalar_one_or_none()
    assert msg is not None
    assert "登录" in (msg.body_text or "")


@pytest.mark.asyncio
async def test_progress_burst_alerts_pm(db_session: AsyncSession, seed_ids):
    from app.services.progress_alert import check_and_alert

    node_id = seed_ids["node_id"]
    company_id = seed_ids["company_id"]
    project_id = seed_ids["project_id"]
    now = datetime.now(timezone.utc)
    for i in range(21):
        db_session.add(
            ProgressRecord(
                company_id=company_id,
                project_id=project_id,
                node_id=node_id,
                event_type="set_status",
                source="test",
                after_json={"pct": i},
                created_at=now - timedelta(seconds=i),
            )
        )
    await db_session.flush()

    alerted = await check_and_alert(db_session, node_id)
    assert alerted is True
    q = await db_session.execute(
        select(NotifyJob).where(NotifyJob.template_key == "progress.auto_write_alert")
    )
    jobs = list(q.scalars().all())
    assert len(jobs) >= 1
