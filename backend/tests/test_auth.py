import pytest
from httpx import AsyncClient

from app.core.config import settings


async def request_codes(client: AsyncClient, email: str, phone: str) -> tuple[str, str]:
    """发注册双码并取回 debug_code（测试环境 DEBUG=true）"""
    r1 = await client.post(
        "/api/v1/auth/send-code", json={"channel": "email", "target": email}
    )
    assert r1.status_code == 200, r1.text
    r2 = await client.post(
        "/api/v1/auth/send-code", json={"channel": "sms", "target": phone}
    )
    assert r2.status_code == 200, r2.text
    return r1.json()["data"]["debug_code"], r2.json()["data"]["debug_code"]


@pytest.mark.asyncio
async def test_register(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "DEBUG", True)
    email_code, phone_code = await request_codes(
        client, "newuser@example.com", "13900000001"
    )
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "newuser",
            "password": "password123",
            "email": "newuser@example.com",
            "phone": "13900000001",
            "email_code": email_code,
            "phone_code": phone_code,
            "nickname": "New User",
        },
    )
    assert response.status_code in (200, 201), response.text
    data = response.json()
    assert data["code"] == 200
    assert data["data"]["access_token"] is not None
    assert data["data"]["refresh_token"] is not None
    assert data["data"]["user"]["username"] == "newuser"
    assert data["data"]["user"]["email_verified"] is True
    assert data["data"]["user"]["phone_verified"] is True


@pytest.mark.asyncio
async def test_register_requires_codes(client: AsyncClient):
    """缺验证码直接 422"""
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "nocodeuser",
            "password": "password123",
            "email": "nocode@example.com",
            "phone": "13900000002",
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_register_wrong_code_rejected(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "DEBUG", True)
    email_code, phone_code = await request_codes(
        client, "wrongcode@example.com", "13900000003"
    )
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "wrongcodeuser",
            "password": "password123",
            "email": "wrongcode@example.com",
            "phone": "13900000003",
            "email_code": "000000" if email_code != "000000" else "111111",
            "phone_code": phone_code,
        },
    )
    assert response.status_code == 422
    assert "验证码" in response.json()["detail"]


@pytest.mark.asyncio
async def test_register_duplicate_username(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(settings, "DEBUG", True)
    e1, p1 = await request_codes(client, "dup1@example.com", "13900000004")
    await client.post(
        "/api/v1/auth/register",
        json={
            "username": "duplicate",
            "password": "password123",
            "email": "dup1@example.com",
            "phone": "13900000004",
            "email_code": e1,
            "phone_code": p1,
        },
    )
    e2, p2 = await request_codes(client, "dup2@example.com", "13900000005")
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "duplicate",
            "password": "password456",
            "email": "dup2@example.com",
            "phone": "13900000005",
            "email_code": e2,
            "phone_code": p2,
        },
    )
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_login(client: AsyncClient, test_user):
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": "testuser", "password": "testpassword"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 200
    assert data["data"]["access_token"] is not None
    assert data["data"]["user"]["username"] == "testuser"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, test_user):
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": "testuser", "password": "wrongpassword"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient, test_user):
    login_response = await client.post(
        "/api/v1/auth/login",
        json={"username": "testuser", "password": "testpassword"},
    )
    refresh_token = login_response.json()["data"]["refresh_token"]
    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 200
    assert data["data"]["access_token"] is not None


@pytest.mark.asyncio
async def test_get_current_user(client: AsyncClient, auth_headers, test_user):
    response = await client.get("/api/v1/users/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 200
    assert data["data"]["username"] == "testuser"


@pytest.mark.asyncio
async def test_logout(client: AsyncClient, auth_headers):
    response = await client.post("/api/v1/auth/logout", headers=auth_headers)
    assert response.status_code == 200
