"""企业 SSO 开关及邀请隔离，所有外部身份响应只在测试 httpx 边界打桩。"""
import pytest
from app.core.config import settings
from app.models.company import Company
from .test_real_sso import configure, external_http, oidc_keys, oidc_routes, start


@pytest.mark.asyncio
async def test_sso_disabled_returns_403(async_client, seed_ids):
    r = await async_client.get(f'/api/v1/sso/dingtalk/start?company_id={seed_ids["company_id"]}')
    assert r.status_code == 403
    assert r.json()["code"] == 40300


@pytest.mark.asyncio
async def test_sso_enabled_start_and_callback_requires_membership(async_client, seed_ids, db_session, external_http, oidc_keys):
    cid = await configure(async_client, seed_ids, db_session, "oidc")
    oidc_routes(external_http, oidc_keys, "initial")
    args, _ = await start(async_client, cid, "oidc")
    oidc_routes(external_http, oidc_keys, args["nonce"][0], {"email": "outsider@example.com"})
    r = await async_client.get("/api/v1/sso/oidc/callback", params={"code": "real", "state": args["state"][0]})
    assert r.status_code == 403
    assert r.json()["code"] == 40302


@pytest.mark.asyncio
async def test_sso_callback_for_existing_member(async_client, seed_ids, db_session, external_http, oidc_keys):
    cid = await configure(async_client, seed_ids, db_session, "oidc")
    oidc_routes(external_http, oidc_keys, "initial")
    args, _ = await start(async_client, cid, "oidc")
    oidc_routes(external_http, oidc_keys, args["nonce"][0])
    r = await async_client.get("/api/v1/sso/oidc/callback", params={"code": "real", "state": args["state"][0]})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["user_id"] == seed_ids["member_user_id"]


@pytest.mark.asyncio
@pytest.mark.parametrize("debug,allow_fake", [(False, False), (False, True), (True, False), (True, True)])
async def test_fake_identity_never_accepted_with_forged_state(async_client, seed_ids, db_session, monkeypatch, debug, allow_fake):
    monkeypatch.setattr(settings, "DEBUG", debug)
    monkeypatch.setattr(settings, "ALLOW_FAKE_SSO", allow_fake)
    cid = seed_ids["company_id"]
    company = await db_session.get(Company, cid)
    company.login_methods_json = {"oidc": True}
    await db_session.commit()
    r = await async_client.get("/api/v1/sso/oidc/callback", params={"code": "fake:x:member_user@example.com", "state": f"{cid}:oidc"})
    assert r.status_code == 422
    assert "access_token" not in r.text
