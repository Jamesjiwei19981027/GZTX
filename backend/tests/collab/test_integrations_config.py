"""前端可配置集成：schema / upsert / 脱敏 / 同步读凭证"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_integration_schemas_and_upsert_wecom(async_client: AsyncClient, seed_ids):
    cid = seed_ids["company_id"]
    headers = seed_ids["super_admin_headers"]

    r = await async_client.get(f"/api/v1/companies/{cid}/integrations/schemas", headers=headers)
    assert r.status_code == 200, r.text
    providers = r.json()["data"]["providers"]
    assert "wecom" in providers
    assert any(f["key"] == "secret" for f in providers["wecom"]["credential_fields"])

    r2 = await async_client.put(
        f"/api/v1/companies/{cid}/integrations/wecom",
        headers=headers,
        json={
            "provider": "wecom",
            "credentials": {
                "corp_id": "ww_test_corp",
                "secret": "super-secret-value",
                "agent_id": "1000002",
            },
            "config": {
                "trusted_domain": "app.example.com",
                "redirect_uri": "https://app.example.com/api/v1/sso/wecom/callback",
                "api_base": "https://qyapi.weixin.qq.com",
                "auto_create_users": False,
            },
        },
    )
    assert r2.status_code == 200, r2.text
    data = r2.json()["data"]
    assert data["provider"] == "wecom"
    assert data["has_credentials"] is True
    assert data["credentials"].get("secret") == "********"
    assert data["credentials"].get("secret_configured") is True
    assert data["credentials"].get("corp_id") == "ww_test_corp"
    assert data["config"].get("trusted_domain") == "app.example.com"

    # 列表脱敏
    r3 = await async_client.get(f"/api/v1/companies/{cid}/integrations", headers=headers)
    assert r3.status_code == 200
    items = r3.json()["data"]["items"]
    wecom = next(i for i in items if i["provider"] == "wecom")
    assert wecom["credentials"]["secret"] == "********"
    assert "super-secret" not in str(wecom)

    # 占位符不覆盖密钥：再 PUT secret=********，同步仍应 credentials_loaded
    r4 = await async_client.put(
        f"/api/v1/companies/{cid}/integrations/wecom",
        headers=headers,
        json={
            "provider": "wecom",
            "credentials": {"corp_id": "ww_test_corp", "secret": "********"},
            "config": {
                "static_snapshot": {
                    "depts": [
                        {
                            "external_id": "d-cfg",
                            "name": "配置部",
                            "parent_external_id": None,
                        }
                    ],
                    "users": [],
                }
            },
        },
    )
    assert r4.status_code == 200

    r5 = await async_client.post(
        f"/api/v1/companies/{cid}/org-sync?provider=wecom",
        headers=headers,
    )
    assert r5.status_code == 200, r5.text
    body = r5.json()["data"]
    assert body["status"] == "completed"
    assert body.get("credentials_loaded") is True
    assert body["report"]["dept_upserted"] >= 1


@pytest.mark.asyncio
async def test_member_cannot_list_integrations(async_client: AsyncClient, seed_ids):
    cid = seed_ids["company_id"]
    r = await async_client.get(
        f"/api/v1/companies/{cid}/integrations",
        headers=seed_ids["member_headers"],
    )
    assert r.status_code == 403
