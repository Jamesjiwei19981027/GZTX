"""ICS 订阅地址：HMAC 签名鉴权 + feed-url 端点"""
from datetime import datetime, timedelta

import pytest
from httpx import AsyncClient

from app.api.v1.tasks import calendar_feed_sig
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
    """feed-url 返回带签名的相对路径，且该路径可匿名拉取 ICS"""
    await _create_task_with_due(db_session, test_user.id, "订阅测试任务")

    r = await client.get("/api/v1/tasks/calendar-feed-url", headers=auth_headers)
    assert r.status_code == 200, r.text
    url = r.json()["data"]["url"]
    assert url == f"/api/v1/tasks/calendar/{test_user.id}.ics?sig={calendar_feed_sig(test_user.id)}"

    # 匿名（无 Authorization 头）拉取
    feed = await client.get(url)
    assert feed.status_code == 200, feed.text
    assert feed.headers["content-type"].startswith("text/calendar")
    assert "BEGIN:VCALENDAR" in feed.text
    assert "订阅测试任务" in feed.text


@pytest.mark.asyncio
async def test_feed_with_wrong_sig_rejected(client: AsyncClient, test_user):
    r = await client.get(
        f"/api/v1/tasks/calendar/{test_user.id}.ics?sig=deadbeefdeadbeef"
    )
    assert r.status_code == 403

    # 缺 sig 也拒绝
    r2 = await client.get(f"/api/v1/tasks/calendar/{test_user.id}.ics")
    assert r2.status_code == 403


@pytest.mark.asyncio
async def test_feed_sig_is_user_bound(client: AsyncClient, test_user):
    """A 用户的签名不能拉 B 用户的日历"""
    other_user_id = test_user.id + 100
    r = await client.get(
        f"/api/v1/tasks/calendar/{other_user_id}.ics?sig={calendar_feed_sig(test_user.id)}"
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_export_ics_still_requires_auth(client: AsyncClient, auth_headers):
    """既有的一次性导出端点行为不变：无 Bearer 401，带 Bearer 可下载"""
    anon = await client.get("/api/v1/tasks/export.ics")
    assert anon.status_code in (401, 403)

    authed = await client.get("/api/v1/tasks/export.ics", headers=auth_headers)
    assert authed.status_code == 200
    assert "BEGIN:VCALENDAR" in authed.text
