"""WebRTC signaling registry and configuration contract tests."""

import pytest

from app.services.call_registry import CallRegistry


class FakeSocket:
    def __init__(self):
        self.messages = []

    async def send_json(self, payload):
        self.messages.append(payload)


@pytest.mark.asyncio
async def test_call_registry_relays_signaling_without_media_storage():
    registry = CallRegistry()
    first = FakeSocket()
    second = FakeSocket()
    await registry.join(42, 1, first)
    await registry.join(42, 2, second)

    await registry.broadcast(42, 1, {"type": "offer", "sdp": "opaque"})
    assert second.messages[-1] == {"type": "offer", "sdp": "opaque", "from_user_id": 1}
    assert not hasattr(registry, "media")

    await registry.leave(42, 1)
    assert await registry.participant_ids(42) == [2]


@pytest.mark.asyncio
async def test_call_config_requires_company_membership(async_client, seed_ids, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "WEBRTC_STUN_URLS", "")
    response = await async_client.get(
        f"/api/v1/calls/config?company_id={seed_ids['company_id']}",
        headers=seed_ids["member_headers"],
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"]["configured"] is False

    denied = await async_client.get(
        f"/api/v1/calls/config?company_id={seed_ids['company_id']}",
        headers=seed_ids["outsider_headers"],
    )
    assert denied.status_code == 403, denied.text

