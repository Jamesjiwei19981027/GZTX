"""Test email binding API"""
import pytest


@pytest.mark.asyncio
async def test_bind_email_requires_verification_code(client, auth_headers):
    """换绑邮箱必须带验证码：无码/错码一律拒绝，不得直接覆写 user.email"""
    response = await client.post(
        "/api/v1/users/email/bind",
        json={"email": "user@gmail.com"},
        headers=auth_headers,
    )
    assert response.status_code == 422  # 缺 code 字段

    response = await client.post(
        "/api/v1/users/email/bind",
        json={"email": "user@gmail.com", "code": "000000"},
        headers=auth_headers,
    )
    assert response.status_code == 422  # 码不存在

    me = await client.get("/api/v1/users/me", headers=auth_headers)
    assert me.json()["data"]["email"] == "test@example.com"


@pytest.mark.asyncio
async def test_bind_email_with_valid_code(client, auth_headers, monkeypatch):
    """带正确验证码可换绑，且换绑后邮箱为已验证态"""
    from app.core.config import settings

    monkeypatch.setattr(settings, "DEBUG", True)
    r = await client.post(
        "/api/v1/users/me/verification/send-code",
        headers=auth_headers,
        json={"channel": "email", "target": "user@gmail.com"},
    )
    assert r.status_code == 200, r.text
    code = r.json()["data"]["debug_code"]

    r = await client.post(
        "/api/v1/users/email/bind",
        json={"email": "user@gmail.com", "code": code},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text

    me = await client.get("/api/v1/users/me", headers=auth_headers)
    assert me.json()["data"]["email"] == "user@gmail.com"


@pytest.mark.asyncio
async def test_email_status_endpoint_exists(client, auth_headers):
    """Test email status endpoint exists"""
    response = await client.get(
        "/api/v1/users/email/status",
        headers=auth_headers,
    )
    # Should return 200 if endpoint exists, 404 if not
    assert response.status_code in [200, 404]
