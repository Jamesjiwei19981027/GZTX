import pytest
from httpx import AsyncClient

from app.models.user import User
from app.core.security import get_password_hash


@pytest.mark.asyncio
async def test_register(client: AsyncClient):
    """Test user registration."""
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "newuser",
            "password": "password123",
            "email": "newuser@example.com",
            "nickname": "New User"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 200
    assert data["data"]["access_token"] is not None
    assert data["data"]["refresh_token"] is not None
    assert data["data"]["user"]["username"] == "newuser"


@pytest.mark.asyncio
async def test_register_duplicate_username(client: AsyncClient):
    """Test registration with duplicate username."""
    # First registration
    await client.post(
        "/api/v1/auth/register",
        json={
            "username": "duplicate",
            "password": "password123"
        }
    )

    # Second registration with same username
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "duplicate",
            "password": "password456"
        }
    )
    assert response.status_code == 409
    data = response.json()
    assert data["detail"]["code"] == 1001


@pytest.mark.asyncio
async def test_login(client: AsyncClient, test_user):
    """Test user login."""
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "username": "testuser",
            "password": "testpassword"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 200
    assert data["data"]["access_token"] is not None
    assert data["data"]["user"]["username"] == "testuser"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, test_user):
    """Test login with wrong password."""
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "username": "testuser",
            "password": "wrongpassword"
        }
    )
    assert response.status_code == 401
    data = response.json()
    assert data["detail"]["code"] == 1003


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient, test_user):
    """Test token refresh."""
    # First login
    login_response = await client.post(
        "/api/v1/auth/login",
        json={
            "username": "testuser",
            "password": "testpassword"
        }
    )
    refresh_token = login_response.json()["data"]["refresh_token"]

    # Refresh
    response = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 200
    assert data["data"]["access_token"] is not None


@pytest.mark.asyncio
async def test_get_current_user(client: AsyncClient, auth_headers, test_user):
    """Test get current user info."""
    response = await client.get(
        "/api/v1/users/me",
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["code"] == 200
    assert data["data"]["username"] == "testuser"


@pytest.mark.asyncio
async def test_logout(client: AsyncClient, auth_headers):
    """Test logout."""
    response = await client.post(
        "/api/v1/auth/logout",
        headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "登出成功"