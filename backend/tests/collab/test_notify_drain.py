"""notify_jobs 队列消费回归测试。

历史缺陷：evidence_service / progress_alert 等只往 notify_jobs 里 enqueue，
全应用没有任何地方调用 process_one_job —— 材料采纳/驳回、进度告警等协作通知
一条都发不出去，队列还无限堆积。现由 main.drain_notify_jobs 周期消费。
"""
import pytest
from sqlalchemy import select

from app.models.notify import CollabInboxMessage, NotifyJob


async def _drain(monkeypatch, db_session):
    """用测试库的 session 工厂替换全局工厂后触发一次消费。"""
    import app.db.session as dbsession
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

    factory = async_sessionmaker(
        db_session.bind, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr(dbsession, "async_session_factory", factory)

    from app.main import drain_notify_jobs

    return await drain_notify_jobs()


@pytest.mark.asyncio
async def test_pending_in_app_job_is_delivered(monkeypatch, db_session, seed_ids):
    db_session.add(
        NotifyJob(
            company_id=seed_ids["company_id"],
            user_id=seed_ids["pm_user_id"],
            channel="in_app",
            template_key="evidence.rejected",
            payload_json={"node_title": "样品送检"},
            status="pending",
        )
    )
    await db_session.commit()

    result = await _drain(monkeypatch, db_session)
    assert result["sent"] == 1, result

    job = (await db_session.execute(select(NotifyJob))).scalars().one()
    await db_session.refresh(job)
    assert job.status == "sent"
    assert job.sent_at is not None

    # in_app 渠道在消费时才落站内信，此前用户永远收不到
    msgs = (await db_session.execute(select(CollabInboxMessage))).scalars().all()
    assert len(msgs) == 1
    assert msgs[0].template_key == "evidence.rejected"


@pytest.mark.asyncio
async def test_failed_job_retries_then_goes_dead(monkeypatch, db_session, seed_ids):
    """未知渠道必然失败：应重试到上限后置 dead，而不是无限重试堵住队列"""
    from app.main import NOTIFY_MAX_ATTEMPTS

    db_session.add(
        NotifyJob(
            company_id=seed_ids["company_id"],
            user_id=seed_ids["pm_user_id"],
            channel="carrier_pigeon",  # 未知渠道
            template_key="evidence.rejected",
            payload_json={},
            status="pending",
        )
    )
    await db_session.commit()

    for i in range(1, NOTIFY_MAX_ATTEMPTS + 1):
        await _drain(monkeypatch, db_session)
        job = (await db_session.execute(select(NotifyJob))).scalars().one()
        await db_session.refresh(job)
        assert job.attempts == i
        expected = "dead" if i >= NOTIFY_MAX_ATTEMPTS else "pending"
        assert job.status == expected, f"第 {i} 次后应为 {expected}"

    # 置 dead 后不再被取走
    result = await _drain(monkeypatch, db_session)
    assert result["sent"] == 0 and result["failed"] == 0


@pytest.mark.asyncio
async def test_drain_is_noop_when_queue_empty(monkeypatch, db_session, seed_ids):
    result = await _drain(monkeypatch, db_session)
    assert result == {"sent": 0, "failed": 0}
