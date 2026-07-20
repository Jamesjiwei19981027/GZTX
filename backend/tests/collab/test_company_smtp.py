"""公司级 SMTP：前端可配、密码加密、发送解析优先级。"""
from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.integration import IntegrationAccount
from app.services.smtp_settings import PROVIDER_SMTP, resolve_smtp, smtp_from_company


@pytest.mark.asyncio
async def test_company_smtp_save_and_public_mask(
    async_client: AsyncClient, db_session, seed_ids
):
    cid = seed_ids["company_id"]
    headers = seed_ids["super_admin_headers"]

    r = await async_client.put(
        f"/api/v1/companies/{cid}/smtp",
        json={
            "smtp_host": "smtp.example.com",
            "smtp_port": 465,
            "smtp_user": "notify@example.com",
            "smtp_password": "super-secret-pass",
            "smtp_from": "notify@example.com",
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["code"] == 200
    data = body["data"]
    assert data["smtp_host"] == "smtp.example.com"
    assert data["smtp_user"] == "notify@example.com"
    assert data["has_password"] is True
    assert data.get("configured") is True
    # 永不回显密码
    assert "smtp_password" not in data or not data.get("smtp_password")

    r2 = await async_client.get(f"/api/v1/companies/{cid}/smtp", headers=headers)
    assert r2.status_code == 200
    d2 = r2.json()["data"]
    assert d2["has_password"] is True
    assert d2["smtp_host"] == "smtp.example.com"

    # 库中为加密 blob，明文不出现
    acc = (
        await db_session.execute(
            select(IntegrationAccount).where(
                IntegrationAccount.company_id == cid,
                IntegrationAccount.provider == PROVIDER_SMTP,
            )
        )
    ).scalar_one()
    assert "super-secret-pass" not in (acc.credentials_encrypted or "")

    resolved = await smtp_from_company(db_session, cid)
    assert resolved is not None
    assert resolved.password == "super-secret-pass"
    assert resolved.source == "company"


@pytest.mark.asyncio
async def test_company_smtp_password_keep_on_empty(
    async_client: AsyncClient, seed_ids
):
    cid = seed_ids["company_id"]
    headers = seed_ids["super_admin_headers"]
    await async_client.put(
        f"/api/v1/companies/{cid}/smtp",
        json={
            "smtp_host": "smtp.keep.com",
            "smtp_port": 587,
            "smtp_user": "a@keep.com",
            "smtp_password": "keep-me",
            "smtp_from": "a@keep.com",
        },
        headers=headers,
    )
    r = await async_client.put(
        f"/api/v1/companies/{cid}/smtp",
        json={
            "smtp_host": "smtp.keep.com",
            "smtp_port": 587,
            "smtp_user": "a@keep.com",
            "smtp_password": "",  # 不改密码
            "smtp_from": "a@keep.com",
        },
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["data"]["has_password"] is True


@pytest.mark.asyncio
async def test_member_cannot_write_company_smtp(async_client: AsyncClient, seed_ids):
    cid = seed_ids["company_id"]
    r = await async_client.put(
        f"/api/v1/companies/{cid}/smtp",
        json={
            "smtp_host": "x",
            "smtp_user": "y",
            "smtp_password": "z",
        },
        headers=seed_ids["member_headers"],
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_resolve_prefers_user_over_company(db_session, seed_ids, monkeypatch):
    from types import SimpleNamespace
    from app.services.smtp_settings import save_company_smtp
    from app.core.config import settings

    monkeypatch.setattr(settings, "SMTP_HOST", "")
    monkeypatch.setattr(settings, "SMTP_USER", "")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "")

    cid = seed_ids["company_id"]
    await save_company_smtp(
        db_session,
        cid,
        smtp_host="smtp.company.test",
        smtp_port=465,
        smtp_user="co@test",
        smtp_password="co-pass",
        smtp_from="co@test",
    )
    await db_session.commit()

    user = SimpleNamespace(
        id=1,
        email="u@test",
        notify_pref={
            "channels": {
                "email": {
                    "smtp_host": "smtp.user.test",
                    "smtp_port": 465,
                    "smtp_user": "u@test",
                    "smtp_password": "user-pass",
                    "smtp_from": "u@test",
                }
            }
        },
    )
    r = await resolve_smtp(db_session, user=user, company_id=cid)
    assert r is not None
    assert r.source == "user"
    assert r.host == "smtp.user.test"

    user2 = SimpleNamespace(id=2, email="n@test", notify_pref={})
    r2 = await resolve_smtp(db_session, user=user2, company_id=cid)
    assert r2 is not None
    assert r2.source == "company"
    assert r2.host == "smtp.company.test"


@pytest.mark.asyncio
async def test_send_email_uses_company_smtp(db_session, seed_ids, monkeypatch):
    from types import SimpleNamespace
    from app.services.notify import channels as ch
    from app.services.smtp_settings import save_company_smtp
    from app.core.config import settings

    monkeypatch.setattr(settings, "SMTP_HOST", "")
    monkeypatch.setattr(settings, "SMTP_USER", "")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "")
    monkeypatch.setattr(settings, "DEBUG", False)
    # secret_box 在 DEBUG=false 时拒绝弱密钥
    monkeypatch.setattr(
        settings, "SECRET_KEY", "unit-test-strong-secret-key-not-in-weak-list-32"
    )
    monkeypatch.setattr(settings, "INTEGRATION_SECRET_KEY", "unit-test-integration-secret-key")

    calls = []

    def fake_send_smtp(**kwargs):
        calls.append(kwargs)
        return True

    monkeypatch.setattr("app.utils.email._send_smtp", fake_send_smtp)

    cid = seed_ids["company_id"]
    await save_company_smtp(
        db_session,
        cid,
        smtp_host="smtp.fe.cfg",
        smtp_port=465,
        smtp_user="fe@cfg",
        smtp_password="fe-secret",
        smtp_from="fe@cfg",
    )
    await db_session.commit()

    user = SimpleNamespace(id=3, email="member@x.com", username="m", notify_pref={})
    ok = await ch.send_email_channel(
        user,
        "auth.welcome",
        {"username": "m", "company_name": "C", "app_url": "http://x"},
        db=db_session,
        company_id=cid,
    )
    assert ok is True
    assert len(calls) == 1
    assert calls[0]["smtp_host"] == "smtp.fe.cfg"
    assert calls[0]["smtp_password"] == "fe-secret"
