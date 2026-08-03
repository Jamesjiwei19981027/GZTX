import pytest
from sqlalchemy import select

from app.models.company import CompanyMembership


@pytest.mark.asyncio
async def test_shell_channels_messages_and_idempotent_like(async_client, seed_ids):
    info = seed_ids
    channels = await async_client.get(
        f"/api/v1/companies/{info['company_id']}/channels",
        headers=info["member_headers"],
    )
    assert channels.status_code == 200, channels.text
    channel = channels.json()["data"]["items"][0]

    posted = await async_client.post(
        f"/api/v1/channels/{channel['id']}/messages",
        headers=info["member_headers"],
        json={"body": "联调消息"},
    )
    assert posted.status_code == 200, posted.text
    message_id = posted.json()["data"]["id"]

    first_like = await async_client.post(
        f"/api/v1/channels/messages/{message_id}/like",
        headers=info["member_headers"],
        json={},
    )
    second_like = await async_client.post(
        f"/api/v1/channels/messages/{message_id}/like",
        headers=info["member_headers"],
        json={},
    )
    assert first_like.status_code == 200
    assert second_like.status_code == 200
    assert first_like.json()["data"]["likes"] == 1
    assert second_like.json()["data"]["likes"] == 1

    messages = await async_client.get(
        f"/api/v1/channels/{channel['id']}/messages",
        headers=info["member_headers"],
    )
    assert messages.status_code == 200
    assert any(row["id"] == message_id for row in messages.json()["data"]["items"])


@pytest.mark.asyncio
async def test_shell_rejects_company_outsider(async_client, seed_ids):
    response = await async_client.get(
        f"/api/v1/companies/{seed_ids['company_id']}/channels",
        headers=seed_ids["outsider_headers"],
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_shell_rejects_unknown_project_channel_scope(async_client, seed_ids):
    response = await async_client.get(
        f"/api/v1/companies/{seed_ids['company_id']}/channels?project_id=999999",
        headers=seed_ids["member_headers"],
    )
    assert response.status_code == 404, response.text


@pytest.mark.asyncio
async def test_shell_rejects_suspended_company_member_even_if_project_membership_remains(
    async_client, db_session, seed_ids
):
    membership = (
        await db_session.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == seed_ids["company_id"],
                CompanyMembership.user_id == seed_ids["member_user_id"],
            )
        )
    ).scalar_one()
    membership.status = "suspended"
    await db_session.commit()

    response = await async_client.get(
        f"/api/v1/companies/{seed_ids['company_id']}/channels",
        headers=seed_ids["member_headers"],
    )
    assert response.status_code == 403, response.text
