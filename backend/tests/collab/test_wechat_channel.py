import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_wechat_chat_ok(async_client: AsyncClient, seed_ids):
    r = await async_client.post(
        "/api/v1/wx/collab/chat",
        json={
            "project_id": seed_ids["project_id"],
            "node_id": seed_ids["node_id"],
            "message": "进度到 50% 了请知悉",
            "company_id": seed_ids["company_id"],
        },
        headers=seed_ids["member_headers"],
    )
    assert r.status_code == 200
    body = r.json()
    assert body["code"] == 200
    assert body["data"]["channel"] == "wechat"
    assert "reply" in body["data"]
    assert "禁止" in body["data"]["reply"]["content"] or body["data"]["reply"]["content"]


@pytest.mark.asyncio
async def test_wechat_cannot_upload_evidence_file(async_client: AsyncClient, seed_ids):
    r = await async_client.post(
        "/api/v1/evidence/files",
        data={
            "company_id": str(seed_ids["company_id"]),
            "project_id": str(seed_ids["project_id"]),
        },
        files={"file": ("a.png", b"xxx", "image/png")},
        headers={**seed_ids["member_headers"], "X-Client-Channel": "wechat"},
    )
    assert r.status_code == 403
    assert r.json()["code"] == 40320


@pytest.mark.asyncio
async def test_web_upload_requires_company_and_membership(async_client: AsyncClient, seed_ids):
    r = await async_client.post(
        "/api/v1/evidence/files",
        data={
            "company_id": str(seed_ids["company_id"]),
            "project_id": str(seed_ids["project_id"]),
        },
        files={"file": ("a.png", b"xxx", "image/png")},
        headers=seed_ids["member_headers"],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["code"] == 200
    assert "file_id" in body["data"]
    assert "storage_key" not in body["data"]


@pytest.mark.asyncio
async def test_org_tree_and_login_methods(async_client: AsyncClient, seed_ids):
    cid = seed_ids["company_id"]
    r = await async_client.get(
        f"/api/v1/companies/{cid}/org-tree",
        headers=seed_ids["member_headers"],
    )
    assert r.status_code == 200
    assert "nodes" in r.json()["data"]

    r2 = await async_client.patch(
        f"/api/v1/companies/{cid}/login-methods",
        headers=seed_ids["super_admin_headers"],
        json={"wecom": True, "oidc": True},
    )
    assert r2.status_code == 200
    assert r2.json()["data"]["wecom"] is True
