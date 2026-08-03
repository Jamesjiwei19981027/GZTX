"""External IMAP adapter must be explicit, bounded and isolated."""

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.notify import CollabInboxMessage


@pytest.mark.asyncio
async def test_external_mail_without_credentials_returns_503(async_client, seed_ids, monkeypatch):
    monkeypatch.setattr(settings, "IMAP_USER", "")
    monkeypatch.setattr(settings, "IMAP_PASSWORD", "")
    response = await async_client.post(
        f"/api/v1/external-mail/sync?company_id={seed_ids['company_id']}",
        headers=seed_ids["member_headers"],
    )
    assert response.status_code == 503, response.text
    assert "IMAP" in response.text


@pytest.mark.asyncio
async def test_external_mail_sync_stores_limited_headers_and_body(
    async_client, db_session, seed_ids, monkeypatch
):
    monkeypatch.setattr(settings, "IMAP_USER", "inbox@example.com")
    monkeypatch.setattr(settings, "IMAP_PASSWORD", "configured")
    monkeypatch.setattr(
        "app.services.email_receiver.EmailReceiver.fetch_new_emails",
        lambda self, folder="INBOX": [
            {
                "message_id": "<external-1@example.com>",
                "from": "sender@example.com",
                "to": "inbox@example.com",
                "subject": "External subject",
                "body": "External body\n" + "x" * 30000,
                "raw": "secret raw should not be stored",
            }
        ],
    )
    response = await async_client.post(
        f"/api/v1/external-mail/sync?company_id={seed_ids['company_id']}",
        headers=seed_ids["member_headers"],
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["synced"] == 1

    listed = await async_client.get(
        f"/api/v1/external-mail?company_id={seed_ids['company_id']}",
        headers=seed_ids["member_headers"],
    )
    assert listed.status_code == 200, listed.text
    item = listed.json()["data"]["items"][0]
    assert item["subject"] == "External subject"
    assert "body_text" not in item

    detail = await async_client.get(
        f"/api/v1/external-mail/{item['id']}",
        headers=seed_ids["member_headers"],
    )
    assert detail.status_code == 200, detail.text
    assert len(detail.json()["data"]["body_text"]) <= 20000
    assert "raw" not in detail.json()["data"]

    inbox_rows = (await db_session.execute(select(CollabInboxMessage))).scalars().all()
    assert inbox_rows == []

