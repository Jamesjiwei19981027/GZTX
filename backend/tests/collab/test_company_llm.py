"""公司级 LLM：前端可配、密钥加密、连通测试。"""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.integration import IntegrationAccount
from app.services.llm_settings import PROVIDER_LLM, llm_from_company, resolve_llm


@pytest.mark.asyncio
async def test_company_llm_save_and_mask(async_client: AsyncClient, db_session, seed_ids):
    cid = seed_ids["company_id"]
    headers = seed_ids["super_admin_headers"]

    r = await async_client.put(
        f"/api/v1/companies/{cid}/llm",
        json={
            "provider": "openai_compatible",
            "base_url": "https://api.example.com/v1",
            "model": "demo-model",
            "api_key": "sk-secret-should-not-leak",
            "temperature": 0.1,
            "max_tokens": 512,
            "enabled": True,
            "use_for_judge": True,
            "use_for_agent": True,
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["provider"] == "openai_compatible"
    assert data["model"] == "demo-model"
    assert data["has_api_key"] is True
    assert data.get("configured") is True
    assert "api_key" not in data or not data.get("api_key")
    assert "sk-secret" not in r.text

    r2 = await async_client.get(f"/api/v1/companies/{cid}/llm", headers=headers)
    assert r2.json()["data"]["has_api_key"] is True
    assert "presets" in r2.json()["data"]

    acc = (
        await db_session.execute(
            select(IntegrationAccount).where(
                IntegrationAccount.company_id == cid,
                IntegrationAccount.provider == PROVIDER_LLM,
            )
        )
    ).scalar_one()
    assert "sk-secret-should-not-leak" not in (acc.credentials_encrypted or "")

    resolved = await llm_from_company(db_session, cid)
    assert resolved is not None
    assert resolved.api_key == "sk-secret-should-not-leak"
    assert resolved.base_url.startswith("https://api.example.com")


@pytest.mark.asyncio
async def test_company_llm_api_key_keep_on_empty(async_client: AsyncClient, seed_ids):
    cid = seed_ids["company_id"]
    headers = seed_ids["super_admin_headers"]
    await async_client.put(
        f"/api/v1/companies/{cid}/llm",
        json={
            "provider": "openai",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-4o-mini",
            "api_key": "keep-key",
        },
        headers=headers,
    )
    r = await async_client.put(
        f"/api/v1/companies/{cid}/llm",
        json={
            "provider": "openai",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-4o-mini",
            "api_key": "",
        },
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["data"]["has_api_key"] is True


@pytest.mark.asyncio
async def test_member_cannot_write_llm(async_client: AsyncClient, seed_ids):
    r = await async_client.put(
        f"/api/v1/companies/{seed_ids['company_id']}/llm",
        json={"provider": "fake", "model": "x"},
        headers=seed_ids["member_headers"],
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_llm_test_fake_provider(async_client: AsyncClient, seed_ids):
    cid = seed_ids["company_id"]
    headers = seed_ids["super_admin_headers"]
    await async_client.put(
        f"/api/v1/companies/{cid}/llm",
        json={
            "provider": "fake",
            "base_url": "",
            "model": "fake",
            "enabled": True,
        },
        headers=headers,
    )
    r = await async_client.post(f"/api/v1/companies/{cid}/llm/test", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["code"] == 200
    assert "FakeLLM" in (r.json()["data"].get("content") or "") or r.json()["data"].get(
        "provider"
    ) == "fake"


@pytest.mark.asyncio
async def test_resolve_llm_defaults_fake(db_session, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "LLM_BASE_URL", "")
    monkeypatch.setattr(settings, "LLM_API_KEY", "")
    monkeypatch.setattr(settings, "LLM_MODEL", "")
    r = await resolve_llm(db_session, company_id=999999)
    assert r.provider == "fake"
