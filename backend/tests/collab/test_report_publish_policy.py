"""项目汇总确认发布 + 汇报策略（周期 / 截止 / 提醒）与调度器读取"""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.notify import NotifyJob
from app.models.report import AgentReport, ProjectReportEnvelope
from app.services.hierarchical_reporting import bind_project_agents
from app.services.report_policy_schedule import (
    current_period,
    normalize_policy_config,
    run_policy_reminders,
)

API = "/api/v1"


async def _bindings(db_session, seed):
    return await bind_project_agents(
        db_session,
        project_id=seed["project_id"],
        company_id=seed["company_id"],
        actor_user_id=seed["pm_user_id"],
    )


async def _make_envelope(db_session, seed) -> ProjectReportEnvelope:
    bindings = await _bindings(db_session, seed)
    project_binding = next(b for b in bindings if b.role == "project")
    env = ProjectReportEnvelope(
        company_id=seed["company_id"],
        project_id=seed["project_id"],
        project_binding_id=project_binding.id,
        status="submitted",
        summary_text="【演示项目】项目汇报\n已收到 2 份下属智能体汇报。",
        payload_json={"report_count": 2, "source_count": 3},
    )
    db_session.add(env)
    await db_session.commit()
    return env


@pytest.mark.asyncio
async def test_publish_summary_visible_to_members_only_after_publish(
    async_client, seed_ids, db_session
):
    env = await _make_envelope(db_session, seed_ids)
    pid = seed_ids["project_id"]

    # 发布前：成员看不到，负责人能看到待发布版本
    r = await async_client.get(f"{API}/projects/{pid}/report-summaries", headers=seed_ids["member_headers"])
    assert r.status_code == 200
    assert r.json()["data"]["items"] == [] and r.json()["data"]["can_publish"] is False
    r = await async_client.get(f"{API}/projects/{pid}/report-summaries", headers=seed_ids["pm_headers"])
    assert [i["status"] for i in r.json()["data"]["items"]] == ["submitted"]
    assert r.json()["data"]["can_publish"] is True

    # 成员不能发布
    r = await async_client.post(
        f"{API}/projects/{pid}/report-summaries/{env.id}/publish", headers=seed_ids["member_headers"]
    )
    assert r.status_code == 403

    r = await async_client.post(
        f"{API}/projects/{pid}/report-summaries/{env.id}/publish", headers=seed_ids["pm_headers"]
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["status"] == "published" and data["published_at"]

    # 发布后：成员和公司上级（超管）都能读到已发布版本
    for headers in (seed_ids["member_headers"], seed_ids["super_admin_headers"]):
        r = await async_client.get(f"{API}/projects/{pid}/report-summaries", headers=headers)
        body = r.json()["data"]
        assert body["latest_published"]["id"] == env.id
        assert body["latest_published"]["summary_text"].startswith("【演示项目】")
    # 外部人员不行
    r = await async_client.get(f"{API}/projects/{pid}/report-summaries", headers=seed_ids["outsider_headers"])
    assert r.status_code == 403
    # 重复发布 409
    r = await async_client.post(
        f"{API}/projects/{pid}/report-summaries/{env.id}/publish", headers=seed_ids["pm_headers"]
    )
    assert r.status_code == 409
    # 成员收到站内通知任务
    jobs = (
        await db_session.execute(
            select(NotifyJob).where(NotifyJob.template_key == "project.report.published")
        )
    ).scalars().all()
    assert seed_ids["member_user_id"] in [j.user_id for j in jobs]


@pytest.mark.asyncio
async def test_policy_put_roundtrip_and_validation(async_client, seed_ids):
    pid = seed_ids["project_id"]
    r = await async_client.put(
        f"{API}/projects/{pid}/report-policy",
        json={"period": "weekly", "weekday": 3, "deadline_time": "17:30", "remind": True},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200, r.text
    r = await async_client.get(f"{API}/projects/{pid}/report-policies", headers=seed_ids["member_headers"])
    item = r.json()["data"]["items"][0]
    assert item["period"] == "weekly" and item["weekday"] == 3
    assert item["deadline_time"] == "17:30" and item["remind"] is True and item["trigger"] == "cron"

    bad = await async_client.put(
        f"{API}/projects/{pid}/report-policy", json={"period": "hourly"}, headers=seed_ids["pm_headers"]
    )
    assert bad.status_code == 422
    bad = await async_client.put(
        f"{API}/projects/{pid}/report-policy", json={"deadline_time": "25:99"}, headers=seed_ids["pm_headers"]
    )
    assert bad.status_code == 422
    denied = await async_client.put(
        f"{API}/projects/{pid}/report-policy", json={"remind": False}, headers=seed_ids["member_headers"]
    )
    assert denied.status_code == 403


def _local(y, m, d, hh, mm):
    """构造「用户本地时间」对应的 UTC 时刻（调度器用 UTC 入参）。"""
    return datetime(y, m, d, hh, mm) - timedelta(hours=settings.USER_TIMEZONE_OFFSET)


@pytest.mark.asyncio
async def test_scheduler_reads_saved_policy_and_reminds_unsubmitted(
    async_client, seed_ids, db_session
):
    """写读一致：接口保存的周期 / 截止 / 提醒，被调度器函数真实读取并生效。"""
    pid = seed_ids["project_id"]
    # 2026-11-06 是周五
    r = await async_client.put(
        f"{API}/projects/{pid}/report-policy",
        json={"period": "weekly", "weekday": 5, "deadline_time": "18:00", "remind": True},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200

    # 周四 17:30：不是截止日，不提醒
    res = await run_policy_reminders(db_session, _local(2026, 11, 5, 17, 30))
    assert res["users"] == 0
    # 周五 08:00：还没进入提醒窗口（默认提前 2 小时）
    res = await run_policy_reminders(db_session, _local(2026, 11, 6, 8, 0))
    assert res["users"] == 0

    # 周五 17:00：在窗口内；member 本周已提交，不再提醒他
    bindings = await _bindings(db_session, seed_ids)
    member_binding = next(b for b in bindings if b.user_id == seed_ids["member_user_id"])
    db_session.add(
        AgentReport(
            company_id=seed_ids["company_id"],
            project_id=pid,
            binding_id=member_binding.id,
            author_user_id=seed_ids["member_user_id"],
            status="submitted",
            summary_text="本周完成",
            payload_json={},
            submitted_at=_local(2026, 11, 5, 10, 0),
        )
    )
    await db_session.commit()
    res = await run_policy_reminders(db_session, _local(2026, 11, 6, 17, 0))
    await db_session.commit()
    jobs = (
        await db_session.execute(
            select(NotifyJob).where(NotifyJob.template_key == "report.policy.reminder")
        )
    ).scalars().all()
    reminded = {j.user_id for j in jobs}
    assert seed_ids["member_user_id"] not in reminded
    assert seed_ids["pm_user_id"] in reminded
    assert res["users"] >= 1

    # 同一周期不重复提醒
    again = await run_policy_reminders(db_session, _local(2026, 11, 6, 17, 20))
    assert again["users"] == 0


@pytest.mark.asyncio
async def test_scheduler_respects_remind_off_and_period(async_client, seed_ids, db_session):
    pid = seed_ids["project_id"]
    await async_client.put(
        f"{API}/projects/{pid}/report-policy",
        json={"period": "daily", "deadline_time": "18:00", "remind": False},
        headers=seed_ids["pm_headers"],
    )
    res = await run_policy_reminders(db_session, _local(2026, 11, 6, 17, 30))
    assert res["users"] == 0  # 关闭提醒就不发

    await async_client.put(
        f"{API}/projects/{pid}/report-policy",
        json={"remind": True},
        headers=seed_ids["pm_headers"],
    )
    res = await run_policy_reminders(db_session, _local(2026, 11, 6, 17, 30))
    assert res["users"] >= 1  # 每日策略，任何一天都是截止日


def test_current_period_rules():
    cfg = normalize_policy_config({"period": "monthly", "month_day": 15, "deadline_time": "9:05"})
    assert cfg["deadline_time"] == "09:05"
    assert current_period(cfg, datetime(2026, 11, 14, 9, 0)) is None
    key, start, deadline = current_period(cfg, datetime(2026, 11, 15, 8, 0))
    assert key == "2026-11" and start.day == 1 and deadline.hour == 9 and deadline.minute == 5
    weekly = {"period": "weekly", "weekday": 1}
    assert current_period(weekly, datetime(2026, 11, 9, 7, 0))[0].startswith("2026-W")
    assert current_period(weekly, datetime(2026, 11, 10, 7, 0)) is None


@pytest.mark.asyncio
async def test_progress_note_saved_as_visible_draft(async_client, seed_ids):
    """C-6：记录进展存为汇报草稿后，能在「我的汇报」列表里读到草稿，连续记录会追加。"""
    pid = seed_ids["project_id"]
    r = await async_client.post(
        f"{API}/projects/{pid}/agent-reports/note-draft",
        json={"text": "今天完成了接口联调"},
        headers=seed_ids["member_headers"],
    )
    assert r.status_code == 200, r.text
    first_id = r.json()["data"]["id"]
    assert r.json()["data"]["status"] == "draft"
    r = await async_client.post(
        f"{API}/projects/{pid}/agent-reports/note-draft",
        json={"text": "明天对接测试"},
        headers=seed_ids["member_headers"],
    )
    assert r.json()["data"]["id"] == first_id

    mine = await async_client.get(f"{API}/reports/my?project_id={pid}", headers=seed_ids["member_headers"])
    drafts = [i for i in mine.json()["data"]["items"] if i["status"] == "draft"]
    assert len(drafts) == 1 and drafts[0]["id"] == first_id
    assert "接口联调" in drafts[0]["summary_text"] and "明天对接测试" in drafts[0]["summary_text"]
    assert len(drafts[0]["sources"]) == 2

    # 外部人员不能往别人项目里写草稿
    r = await async_client.post(
        f"{API}/projects/{pid}/agent-reports/note-draft",
        json={"text": "x"},
        headers=seed_ids["outsider_headers"],
    )
    assert r.status_code == 403
