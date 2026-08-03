import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_collab_inbox_state_actions_are_idempotent(async_client: AsyncClient, db_session, seed_ids):
    from app.models.notify import CollabInboxMessage

    row = CollabInboxMessage(
        company_id=seed_ids["company_id"],
        user_id=seed_ids["member_user_id"],
        template_key="task.reply",
        body_text="请确认交付时间",
        requires_reply=True,
    )
    db_session.add(row)
    await db_session.commit()
    await db_session.refresh(row)

    base = "/api/v1/notifications/collab"
    headers = seed_ids["member_headers"]
    listed = await async_client.get(base, headers=headers)
    assert listed.status_code == 200
    assert listed.json()["data"]["items"][0]["archived"] is False

    archived = await async_client.put(
        f"{base}/{row.id}/state",
        headers=headers,
        json={"read": True, "archived": True},
    )
    assert archived.status_code == 200
    assert archived.json()["data"]["archived"] is True

    active = await async_client.get(base, headers=headers)
    assert all(item["id"] != row.id for item in active.json()["data"]["items"])
    archived_list = await async_client.get(f"{base}?state=archived", headers=headers)
    assert [item["id"] for item in archived_list.json()["data"]["items"]] == [row.id]

    restored = await async_client.put(
        f"{base}/{row.id}/state",
        headers=headers,
        json={"archived": False, "read": False},
    )
    assert restored.status_code == 200
    assert restored.json()["data"]["read"] is False

    deleted = await async_client.delete(f"{base}/{row.id}", headers=headers)
    assert deleted.status_code == 200
    deleted_again = await async_client.delete(f"{base}/{row.id}", headers=headers)
    assert deleted_again.status_code == 404


@pytest.mark.asyncio
async def test_collab_inbox_state_is_tenant_scoped(async_client: AsyncClient, db_session, seed_ids):
    from app.models.notify import CollabInboxMessage

    row = CollabInboxMessage(
        company_id=seed_ids["company_id"],
        user_id=seed_ids["member_user_id"],
        template_key="private",
        body_text="private",
    )
    db_session.add(row)
    await db_session.commit()
    await db_session.refresh(row)

    response = await async_client.put(
        f"/api/v1/notifications/collab/{row.id}/state",
        headers=seed_ids["outsider_headers"],
        json={"archived": True},
    )
    assert response.status_code == 404
    await db_session.refresh(row)
    assert row.archived_at is None
