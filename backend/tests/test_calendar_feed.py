"""ICS 订阅地址：per-user 落库令牌 + 可重置 + feed-url 端点"""
from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient

from app.models.category import Category
from app.models.task import Task


async def _create_task_with_due(db_session, user_id: int, title: str):
    due = (datetime.utcnow() + timedelta(days=1)).replace(microsecond=0)
    cat = Category(user_id=user_id, name="默认", color="#409EFF", is_default=True)
    db_session.add(cat)
    await db_session.flush()
    db_session.add(Task(user_id=user_id, category_id=cat.id, title=title, due_date=due))
    await db_session.commit()


@pytest.mark.asyncio
async def test_feed_url_returns_usable_subscription_path(
    client: AsyncClient, auth_headers, test_user, db_session
):
    """feed-url 返回带令牌的相对路径，且该路径可匿名拉取 ICS"""
    await _create_task_with_due(db_session, test_user.id, "订阅测试任务")

    r = await client.get("/api/v1/tasks/calendar-feed-url", headers=auth_headers)
    assert r.status_code == 200, r.text
    url = r.json()["data"]["url"]
    assert url.startswith("/api/v1/tasks/calendar/")
    assert url.endswith(".ics")
    # 令牌不再由 user_id 推导，URL 里也不再暴露 user_id
    assert f"/{test_user.id}.ics" not in url

    # 匿名（无 Authorization 头）拉取
    feed = await client.get(url)
    assert feed.status_code == 200, feed.text
    assert feed.headers["content-type"].startswith("text/calendar")
    assert "BEGIN:VCALENDAR" in feed.text
    assert "订阅测试任务" in feed.text


@pytest.mark.asyncio
async def test_feed_with_wrong_token_rejected(client: AsyncClient, test_user):
    r = await client.get("/api/v1/tasks/calendar/deadbeefdeadbeef.ics")
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_feed_url_is_stable_until_reset(
    client: AsyncClient, auth_headers, test_user, db_session
):
    """重复取地址不换令牌；显式 reset 后旧地址立即失效"""
    await _create_task_with_due(db_session, test_user.id, "订阅测试任务")

    first = (
        await client.get("/api/v1/tasks/calendar-feed-url", headers=auth_headers)
    ).json()["data"]["url"]
    second = (
        await client.get("/api/v1/tasks/calendar-feed-url", headers=auth_headers)
    ).json()["data"]["url"]
    assert first == second

    reset = await client.post(
        "/api/v1/tasks/calendar-feed-url/reset", headers=auth_headers
    )
    assert reset.status_code == 200, reset.text
    rotated = reset.json()["data"]["url"]
    assert rotated != first

    assert (await client.get(first)).status_code == 403
    assert (await client.get(rotated)).status_code == 200


@pytest.mark.asyncio
async def test_export_ics_still_requires_auth(client: AsyncClient, auth_headers):
    """既有的一次性导出端点行为不变：无 Bearer 401，带 Bearer 可下载"""
    anon = await client.get("/api/v1/tasks/export.ics")
    assert anon.status_code in (401, 403)

    authed = await client.get("/api/v1/tasks/export.ics", headers=auth_headers)
    assert authed.status_code == 200
    assert "BEGIN:VCALENDAR" in authed.text
