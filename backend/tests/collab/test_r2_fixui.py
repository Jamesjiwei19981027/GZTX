"""第二轮 FIXUI：LLM 更新密钥不改厂商、组织同步不取到非组织集成、通知记录公司范围、邀请邮件。"""
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.integration import IntegrationAccount
from app.models.notify import NotificationRecord


async def _put_smtp(client, seed_ids):
    cid = seed_ids["company_id"]
    r = await client.put(
        f"/api/v1/companies/{cid}/smtp",
        headers=seed_ids["super_admin_headers"],
        json={
            "smtp_host": "smtp.example.com",
            "smtp_port": 465,
            "smtp_user": "bot@example.com",
            "smtp_password": "secret-pass",
            "smtp_from": "bot@example.com",
        },
    )
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_update_key_only_keeps_provider_and_model(async_client: AsyncClient, seed_ids):
    """A-02/A-12/WR-09：只传 api_key 更新密钥，不得改掉当前厂商与模型。"""
    cid = seed_ids["company_id"]
    h = seed_ids["super_admin_headers"]
    r = await async_client.put(
        f"/api/v1/companies/{cid}/llm",
        headers=h,
        json={"provider": "openai_compatible", "base_url": "https://api.deepseek.com/v1", "model": "deepseek-chat", "api_key": "k1"},
    )
    assert r.status_code == 200, r.text
    r = await async_client.put(f"/api/v1/companies/{cid}/llm", headers=h, json={"api_key": "k2-new"})
    assert r.status_code == 200, r.text
    got = (await async_client.get(f"/api/v1/companies/{cid}/llm", headers=h)).json()["data"]
    assert got["provider"] == "openai_compatible"
    assert got["model"] == "deepseek-chat"
    assert got["base_url"] == "https://api.deepseek.com/v1"
    assert got["has_api_key"] is True
    assert "openai_compatible" in got["presets"]


@pytest.mark.asyncio
async def test_unknown_provider_id_is_not_a_preset(async_client: AsyncClient, seed_ids):
    """旧前端的 deepseek/claude 不在后端预设里，会被存成 custom；前端必须用预设 id。"""
    from app.services.llm_settings import LLM_PROVIDER_PRESETS

    assert "deepseek" not in LLM_PROVIDER_PRESETS and "claude" not in LLM_PROVIDER_PRESETS
    assert {"openai", "openai_compatible", "custom"} <= set(LLM_PROVIDER_PRESETS)


@pytest.mark.asyncio
async def test_org_sync_ignores_smtp_and_llm_records(async_client: AsyncClient, seed_ids, db_session):
    """A-03/WR-10：smtp/llm 记录更新更晚，org-sync 也不能取到它们。"""
    cid = seed_ids["company_id"]
    h = seed_ids["super_admin_headers"]
    r = await async_client.post(
        f"/api/v1/companies/{cid}/integrations",
        headers=h,
        json={"provider": "generic_scim", "credentials": {"token": "t"}, "config": {"static_snapshot": {"depts": [], "users": []}}},
    )
    assert r.status_code == 200, r.text
    await _put_smtp(async_client, seed_ids)
    await async_client.put(f"/api/v1/companies/{cid}/llm", headers=h, json={"provider": "openai", "api_key": "k"})

    rows = (await db_session.execute(select(IntegrationAccount.provider).where(IntegrationAccount.company_id == cid))).scalars().all()
    assert len(set(rows)) >= 2, rows  # 同表确有非组织记录

    r2 = await async_client.post(f"/api/v1/companies/{cid}/org-sync", headers=h)
    assert r2.status_code == 200, r2.text
    assert r2.json()["data"]["provider"] == "generic_scim"

    r3 = await async_client.post(f"/api/v1/companies/{cid}/org-sync?provider=smtp", headers=h)
    assert r3.status_code == 422


@pytest.mark.asyncio
async def test_org_sync_without_org_integration_is_404(async_client: AsyncClient, seed_ids):
    cid = seed_ids["company_id"]
    await _put_smtp(async_client, seed_ids)
    r = await async_client.post(f"/api/v1/companies/{cid}/org-sync", headers=seed_ids["super_admin_headers"])
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_company_notify_records_scope(async_client: AsyncClient, seed_ids, db_session):
    """A-05/WR-06/WR-07：超管看全公司，普通成员 403；个人接口只含自己；公司外用户不出现。"""
    cid = seed_ids["company_id"]
    db_session.add_all(
        [
            NotificationRecord(user_id=seed_ids["member_user_id"], channel="email", status="sent"),
            NotificationRecord(user_id=seed_ids["pm_user_id"], channel="email", status="failed", error="x"),
            NotificationRecord(user_id=seed_ids["outsider_user_id"], channel="email", status="sent"),
        ]
    )
    await db_session.commit()

    r = await async_client.get(f"/api/v1/notify/company-records?company_id={cid}", headers=seed_ids["super_admin_headers"])
    assert r.status_code == 200, r.text
    items = r.json()["data"]["items"]
    assert {i["user_id"] for i in items} == {seed_ids["member_user_id"], seed_ids["pm_user_id"]}
    assert {i["status"] for i in items} == {"sent", "failed"}
    assert all(i["user_name"] for i in items)

    r = await async_client.get(f"/api/v1/notify/company-records?company_id={cid}", headers=seed_ids["member_headers"])
    assert r.status_code == 403
    r = await async_client.get(f"/api/v1/notify/company-records?company_id={cid}", headers=seed_ids["outsider_headers"])
    assert r.status_code == 403

    r = await async_client.get("/api/v1/notify/records", headers=seed_ids["member_headers"])
    assert [i["status"] for i in r.json()["data"]["items"]] == ["sent"]


@pytest.mark.asyncio
async def test_invitation_sends_email_when_smtp_configured(async_client: AsyncClient, seed_ids):
    """B-03：公司发信已配置 -> 发邮件（含链接），同时照样返回链接。"""
    await _put_smtp(async_client, seed_ids)
    pid = seed_ids["project_id"]
    with patch("app.utils.email._send_smtp", return_value=True) as sender:
        r = await async_client.post(
            f"/api/v1/projects/{pid}/invitations",
            headers=seed_ids["pm_headers"],
            json={"email": "new@example.com"},
        )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["email_sent"] is True and data["email_status"] == "sent"
    assert data["token"] and data["token"] in data["invite_url"]
    assert sender.call_count == 1
    kw = sender.call_args.kwargs
    assert kw["to_email"] == "new@example.com"
    assert data["token"] in kw["text_body"] and data["token"] in kw["html_body"]
    assert kw["smtp_host"] == "smtp.example.com"


@pytest.mark.asyncio
async def test_invitation_without_smtp_returns_link_only(async_client: AsyncClient, seed_ids):
    pid = seed_ids["project_id"]
    with patch("app.utils.email._send_smtp", return_value=True) as sender, patch(
        "app.services.smtp_settings.smtp_from_env", return_value=None
    ):
        r = await async_client.post(
            f"/api/v1/projects/{pid}/invitations",
            headers=seed_ids["pm_headers"],
            json={"email": "new2@example.com"},
        )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["email_status"] == "not_configured" and data["email_sent"] is False
    assert data["token"] and data["invite_url"]
    assert sender.call_count == 0


@pytest.mark.asyncio
async def test_invitation_mail_failure_still_returns_link(async_client: AsyncClient, seed_ids):
    await _put_smtp(async_client, seed_ids)
    pid = seed_ids["project_id"]
    with patch("app.utils.email._send_smtp", return_value=False):
        r = await async_client.post(
            f"/api/v1/projects/{pid}/invitations",
            headers=seed_ids["pm_headers"],
            json={"email": "new3@example.com"},
        )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["email_status"] == "failed" and data["token"]
