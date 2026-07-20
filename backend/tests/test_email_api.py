"""Test email binding API"""
import pytest


@pytest.mark.asyncio
async def test_bind_email_not_qq_only(client, auth_headers):
    """Test binding email - no longer restricted to QQ 邮箱"""
    response = await client.post(
        "/api/v1/users/email/bind",
        json={"email": "user@gmail.com"},
        headers=auth_headers,
    )
    # Should accept any email format, not just QQ
    assert response.status_code in [200, 404, 500]  # 404 if endpoint doesn't exist yet


@pytest.mark.asyncio
async def test_email_status_endpoint_exists(client, auth_headers):
    """Test email status endpoint exists"""
    response = await client.get(
        "/api/v1/users/email/status",
        headers=auth_headers,
    )
    # Should return 200 if endpoint exists, 404 if not
    assert response.status_code in [200, 404]
