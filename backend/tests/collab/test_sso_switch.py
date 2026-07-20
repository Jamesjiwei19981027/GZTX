import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_sso_disabled_returns_403(async_client: AsyncClient, seed_ids):
    cid = seed_ids["company_id"]
    r = await async_client.get(f"/api/v1/sso/wecom/start?company_id={cid}")
    assert r.status_code == 403
    assert r.json()["code"] == 40300


@pytest.mark.asyncio
async def test_sso_enabled_start_and_callback_requires_membership(
    async_client: AsyncClient, seed_ids, db_session
):
    """Unknown SSO identity must NOT auto-join the company."""
    from app.models.company import Company

    cid = seed_ids["company_id"]
    company = await db_session.get(Company, cid)
    company.login_methods_json = {
        "password": True,
        "wechat": True,
        "wecom": False,
        "dingtalk": False,
        "feishu": False,
        "oidc": True,
    }
    await db_session.commit()

    r = await async_client.get(f"/api/v1/sso/oidc/start?company_id={cid}")
    assert r.status_code == 200
    assert "authorize_url" in r.json()["data"]

    # stranger email → 403, no auto membership
    r2 = await async_client.get(
        f"/api/v1/sso/oidc/callback?code=fake:sso1:sso1@example.com&state={cid}:oidc"
    )
    assert r2.status_code == 403
    assert r2.json()["code"] == 40302


@pytest.mark.asyncio
async def test_sso_callback_for_existing_member(
    async_client: AsyncClient, seed_ids, db_session
):
    """Pre-existing user + membership can SSO login."""
    from app.core.security import get_password_hash
    from app.models.company import Company, CompanyMembership
    from app.models.user import User

    cid = seed_ids["company_id"]
    company = await db_session.get(Company, cid)
    company.login_methods_json = {
        "password": True,
        "wechat": True,
        "wecom": False,
        "dingtalk": False,
        "feishu": False,
        "oidc": True,
    }
    u = User(
        username="sso_member",
        email="sso_member@example.com",
        password_hash=get_password_hash("password123"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.flush()
    db_session.add(
        CompanyMembership(
            company_id=cid,
            user_id=u.id,
            status="active",
            employment_status="active",
        )
    )
    await db_session.commit()

    r = await async_client.get(
        f"/api/v1/sso/oidc/callback?code=fake:sso_m:sso_member@example.com&state={cid}:oidc"
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data.get("access_token")
    assert data.get("user_id") == u.id
