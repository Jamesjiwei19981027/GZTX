"""注册双验证与补验接口测试"""
import pytest
from httpx import AsyncClient

from app.core.config import settings


@pytest.mark.asyncio
async def test_send_code_invalid_phone(client: AsyncClient):
    r = await client.post(
        "/api/v1/auth/send-code", json={"channel": "sms", "target": "12345"}
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_send_code_resend_throttle(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "DEBUG", True)
    r1 = await client.post(
        "/api/v1/auth/send-code", json={"channel": "sms", "target": "13911110001"}
    )
    assert r1.status_code == 200
    r2 = await client.post(
        "/api/v1/auth/send-code", json={"channel": "sms", "target": "13911110001"}
    )
    assert r2.status_code == 429


@pytest.mark.asyncio
async def test_send_code_registered_email_rejected(client: AsyncClient, test_user):
    r = await client.post(
        "/api/v1/auth/send-code",
        json={"channel": "email", "target": "test@example.com"},
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_unverified_user_blocked_from_task_create(client: AsyncClient, db_session):
    """未验证账号被关键写接口拒绝（40320）"""
    from app.core.security import create_access_token, get_password_hash
    from app.models.user import User

    u = User(
        username="unverified1",
        email="unverified1@example.com",
        password_hash=get_password_hash("password123"),
        nickname="Unverified",
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)

    headers = {"Authorization": f"Bearer {create_access_token(data={'sub': u.id})}"}
    r = await client.post(
        "/api/v1/tasks", headers=headers, json={"title": "should be blocked"}
    )
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == 40320

    # 读接口不受限
    r2 = await client.get("/api/v1/tasks", headers=headers)
    assert r2.status_code == 200


@pytest.mark.asyncio
async def test_bind_flow_completes_verification(client: AsyncClient, db_session, monkeypatch):
    """登录后补验：send-code + confirm 后解除受限"""
    monkeypatch.setattr(settings, "DEBUG", True)
    from app.core.security import create_access_token, get_password_hash
    from app.models.user import User

    from app.models.category import Category

    u = User(
        username="unverified2",
        email="unverified2@example.com",
        password_hash=get_password_hash("password123"),
        nickname="Unverified2",
    )
    db_session.add(u)
    await db_session.flush()
    db_session.add(
        Category(user_id=u.id, name="默认", color="#409EFF", is_default=True, sort_order=0)
    )
    await db_session.commit()
    await db_session.refresh(u)
    headers = {"Authorization": f"Bearer {create_access_token(data={'sub': u.id})}"}

    # 状态查询
    st = await client.get("/api/v1/users/me/verification", headers=headers)
    assert st.status_code == 200
    assert st.json()["data"]["is_verified"] is False

    # 补验邮箱
    r = await client.post(
        "/api/v1/users/me/verification/send-code",
        headers=headers,
        json={"channel": "email", "target": "unverified2@example.com"},
    )
    assert r.status_code == 200, r.text
    code = r.json()["data"]["debug_code"]
    r = await client.post(
        "/api/v1/users/me/verification/confirm",
        headers=headers,
        json={"channel": "email", "target": "unverified2@example.com", "code": code},
    )
    assert r.status_code == 200
    assert r.json()["data"]["email_verified"] is True

    # 补验手机
    r = await client.post(
        "/api/v1/users/me/verification/send-code",
        headers=headers,
        json={"channel": "sms", "target": "13911110002"},
    )
    assert r.status_code == 200
    code = r.json()["data"]["debug_code"]
    r = await client.post(
        "/api/v1/users/me/verification/confirm",
        headers=headers,
        json={"channel": "sms", "target": "13911110002", "code": code},
    )
    assert r.status_code == 200
    assert r.json()["data"]["is_verified"] is True

    # 解除受限
    r = await client.post(
        "/api/v1/tasks", headers=headers, json={"title": "now allowed"}
    )
    assert r.status_code == 201


@pytest.mark.asyncio
async def test_wx_fake_phone_bind(client: AsyncClient, db_session, monkeypatch):
    """DEBUG 下 fake:code 绑定手机号"""
    monkeypatch.setattr(settings, "DEBUG", True)
    from app.core.security import create_access_token, get_password_hash
    from app.models.user import User

    u = User(
        username="wxuser1",
        password_hash=get_password_hash("password123"),
        nickname="WX",
    )
    db_session.add(u)
    await db_session.commit()
    await db_session.refresh(u)
    headers = {"Authorization": f"Bearer {create_access_token(data={'sub': u.id})}"}

    r = await client.post(
        "/api/v1/users/me/bind-phone-wx",
        headers=headers,
        json={"code": "fake:13911110003"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["data"]["phone_verified"] is True
