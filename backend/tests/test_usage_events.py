"""轻遥测：批量写入（截断）/ 汇总权限 / 聚合口径"""
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.company import Company, CompanyMembership
from app.models.usage_event import UsageEvent


@pytest.mark.asyncio
async def test_track_events_writes_for_current_user(
    client: AsyncClient, auth_headers, test_user, db_session
):
    r = await client.post(
        "/api/v1/events",
        headers=auth_headers,
        json={
            "events": [
                {"name": "task_completed", "props": {"view": "dashboard"}},
                {"name": "view_calendar", "ts": "2026-08-13T10:00:00"},
            ]
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["accepted"] == 2

    rows = (
        await db_session.execute(
            select(UsageEvent).where(UsageEvent.user_id == test_user.id)
        )
    ).scalars().all()
    assert {e.name for e in rows} == {"task_completed", "view_calendar"}
    props = {e.name: e.props for e in rows}
    assert props["task_completed"] == {"view": "dashboard"}


@pytest.mark.asyncio
async def test_track_events_truncates_over_50(
    client: AsyncClient, auth_headers, test_user, db_session
):
    r = await client.post(
        "/api/v1/events",
        headers=auth_headers,
        json={"events": [{"name": f"e{i}"} for i in range(60)]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["accepted"] == 50

    from sqlalchemy import func

    count = (
        await db_session.execute(
            select(func.count(UsageEvent.id)).where(
                UsageEvent.user_id == test_user.id
            )
        )
    ).scalar()
    assert count == 50


@pytest.mark.asyncio
async def test_track_events_requires_auth(client: AsyncClient):
    r = await client.post("/api/v1/events", json={"events": [{"name": "x"}]})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_summary_rejects_non_superadmin(
    client: AsyncClient, auth_headers, test_user
):
    r = await client.get("/api/v1/events/summary?days=7", headers=auth_headers)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_summary_aggregates_for_superadmin(
    client: AsyncClient, auth_headers, test_user, db_session
):
    company = Company(name="测试公司", slug="telemetry-co", status="active")
    db_session.add(company)
    await db_session.flush()
    db_session.add(
        CompanyMembership(
            company_id=company.id,
            user_id=test_user.id,
            status="active",
            is_super_admin=True,
        )
    )
    db_session.add_all(
        [
            UsageEvent(user_id=test_user.id, name="task_completed"),
            UsageEvent(user_id=test_user.id, name="task_completed"),
            UsageEvent(user_id=test_user.id, name="view_calendar"),
        ]
    )
    await db_session.commit()

    r = await client.get("/api/v1/events/summary?days=7", headers=auth_headers)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["days"] == 7
    counts = {item["name"]: item["count"] for item in data["items"]}
    assert counts == {"task_completed": 2, "view_calendar": 1}
    # 按计数降序
    assert data["items"][0]["name"] == "task_completed"
