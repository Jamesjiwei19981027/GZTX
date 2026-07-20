"""个人 LLM：设置页可配、密钥不回显、resolve 优先个人。"""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.models.user import User
from app.services.llm_settings import llm_from_user, resolve_llm, save_user_llm


@pytest.mark.asyncio
async def test_user_llm_save_and_mask(async_client: AsyncClient, seed_ids):
    headers = seed_ids["member_headers"]

    r = await async_client.put(
        "/api/v1/notifications/llm-config",
        json={
            "provider": "openai_compatible",
            "base_url": "https://api.user-llm.example/v1",
            "model": "user-model",
            "api_key": "sk-user-secret-no-leak",
            "temperature": 0.3,
            "max_tokens": 256,
            "enabled": True,
            "use_for_agent": True,
            "use_for_judge": False,
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["provider"] == "openai_compatible"
    assert data["model"] == "user-model"
    assert data["enabled"] is True
    assert data["has_api_key"] is True
    assert data.get("configured") is True
    assert "sk-user-secret" not in r.text
    assert "api_key" not in data or not data.get("api_key")

    r2 = await async_client.get("/api/v1/notifications/llm-config", headers=headers)
    assert r2.status_code == 200
    body = r2.json()["data"]
    assert body["has_api_key"] is True
    assert "presets" in body
    assert "sk-user-secret" not in r2.text


@pytest.mark.asyncio
async def test_user_llm_api_key_keep_on_empty(async_client: AsyncClient, seed_ids):
    headers = seed_ids["member_headers"]
    await async_client.put(
        "/api/v1/notifications/llm-config",
        json={
            "provider": "openai",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-4o-mini",
            "api_key": "keep-user-key",
            "enabled": True,
        },
        headers=headers,
    )
    r = await async_client.put(
        "/api/v1/notifications/llm-config",
        json={
            "provider": "openai",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-4o-mini",
            "api_key": "",
            "enabled": True,
        },
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["data"]["has_api_key"] is True


@pytest.mark.asyncio
async def test_user_llm_test_fake(async_client: AsyncClient, seed_ids):
    headers = seed_ids["member_headers"]
    await async_client.put(
        "/api/v1/notifications/llm-config",
        json={
            "provider": "fake",
            "base_url": "",
            "model": "fake",
            "enabled": True,
        },
        headers=headers,
    )
    r = await async_client.post("/api/v1/notifications/llm-test", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["code"] == 200
    data = r.json()["data"]
    assert data.get("source") == "user"
    assert data.get("provider") == "fake" or "FakeLLM" in (data.get("content") or "")


@pytest.mark.asyncio
async def test_resolve_llm_prefers_user(db_session, seed_ids, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "LLM_BASE_URL", "")
    monkeypatch.setattr(settings, "LLM_API_KEY", "")
    monkeypatch.setattr(settings, "LLM_MODEL", "")

    user = await db_session.get(User, seed_ids["member_user_id"])
    assert user is not None
    save_user_llm(
        user,
        provider="ollama",
        base_url="http://127.0.0.1:11434/v1",
        model="llama-user",
        enabled=True,
        use_for_agent=True,
    )
    await db_session.commit()
    await db_session.refresh(user)

    resolved_u = llm_from_user(user)
    assert resolved_u is not None
    assert resolved_u.source == "user"
    assert resolved_u.model == "llama-user"

    r = await resolve_llm(db_session, company_id=seed_ids["company_id"], user=user)
    assert r.source == "user"
    assert r.model == "llama-user"
