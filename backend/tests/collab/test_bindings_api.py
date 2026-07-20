import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_bindings_default(async_client: AsyncClient, seed_ids):
    cid = seed_ids["company_id"]
    r = await async_client.get(
        f"/api/v1/companies/{cid}/bindings",
        headers=seed_ids["super_admin_headers"],
    )
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["storage"]["provider_id"] == "local"
    assert data["asr"]["provider_id"] == "builtin"


@pytest.mark.asyncio
async def test_put_storage_as_admin(async_client: AsyncClient, seed_ids):
    cid = seed_ids["company_id"]
    r = await async_client.put(
        f"/api/v1/companies/{cid}/bindings/storage",
        headers=seed_ids["super_admin_headers"],
        json={"provider_id": "local", "config_json": {"root": "data/objects"}},
    )
    assert r.status_code == 200
    assert r.json()["data"]["provider_id"] == "local"


@pytest.mark.asyncio
async def test_put_user_asr_disallowed(async_client: AsyncClient, seed_ids, db_session):
    from app.models.company import Company

    company = await db_session.get(Company, seed_ids["company_id"])
    company.policy_preset = "controlled"
    company.policy_json = {"allowed_asr_ids": ["builtin", "customer"]}
    await db_session.commit()

    r = await async_client.put(
        "/api/v1/users/me/bindings/asr",
        headers=seed_ids["member_headers"],
        json={"provider_id": "cloud:evil", "company_id": seed_ids["company_id"]},
    )
    assert r.status_code == 403
    assert r.json()["code"] == 40300


@pytest.mark.asyncio
async def test_asr_transcribe(async_client: AsyncClient, seed_ids):
    files = {"file": ("a.wav", b"fake-audio", "audio/wav")}
    data = {"company_id": str(seed_ids["company_id"])}
    r = await async_client.post(
        "/api/v1/asr/transcribe",
        headers=seed_ids["member_headers"],
        files=files,
        data=data,
    )
    assert r.status_code == 200
    body = r.json()["data"]
    assert "text" in body
    assert body["provider_id"] == "builtin"
