"""Binary collaboration-file upload, message binding and ACL tests."""

from io import BytesIO

import pytest
from sqlalchemy import select

from app.models.notify import CollabInboxMessage


@pytest.mark.asyncio
async def test_channel_file_upload_binds_to_message_and_lists_metadata(async_client, db_session, seed_ids):
    channels = await async_client.get(
        f"/api/v1/companies/{seed_ids['company_id']}/channels",
        headers=seed_ids["member_headers"],
    )
    assert channels.status_code == 200, channels.text
    channel_id = channels.json()["data"]["items"][0]["id"]

    uploaded = await async_client.post(
        f"/api/v1/channels/{channel_id}/files",
        headers=seed_ids["member_headers"],
        files={"file": ("hello.txt", BytesIO(b"hello collaboration"), "text/plain")},
    )
    assert uploaded.status_code == 201, uploaded.text
    file_data = uploaded.json()["data"]
    assert file_data["original_name"] == "hello.txt"
    assert file_data["size_bytes"] == len(b"hello collaboration")
    assert len(file_data["sha256"]) == 64
    assert file_data["scope_type"] == "channel"

    posted = await async_client.post(
        f"/api/v1/channels/{channel_id}/messages",
        headers=seed_ids["member_headers"],
        json={"body": "file attached", "file_ids": [file_data["id"]]},
    )
    assert posted.status_code == 200, posted.text
    message = posted.json()["data"]
    assert message["attachments"][0]["file_id"] == file_data["id"]

    listed = await async_client.get(
        f"/api/v1/channels/{channel_id}/files",
        headers=seed_ids["member_headers"],
    )
    assert listed.status_code == 200, listed.text
    assert listed.json()["data"]["items"][0]["id"] == file_data["id"]

    downloaded = await async_client.get(
        file_data["download_url"],
        headers=seed_ids["member_headers"],
    )
    assert downloaded.status_code == 200
    assert downloaded.content == b"hello collaboration"
    denied = await async_client.get(
        file_data["download_url"],
        headers=seed_ids["outsider_headers"],
    )
    assert denied.status_code == 403

    row = await db_session.get(CollabInboxMessage, -1)
    assert row is None  # collaboration files do not leak into inbox notifications


@pytest.mark.asyncio
async def test_channel_file_upload_rejects_oversize_and_outsider(async_client, seed_ids):
    channels = await async_client.get(
        f"/api/v1/companies/{seed_ids['company_id']}/channels",
        headers=seed_ids["member_headers"],
    )
    channel_id = channels.json()["data"]["items"][0]["id"]

    too_large = await async_client.post(
        f"/api/v1/channels/{channel_id}/files",
        headers=seed_ids["member_headers"],
        files={"file": ("large.zip", BytesIO(b"x" * (20 * 1024 * 1024 + 1)), "application/zip")},
    )
    assert too_large.status_code == 413, too_large.text

    outsider = await async_client.post(
        f"/api/v1/channels/{channel_id}/files",
        headers=seed_ids["outsider_headers"],
        files={"file": ("nope.txt", BytesIO(b"nope"), "text/plain")},
    )
    assert outsider.status_code == 403, outsider.text


@pytest.mark.asyncio
async def test_direct_file_upload_and_empty_text_message(async_client, seed_ids):
    conversation = await async_client.post(
        f"/api/v1/companies/{seed_ids['company_id']}/conversations",
        headers=seed_ids["member_headers"],
        json={"member_user_ids": [seed_ids["pm_user_id"]]},
    )
    assert conversation.status_code == 200, conversation.text
    conversation_id = conversation.json()["data"]["id"]
    uploaded = await async_client.post(
        f"/api/v1/conversations/{conversation_id}/files",
        headers=seed_ids["member_headers"],
        files={"file": ("direct.md", BytesIO(b"direct"), "text/markdown")},
    )
    assert uploaded.status_code == 201, uploaded.text
    file_id = uploaded.json()["data"]["id"]
    posted = await async_client.post(
        f"/api/v1/conversations/{conversation_id}/messages",
        headers=seed_ids["member_headers"],
        json={"body": "", "file_ids": [file_id]},
    )
    assert posted.status_code == 200, posted.text
    assert posted.json()["data"]["attachments"][0]["file_id"] == file_id
