"""企业应用真实保存、密钥加密保留、配置脱敏和权限隔离。"""
import json
import pytest
from sqlalchemy import select
from app.models.integration import IntegrationAccount
from app.services.secret_box import decrypt_str


@pytest.mark.asyncio
async def test_integration_schemas_and_upsert_dingtalk(async_client, seed_ids, db_session):
    cid, headers = seed_ids["company_id"], seed_ids["super_admin_headers"]
    schemas = await async_client.get(f"/api/v1/companies/{cid}/integrations/schemas", headers=headers)
    assert schemas.status_code == 200
    assert any(field["key"] == "app_secret" for field in schemas.json()["data"]["providers"]["dingtalk"]["credential_fields"])
    credentials = {"corp_id": "ding-corp", "app_key": "ding-key", "agent_id": "100", "app_secret": "test-secret-never-returned"}
    r = await async_client.put(f"/api/v1/companies/{cid}/integrations/dingtalk", headers=headers,
        json={"provider": "dingtalk", "credentials": credentials})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["credentials"]["app_secret_configured"] is True
    assert "test-secret-never-returned" not in r.text
    r = await async_client.put(f"/api/v1/companies/{cid}/integrations/dingtalk", headers=headers,
        json={"provider": "dingtalk", "credentials": {"app_secret": "", "agent_id": "101"}})
    assert r.status_code == 200, r.text
    acc = await db_session.scalar(select(IntegrationAccount).where(IntegrationAccount.company_id == cid, IntegrationAccount.provider == "dingtalk"))
    assert "test-secret-never-returned" not in acc.credentials_encrypted
    saved = json.loads(decrypt_str(acc.credentials_encrypted))
    assert saved["app_secret"] == "test-secret-never-returned" and saved["agent_id"] == "101"
    listing = await async_client.get(f"/api/v1/companies/{cid}/integrations", headers=headers)
    assert "test-secret-never-returned" not in listing.text


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["wecom", "feishu", "saml"])
async def test_future_integrations_cannot_be_saved_or_enabled(async_client, seed_ids, provider):
    cid, headers = seed_ids["company_id"], seed_ids["super_admin_headers"]
    r = await async_client.put(f"/api/v1/companies/{cid}/integrations/{provider}", headers=headers,
        json={"provider": provider, "credentials": {"secret": "test"}})
    assert r.status_code == 422
    if provider != "saml":
        r = await async_client.patch(f"/api/v1/companies/{cid}/login-methods", headers=headers, json={provider: True})
        assert r.status_code == 422


@pytest.mark.asyncio
async def test_secret_misplaced_in_config_is_encrypted(async_client, seed_ids):
    cid, headers = seed_ids["company_id"], seed_ids["super_admin_headers"]
    r = await async_client.put(f"/api/v1/companies/{cid}/integrations/oidc", headers=headers,
        json={"provider": "oidc", "credentials": {"client_id": "client"},
              "config": {"issuer": "https://idp.test", "client_secret": "config-test-secret"}})
    assert r.status_code == 200, r.text
    assert "config-test-secret" not in r.text
    assert "client_secret" not in r.json()["data"]["config"]


@pytest.mark.asyncio
async def test_member_cannot_list_integrations(async_client, seed_ids):
    r = await async_client.get(f'/api/v1/companies/{seed_ids["company_id"]}/integrations', headers=seed_ids["member_headers"])
    assert r.status_code == 403
