"""阶段 3 安全 P0：附件白名单、一次性下载票据、删号撤销会话。"""
import io

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.security import create_access_token, create_refresh_token, decode_token
from app.models.category import Category
from app.models.notify import PushSubscription
from app.models.task import Task


async def _seed_task(db_session, user_id: int) -> int:
    cat = Category(user_id=user_id, name="默认", color="#409EFF", is_default=True)
    db_session.add(cat)
    await db_session.flush()
    task = Task(user_id=user_id, category_id=cat.id, title="附件宿主")
    db_session.add(task)
    await db_session.commit()
    return task.id


@pytest.mark.asyncio
async def test_upload_rejects_html_svg_js(
    client: AsyncClient, auth_headers, test_user, db_session
):
    task_id = await _seed_task(db_session, test_user.id)
    for name, mime in (
        ("xss.html", "text/html"),
        ("vector.svg", "image/svg+xml"),
        ("payload.js", "application/javascript"),
    ):
        r = await client.post(
            f"/api/v1/tasks/{task_id}/attachments",
            headers=auth_headers,
            files={"file": (name, io.BytesIO(b"<script>alert(1)</script>"), mime)},
        )
        assert r.status_code == 400, r.text
        assert "不支持的文件类型" in r.text


@pytest.mark.asyncio
async def test_download_uses_one_time_ticket_not_jwt_query(
    client: AsyncClient, auth_headers, test_user, db_session
):
    task_id = await _seed_task(db_session, test_user.id)
    uploaded = await client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        headers=auth_headers,
        files={"file": ("note.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert uploaded.status_code == 201, uploaded.text
    attachment_id = uploaded.json()["data"]["id"]

    # 旧路径：access token 进 query 必须拒绝
    token = auth_headers["Authorization"].split(" ", 1)[1]
    leaked = await client.get(
        f"/api/v1/attachments/{attachment_id}/download?token={token}"
    )
    assert leaked.status_code == 401, leaked.text

    ticket_res = await client.post(
        f"/api/v1/attachments/{attachment_id}/download-ticket",
        headers=auth_headers,
    )
    assert ticket_res.status_code == 200, ticket_res.text
    ticket_url = ticket_res.json()["data"]["url"]
    assert "ticket=" in ticket_url
    assert "token=" not in ticket_url

    first = await client.get(ticket_url)
    assert first.status_code == 200, first.text
    assert first.content == b"hello"
    assert first.headers.get("x-content-type-options") == "nosniff"
    assert "attachment" in (first.headers.get("content-disposition") or "").lower()
    assert (first.headers.get("content-type") or "").startswith("application/octet-stream")

    # 一次性：再用同一票据应失败
    replay = await client.get(ticket_url)
    assert replay.status_code == 401, replay.text


@pytest.mark.asyncio
async def test_delete_account_revokes_sessions_and_clears_wechat(
    client: AsyncClient, test_user, db_session, auth_headers
):
    test_user.wx_openid = "openid-keep"
    test_user.wx_unionid = "union-keep"
    db_session.add(
        PushSubscription(
            user_id=test_user.id,
            endpoint="https://push.example/device",
            subscription_json={"endpoint": "https://push.example/device"},
        )
    )
    await db_session.commit()

    access = create_access_token(data={"sub": test_user.id})
    refresh = create_refresh_token(data={"sub": test_user.id})
    headers = {"Authorization": f"Bearer {access}"}

    deleted = await client.post(
        "/api/v1/users/me/delete",
        headers=headers,
        json={"password": "testpassword", "confirmation": "DELETE"},
    )
    assert deleted.status_code == 200, deleted.text

    await db_session.refresh(test_user)
    assert test_user.is_active is False
    assert test_user.wx_openid is None
    assert test_user.wx_unionid is None
    assert test_user.sessions_revoked_at is not None
    assert test_user.calendar_feed_token is None
    leftover = (
        await db_session.execute(
            select(PushSubscription).where(PushSubscription.user_id == test_user.id)
        )
    ).scalar_one_or_none()
    assert leftover is None

    me = await client.get("/api/v1/users/me", headers=headers)
    assert me.status_code in (401, 403), me.text

    refreshed = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert refreshed.status_code == 401, refreshed.text
    assert decode_token(refresh) is not None  # JWT 本身未过期，是水位线拦住的


def test_token_revoked_for_user_compares_iat_inclusive():
    from datetime import datetime, timezone

    from app.core.security import token_revoked_for_user

    now = datetime(2026, 9, 3, 12, 0, 0, tzinfo=timezone.utc)
    payload = {"iat": int(now.timestamp())}
    assert token_revoked_for_user(payload, now) is True
    assert token_revoked_for_user(payload, None) is False
    assert token_revoked_for_user({}, now) is True
