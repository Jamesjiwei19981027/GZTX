"""真实协议经 httpx 打桩，验证登录、隔离和组织同步的可观察结果。"""
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import func, select

from app.core.config import settings
from app.models.company import Company, CompanyMembership, OrgUnit
from app.models.user import User


@pytest.fixture
def external_http(monkeypatch):
    routes = {}
    requests = []
    original = httpx.AsyncClient.send

    async def send(client, request, **kwargs):
        if request.url.host == "test":
            return await original(client, request, **kwargs)
        requests.append(request)
        key = (request.method, str(request.url.copy_with(query=None)))
        assert key in routes, f"未打桩的外部调用: {key}"
        result = routes[key]
        if callable(result):
            result = result(request)
        if isinstance(result, Exception):
            raise result
        status, body = result if isinstance(result, tuple) else (200, result)
        return httpx.Response(status, json=body, request=request)

    monkeypatch.setattr(httpx.AsyncClient, "send", send)
    return routes, requests


async def configure(client, seed, db, provider="dingtalk"):
    company = await db.get(Company, seed["company_id"])
    company.login_methods_json = {"password": True, provider: True}
    await db.commit()
    credentials = ({"corp_id": "ding-corp", "app_key": "ding-key", "app_secret": "test-secret", "agent_id": "100"}
                   if provider == "dingtalk" else {"client_id": "oidc-client", "client_secret": "oidc-secret"})
    r = await client.put(f'/api/v1/companies/{company.id}/integrations/{provider}',
                         headers=seed["super_admin_headers"], json={"provider": provider, "credentials": credentials,
                         "config": {"issuer": "https://idp.test"} if provider == "oidc" else {}})
    assert r.status_code == 200, r.text
    return company.id


def ding_routes(external_http, **identity):
    routes, _ = external_http
    routes[("POST", "https://api.dingtalk.com/v1.0/oauth2/userAccessToken")] = {"accessToken": "ding-user-token"}
    routes[("GET", "https://api.dingtalk.com/v1.0/contact/users/me")] = {
        "unionId": "union-member", "nick": "成员", "email": "member_user@example.com", **identity}


async def start(client, cid, provider="dingtalk"):
    r = await client.get(f"/api/v1/sso/{provider}/start", params={"company_id": cid})
    assert r.status_code == 200, r.text
    url = r.json()["data"]["authorize_url"]
    return parse_qs(urlparse(url).query), url


@pytest.mark.asyncio
async def test_dingtalk_login_real_protocol_and_state_replay(async_client, seed_ids, db_session, external_http, monkeypatch):
    monkeypatch.setattr(settings, "APP_URL", "http://192.168.1.8:8080")
    cid = await configure(async_client, seed_ids, db_session)
    ding_routes(external_http)
    before = await db_session.scalar(select(func.count(User.id)))
    args, url = await start(async_client, cid)
    assert url.startswith("https://login.dingtalk.com/oauth2/auth?")
    assert args["client_id"] == ["ding-key"]
    assert args["response_type"] == ["code"]
    assert args["redirect_uri"] == ["http://192.168.1.8:8080/api/v1/sso/dingtalk/callback"]
    assert args["state"] != [f"{cid}:dingtalk"]
    assert "test-secret" not in url
    params = {"authCode": "real-authorization-code", "state": args["state"][0]}
    r = await async_client.get("/api/v1/sso/dingtalk/callback", params=params)
    assert r.status_code == 200, r.text
    assert r.json()["data"]["user_id"] == seed_ids["member_user_id"]
    assert r.json()["data"]["refresh_token"]
    calls = external_http[1]
    token_request = next(x for x in calls if x.url.path.endswith("userAccessToken"))
    assert json.loads(token_request.content) == {"clientId": "ding-key", "clientSecret": "test-secret",
                                               "code": "real-authorization-code", "grantType": "authorization_code"}
    assert calls[-1].headers["x-acs-dingtalk-access-token"] == "ding-user-token"
    assert await db_session.scalar(select(func.count(User.id))) == before
    replay = await async_client.get("/api/v1/sso/dingtalk/callback", params=params)
    assert replay.status_code == 422


@pytest.mark.asyncio
async def test_dingtalk_unknown_identity_never_creates_account(async_client, seed_ids, db_session, external_http):
    cid = await configure(async_client, seed_ids, db_session)
    ding_routes(external_http, email="outsider@example.com", mobile="13900000000")
    before = await db_session.scalar(select(func.count(CompanyMembership.id)))
    args, _ = await start(async_client, cid)
    r = await async_client.get("/api/v1/sso/dingtalk/callback", params={"code": "real", "state": args["state"][0]})
    assert r.status_code == 403, r.text
    assert "请联系管理员邀请你加入" in r.text
    assert await db_session.scalar(select(func.count(CompanyMembership.id))) == before


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", ["predictable", "missing_cookie", "company", "provider"])
async def test_sso_state_rejects_tampering_before_external_calls(async_client, seed_ids, db_session, external_http, bad):
    cid = await configure(async_client, seed_ids, db_session)
    args, _ = await start(async_client, cid)
    params = {"code": "real", "state": args["state"][0]}
    provider = "dingtalk"
    if bad == "predictable":
        params["state"] = f"{cid}:dingtalk"
    elif bad == "missing_cookie":
        async_client.cookies.clear()
    elif bad == "company":
        params["company_id"] = cid + 100
    else:
        provider = "oidc"
    r = await async_client.get(f"/api/v1/sso/{provider}/callback", params=params)
    assert r.status_code == 422, r.text
    assert not external_http[1]


@pytest.mark.asyncio
async def test_dingtalk_binding_precedes_changed_email_and_phone_matching(async_client, seed_ids, db_session, external_http):
    cid = await configure(async_client, seed_ids, db_session)
    user = await db_session.get(User, seed_ids["member_user_id"])
    user.phone = "13812345678"
    await db_session.commit()
    ding_routes(external_http, email=None, mobile="+86 13812345678")
    args, _ = await start(async_client, cid)
    r = await async_client.get("/api/v1/sso/dingtalk/callback", params={"code": "real", "state": args["state"][0]})
    assert r.status_code == 200, r.text
    ding_routes(external_http, email="pm_user@example.com", mobile=None)
    args, _ = await start(async_client, cid)
    r = await async_client.get("/api/v1/sso/dingtalk/callback", params={"code": "real2", "state": args["state"][0]})
    assert r.json()["data"]["user_id"] == user.id


@pytest.mark.asyncio
async def test_deleted_member_can_rejoin_and_rebind_same_external_identity(async_client, seed_ids, db_session, external_http):
    from app.models.sso import SsoBinding
    from app.core.security import create_access_token
    from app.models.company import CompanyMembership
    cid = await configure(async_client, seed_ids, db_session)
    ding_routes(external_http)
    args, _ = await start(async_client, cid)
    signed_in = await async_client.get("/api/v1/sso/dingtalk/callback", params={"code": "real", "state": args["state"][0]})
    assert signed_in.status_code == 200
    old_user = await db_session.get(User, seed_ids["member_user_id"])
    deleted = await async_client.post("/api/v1/users/me/delete", headers={"Authorization": f'Bearer {signed_in.json()["data"]["access_token"]}'},
        json={"password": "password123", "confirmation": "DELETE"})
    assert deleted.status_code == 200
    assert await db_session.scalar(select(func.count(SsoBinding.id)).where(SsoBinding.user_id == old_user.id)) == 0
    new_user = User(username="member_user_rejoined", email="member_user@example.com", password_hash=old_user.password_hash, is_active=True)
    db_session.add(new_user)
    await db_session.flush()
    db_session.add(CompanyMembership(company_id=cid, user_id=new_user.id, status="active", employment_status="active"))
    await db_session.commit()
    args, _ = await start(async_client, cid)
    r = await async_client.get("/api/v1/sso/dingtalk/callback", params={"code": "real-again", "state": args["state"][0]})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["user_id"] == new_user.id


@pytest.mark.asyncio
async def test_sso_switch_rechecked_on_callback(async_client, seed_ids, db_session, external_http):
    cid = await configure(async_client, seed_ids, db_session)
    args, _ = await start(async_client, cid)
    company = await db_session.get(Company, cid)
    company.login_methods_json = {"dingtalk": False}
    await db_session.commit()
    r = await async_client.get("/api/v1/sso/dingtalk/callback", params={"code": "real", "state": args["state"][0]})
    assert r.status_code == 403
    assert not external_http[1]


@pytest.mark.asyncio
async def test_disabled_sso_issuer_cannot_be_reused_across_companies(async_client, seed_ids, db_session, external_http):
    # 一旦存在非默认租户，就不再把任一租户 IdP 当作全局用户的身份权威。
    cid = await configure(async_client, seed_ids, db_session)
    other = Company(name="另一个 IdP 企业", slug="other-issuer", status="active", login_methods_json={"oidc": True})
    db_session.add(other)
    await db_session.commit()
    r = await async_client.get("/api/v1/sso/dingtalk/start", params={"company_id": cid})
    assert r.status_code == 403
    db_session.add(CompanyMembership(company_id=other.id, user_id=seed_ids["member_user_id"], status="active", employment_status="active"))
    await db_session.commit()
    assert not external_http[1]


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", ["login", "token"])
async def test_password_switch_enforced_with_active_super_admin_fallback(async_client, seed_ids, db_session, endpoint):
    company = await db_session.get(Company, seed_ids["company_id"])
    company.login_methods_json = {"password": False}
    await db_session.commit()
    async def login(username):
        fields = {"username": username, "password": "password123"}
        return await async_client.post(f"/api/v1/auth/{endpoint}", **({"json": fields} if endpoint == "login" else {"data": fields}))
    r = await login("member_user")
    assert r.status_code == 403, r.text
    assert (await login("admin")).status_code == 200
    assert (await login("outsider")).status_code == 200


@pytest.mark.asyncio
async def test_dingtalk_sync_real_tree_pagination_no_accounts_and_report(async_client, seed_ids, db_session, external_http):
    from app.models.integration import IntegrationAccount
    cid = await configure(async_client, seed_ids, db_session)
    routes, requests = external_http
    routes[("POST", "https://api.dingtalk.com/v1.0/oauth2/accessToken")] = {"accessToken": "app-token"}
    routes[("POST", "https://oapi.dingtalk.com/topapi/v2/department/get")] = {"errcode": 0, "result": {"dept_id": 1, "name": "测试企业"}}
    routes[("POST", "https://oapi.dingtalk.com/topapi/v2/department/listsub")] = lambda req: {
        "errcode": 0, "result": [{"dept_id": 2, "parent_id": 1, "name": "研发"}] if json.loads(req.content)["dept_id"] == 1 else []}
    def users(req):
        body = json.loads(req.content)
        if body["dept_id"] == 1:
            return {"errcode": 0, "result": {"list": [], "has_more": False}}
        if body["cursor"] == 0:
            return {"errcode": 0, "result": {"list": [{"userid": "staff-1", "unionid": "union-member", "name": "钉钉成员",
                "org_email": "member_user@example.com", "mobile": "13812345678", "title": "工程师", "dept_id_list": [2]}], "has_more": True, "next_cursor": 100}}
        return {"errcode": 0, "result": {"list": [{"userid": "staff-2", "unionid": "stranger", "name": "未受邀人员", "dept_id_list": [2]}], "has_more": False}}
    user_route = ("POST", "https://oapi.dingtalk.com/topapi/v2/user/list")
    routes[user_route] = users
    before = await db_session.scalar(select(func.count(User.id)))
    for attempt in range(2):
        r = await async_client.post(f"/api/v1/companies/{cid}/org-sync?provider=dingtalk", headers=seed_ids["super_admin_headers"])
        assert r.status_code == 200, r.text
        report = r.json()["data"]["report"]
        assert report["dept_upserted"] == 2
        assert report["users_matched"] == 1
        assert report["failed"] == 0
        assert report["created"] == (4 if attempt == 0 else 0)
        assert report["updated"] == (0 if attempt == 0 else 4)
    assert await db_session.scalar(select(func.count(User.id))) == before
    member = await db_session.scalar(select(CompanyMembership).where(CompanyMembership.company_id == cid, CompanyMembership.user_id == seed_ids["member_user_id"]))
    await db_session.refresh(member)
    assert member.title == "工程师"
    unit = await db_session.get(OrgUnit, member.org_unit_id)
    assert unit.name == "研发" and unit.parent_id
    integration = await db_session.scalar(select(IntegrationAccount).where(IntegrationAccount.company_id == cid, IntegrationAccount.provider == "dingtalk"))
    assert integration.last_sync_at
    assert integration.config_json["last_sync_report"]["updated"] == 4
    listed = await async_client.get(f"/api/v1/companies/{cid}/integrations", headers=seed_ids["super_admin_headers"])
    assert listed.json()["data"]["items"][0]["last_sync_report"]["failed"] == 0
    # 完整快照删除部门及人员后，旧记录停用、旧目录链接解绑。
    routes[user_route] = lambda req: {"errcode": 0, "result": {"list": [], "has_more": False}}
    routes[("POST", "https://oapi.dingtalk.com/topapi/v2/department/listsub")] = {"errcode": 0, "result": []}
    r = await async_client.post(f"/api/v1/companies/{cid}/org-sync?provider=dingtalk", headers=seed_ids["super_admin_headers"])
    assert r.status_code == 200, r.text
    from app.models.sso import OrgDirectoryPerson
    db_session.expire_all()
    removed_unit = await db_session.scalar(select(OrgUnit).where(OrgUnit.company_id == cid, OrgUnit.external_id == "2"))
    removed_person = await db_session.scalar(select(OrgDirectoryPerson).where(OrgDirectoryPerson.company_id == cid, OrgDirectoryPerson.external_id == "staff-1"))
    assert removed_unit.is_active is False
    assert removed_person.is_active is False and removed_person.user_id is None


@pytest.fixture
def oidc_keys():
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private.public_key()))
    public.update(kid="test-key", alg="RS256", use="sig")
    return private, public


def oidc_routes(external_http, oidc_keys, nonce, mutation=None):
    routes, _ = external_http
    private, public = oidc_keys
    routes[("GET", "https://idp.test/.well-known/openid-configuration")] = {
        "issuer": "https://idp.test", "authorization_endpoint": "https://idp.test/authorize",
        "token_endpoint": "https://idp.test/token", "jwks_uri": "https://idp.test/keys", "id_token_signing_alg_values_supported": ["RS256"]}
    claims = {"iss": "https://idp.test", "aud": "oidc-client", "sub": "oidc-member", "nonce": nonce,
              "exp": datetime.now(timezone.utc) + timedelta(minutes=5), "iat": datetime.now(timezone.utc),
              "email": "member_user@example.com", "email_verified": True}
    if mutation:
        claims.update(mutation)
    token = jwt.encode(claims, private, algorithm="RS256", headers={"kid": "test-key"})
    routes[("POST", "https://idp.test/token")] = {"id_token": token}
    routes[("GET", "https://idp.test/keys")] = {"keys": [public]}


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", [None, "signature", "issuer", "audience", "expiry", "nonce", "missing_nonce", "kid", "algorithm", "missing_exp", "discovery_issuer", "azp"])
async def test_oidc_real_discovery_and_id_token_validation(async_client, seed_ids, db_session, external_http, oidc_keys, failure):
    cid = await configure(async_client, seed_ids, db_session, "oidc")
    oidc_routes(external_http, oidc_keys, "placeholder")
    args, _ = await start(async_client, cid, "oidc")
    assert args["scope"] == ["openid profile email phone"]
    nonce = args["nonce"][0]
    mutation = {"issuer": {"iss": "https://attacker.test"}, "audience": {"aud": "other"},
                "expiry": {"exp": datetime.now(timezone.utc) - timedelta(minutes=1)}, "nonce": {"nonce": "other"},
                "missing_nonce": {"nonce": None}, "azp": {"aud": ["oidc-client", "other"], "azp": "other"}}.get(failure)
    oidc_routes(external_http, oidc_keys, nonce, mutation)
    routes = external_http[0]
    if failure == "signature":
        routes[("GET", "https://idp.test/keys")] = {"keys": [{**oidc_keys[1], **json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(rsa.generate_private_key(public_exponent=65537, key_size=2048).public_key()))}]}
    elif failure == "kid":
        routes[("GET", "https://idp.test/keys")] = {"keys": [{**oidc_keys[1], "kid": "other"}]}
    elif failure == "algorithm":
        routes[("POST", "https://idp.test/token")] = {"id_token": jwt.encode({"sub": "x"}, "test-symmetric-secret-at-least-32-chars", algorithm="HS256")}
    elif failure == "missing_exp":
        valid = routes[("POST", "https://idp.test/token")]["id_token"]
        claims = jwt.decode(valid, options={"verify_signature": False})
        claims.pop("exp")
        routes[("POST", "https://idp.test/token")] = {"id_token": jwt.encode(claims, oidc_keys[0], algorithm="RS256", headers={"kid": "test-key"})}
    elif failure == "discovery_issuer":
        routes[("GET", "https://idp.test/.well-known/openid-configuration")]["issuer"] = "https://attacker.test"
    r = await async_client.get("/api/v1/sso/oidc/callback", params={"code": "real-oidc-code", "state": args["state"][0]})
    assert r.status_code == (422 if failure else 200), r.text
    if not failure:
        assert r.json()["data"]["user_id"] == seed_ids["member_user_id"]
        token_req = next(req for req in external_http[1] if req.url.path == "/token")
        assert parse_qs(token_req.content.decode())["grant_type"] == ["authorization_code"]
    else:
        assert "access_token" not in r.text


@pytest.mark.asyncio
async def test_browser_callback_uses_one_time_ticket_without_tokens_in_url(async_client, seed_ids, db_session, external_http):
    cid = await configure(async_client, seed_ids, db_session)
    ding_routes(external_http)
    args, _ = await start(async_client, cid)
    r = await async_client.get("/api/v1/sso/dingtalk/callback", params={"authCode": "real", "state": args["state"][0]}, headers={"Accept": "text/html"})
    assert r.status_code == 303, r.text
    location = r.headers["location"]
    assert "access_token" not in location and "refresh_token" not in location
    ticket = parse_qs(urlparse(location).fragment)["sso_ticket"][0]
    r = await async_client.post("/api/v1/sso/complete", json={"ticket": ticket})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["access_token"]
    assert (await async_client.post("/api/v1/sso/complete", json={"ticket": ticket})).status_code == 422


@pytest.mark.asyncio
async def test_browser_callback_preserves_mobile_context_and_refuses_external_return(async_client, seed_ids, db_session, external_http):
    cid = await configure(async_client, seed_ids, db_session)
    ding_routes(external_http)
    r = await async_client.get("/api/v1/sso/dingtalk/start", params={"company_id": cid, "return_to": "/?mobile=1&company_id=1&view=team"})
    args = parse_qs(urlparse(r.json()["data"]["authorize_url"]).query)
    r = await async_client.get("/api/v1/sso/dingtalk/callback", params={"authCode": "real", "state": args["state"][0]}, headers={"Accept": "text/html"})
    assert r.status_code == 303
    assert urlparse(r.headers["location"]).query == "mobile=1&company_id=1&view=team"
    for bad in ("https://attacker.test", "//attacker.test", "/\\attacker.test"):
        r = await async_client.get("/api/v1/sso/dingtalk/start", params={"company_id": cid, "return_to": bad})
        assert r.status_code == 422


@pytest.mark.asyncio
async def test_sso_never_grants_global_identity_across_multiple_companies(async_client, seed_ids, db_session, external_http):
    cid = await configure(async_client, seed_ids, db_session)
    ding_routes(external_http)
    args, _ = await start(async_client, cid)
    other = Company(name="另一企业", slug="other-company", status="active", login_methods_json={"dingtalk": True})
    db_session.add(other)
    await db_session.flush()
    db_session.add(CompanyMembership(company_id=other.id, user_id=seed_ids["member_user_id"], status="active", employment_status="active"))
    await db_session.commit()
    r = await async_client.get("/api/v1/sso/dingtalk/callback", params={"code": "real", "state": args["state"][0]})
    assert r.status_code == 403, r.text
    assert "access_token" not in r.text


@pytest.mark.asyncio
async def test_sso_rejects_expired_state_without_network(async_client, seed_ids, db_session, external_http):
    from app.models.sso import SsoLoginAttempt
    cid = await configure(async_client, seed_ids, db_session)
    args, _ = await start(async_client, cid)
    attempt = await db_session.scalar(select(SsoLoginAttempt))
    attempt.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db_session.commit()
    r = await async_client.get("/api/v1/sso/dingtalk/callback", params={"code": "real", "state": args["state"][0]})
    assert r.status_code == 422
    assert not external_http[1]


@pytest.mark.asyncio
async def test_sync_failure_persists_report_without_partial_tree_or_secrets(async_client, seed_ids, db_session, external_http):
    from app.models.integration import IntegrationAccount
    cid = await configure(async_client, seed_ids, db_session)
    external_http[0][("POST", "https://api.dingtalk.com/v1.0/oauth2/accessToken")] = (403, {"message": "secret-do-not-leak"})
    r = await async_client.post(f"/api/v1/companies/{cid}/org-sync?provider=dingtalk", headers=seed_ids["super_admin_headers"])
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "failed"
    assert r.json()["data"]["report"]["failed"] == 1
    assert "secret-do-not-leak" not in r.text
    assert await db_session.scalar(select(func.count(OrgUnit.id))) == 0
    acc = await db_session.scalar(select(IntegrationAccount).where(IntegrationAccount.company_id == cid))
    assert acc.last_sync_at and acc.config_json["last_sync_report"]["failed"] == 1
