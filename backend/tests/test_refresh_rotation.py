"""refresh token 轮换 / 撤销 / 宽限期 / 老 token 兼容"""
from datetime import datetime, timedelta, timezone

import jwt as pyjwt
import pytest
from httpx import AsyncClient
from sqlalchemy import select, update

from app.core.config import settings
from app.core.security import decode_token
from app.models.revoked_token import RevokedRefreshToken


async def _login(client: AsyncClient) -> dict:
    r = await client.post(
        "/api/v1/auth/login",
        json={"username": "testuser", "password": "testpassword"},
    )
    assert r.status_code == 200, r.text
    return r.json()["data"]


@pytest.mark.asyncio
async def test_refresh_rotates_tokens(client: AsyncClient, test_user):
    """正常轮换：响应同时含新 access_token / refresh_token / expires_in，且新旧 refresh 不同"""
    tokens = await _login(client)
    old_refresh = tokens["refresh_token"]
    assert decode_token(old_refresh)["jti"]

    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["code"] == 200
    data = body["data"]
    assert data["access_token"]
    assert data["refresh_token"]
    assert data["expires_in"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    assert data["refresh_token"] != old_refresh
    # 新 refresh token 带新 jti
    new_payload = decode_token(data["refresh_token"])
    assert new_payload["jti"] != decode_token(old_refresh)["jti"]


@pytest.mark.asyncio
async def test_old_token_replay_within_grace_allowed(client: AsyncClient, test_user):
    """旧 jti 撤销后 60 秒宽限期内重放：仍能换到有效新令牌（多端并发竞态保护）"""
    tokens = await _login(client)
    old_refresh = tokens["refresh_token"]

    r1 = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert r1.status_code == 200

    # 紧接着用同一个旧 token 再刷一次（宽限期内）
    r2 = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert r2.status_code == 200, r2.text
    assert r2.json()["data"]["access_token"]
    assert r2.json()["data"]["refresh_token"]


@pytest.mark.asyncio
async def test_old_token_rejected_after_grace(client: AsyncClient, test_user, db_session):
    """宽限期（60 秒）过后重放旧 token：401"""
    tokens = await _login(client)
    old_refresh = tokens["refresh_token"]

    r1 = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert r1.status_code == 200

    # 把撤销时间拨回 120 秒前，模拟宽限期已过
    jti = decode_token(old_refresh)["jti"]
    await db_session.execute(
        update(RevokedRefreshToken)
        .where(RevokedRefreshToken.jti == jti)
        .values(revoked_at=datetime.now(timezone.utc) - timedelta(seconds=120))
    )
    await db_session.commit()

    r2 = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})
    assert r2.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_refresh_token_immediately(client: AsyncClient, test_user):
    """logout 携带 refresh_token：立即撤销（无宽限期），随后刷新被拒"""
    tokens = await _login(client)
    refresh = tokens["refresh_token"]

    r = await client.post("/api/v1/auth/logout", json={"refresh_token": refresh})
    assert r.status_code == 200

    r2 = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh})
    assert r2.status_code == 401


@pytest.mark.asyncio
async def test_logout_without_body_still_works(client: AsyncClient, auth_headers):
    """不带 body 的 logout 保持旧语义"""
    r = await client.post("/api/v1/auth/logout", headers=auth_headers)
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_legacy_refresh_token_without_jti_still_accepted(
    client: AsyncClient, test_user
):
    """过渡期兼容：老客户端持有的无 jti refresh token 仍可刷新，且换出的新 token 带 jti"""
    legacy = pyjwt.encode(
        {
            "sub": str(test_user.id),
            "type": "refresh",
            "exp": datetime.now(timezone.utc) + timedelta(days=1),
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": legacy})
    assert r.status_code == 200, r.text
    new_refresh = r.json()["data"]["refresh_token"]
    assert decode_token(new_refresh)["jti"]


@pytest.mark.asyncio
async def test_refresh_purges_expired_revocations(
    client: AsyncClient, test_user, db_session
):
    """刷新时顺手清理已过期的撤销记录"""
    now = datetime.now(timezone.utc)
    db_session.add(
        RevokedRefreshToken(
            jti="expired-jti",
            user_id=test_user.id,
            reason="rotated",
            revoked_at=now - timedelta(days=8),
            expires_at=now - timedelta(days=1),
        )
    )
    await db_session.commit()

    tokens = await _login(client)
    r = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert r.status_code == 200

    remaining = (
        await db_session.execute(
            select(RevokedRefreshToken).where(RevokedRefreshToken.jti == "expired-jti")
        )
    ).scalar_one_or_none()
    assert remaining is None
