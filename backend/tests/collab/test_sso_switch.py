import pytest
from httpx import AsyncClient

from app.core.config import settings


@pytest.fixture
def sso_stub_enabled(monkeypatch):
    """显式打开 FakeOIDC 开发桩。

    桩要求 DEBUG 与 ALLOW_FAKE_SSO 同时为真，两者默认都是 false：
    为 true 时任何人都能用 code=fake:x:<受害者邮箱> 换到该账号令牌。
    需要走桩的用例必须自己声明，不能依赖默认值。
    """
    monkeypatch.setattr(settings, "DEBUG", True)
    monkeypatch.setattr(settings, "ALLOW_FAKE_SSO", True)


@pytest.mark.asyncio
async def test_sso_disabled_returns_403(async_client: AsyncClient, seed_ids):
    cid = seed_ids["company_id"]
    r = await async_client.get(f"/api/v1/sso/wecom/start?company_id={cid}")
    assert r.status_code == 403
    assert r.json()["code"] == 40300


@pytest.mark.asyncio
async def test_sso_enabled_start_and_callback_requires_membership(
    async_client: AsyncClient, seed_ids, db_session, sso_stub_enabled
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
    async_client: AsyncClient, seed_ids, db_session, sso_stub_enabled
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


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "debug,allow_fake",
    [(False, False), (False, True), (True, False)],
)
async def test_sso_stub_refuses_unless_both_switches_on(
    async_client: AsyncClient, seed_ids, db_session, monkeypatch, debug, allow_fake
):
    """安全回归：只要 DEBUG 与 ALLOW_FAKE_SSO 不同时为真，桩必须拒绝签发令牌。

    历史缺陷：判断写成 `not DEBUG and not ALLOW_FAKE_SSO`，而 ALLOW_FAKE_SSO
    默认 true，导致 DEBUG=false 的生产部署仍可用 fake: code 冒充任意成员。
    """
    from app.core.security import get_password_hash
    from app.models.company import Company, CompanyMembership
    from app.models.user import User

    monkeypatch.setattr(settings, "DEBUG", debug)
    monkeypatch.setattr(settings, "ALLOW_FAKE_SSO", allow_fake)

    cid = seed_ids["company_id"]
    company = await db_session.get(Company, cid)
    company.login_methods_json = {"password": True, "oidc": True}
    u = User(
        username="sso_victim",
        email="sso_victim@example.com",
        password_hash=get_password_hash("password123"),
        is_active=True,
    )
    db_session.add(u)
    await db_session.flush()
    db_session.add(
        CompanyMembership(
            company_id=cid, user_id=u.id, status="active", employment_status="active"
        )
    )
    await db_session.commit()

    r = await async_client.get(
        f"/api/v1/sso/oidc/callback?code=fake:x:sso_victim@example.com&state={cid}:oidc"
    )
    assert r.status_code != 200, f"DEBUG={debug} ALLOW_FAKE_SSO={allow_fake} 不应签发令牌"
    assert "access_token" not in r.text
