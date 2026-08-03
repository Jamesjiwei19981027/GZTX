"""WebRTC signaling registry and configuration contract tests."""

import pytest
from starlette.websockets import WebSocketDisconnect

from app.api.v1.calls import call_signal
from app.core.security import create_access_token
from app.models.shell import DirectConversation, DirectConversationMember
from app.services.call_registry import CallRegistry


class FakeSocket:
    def __init__(self):
        self.messages = []

    async def send_json(self, payload):
        self.messages.append(payload)


class RouteSocket(FakeSocket):
    def __init__(self, token: str):
        super().__init__()
        self.headers = {"authorization": f"Bearer {token}"}
        self.query_params = {}
        self.accepted = False
        self.closed_code = None

    async def accept(self):
        self.accepted = True

    async def close(self, code: int | None = None):
        self.closed_code = code

    async def receive_json(self):
        raise WebSocketDisconnect()


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
async def test_call_registry_routes_targeted_signaling_to_one_peer():
    registry = CallRegistry()
    first = FakeSocket()
    second = FakeSocket()
    third = FakeSocket()
    await registry.join(42, 1, first)
    await registry.join(42, 2, second)
    await registry.join(42, 3, third)

    await registry.broadcast(
        42,
        1,
        {"type": "answer", "to_user_id": 2, "sdp": "opaque-answer"},
    )

    assert second.messages[-1] == {
        "type": "answer",
        "to_user_id": 2,
        "sdp": "opaque-answer",
        "from_user_id": 1,
    }
    assert third.messages == []


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


@pytest.mark.asyncio
async def test_call_websocket_route_checks_conversation_membership(db_session, seed_ids):
    conversation = DirectConversation(
        company_id=seed_ids["company_id"],
        project_id=seed_ids["project_id"],
        kind="direct",
        created_by=seed_ids["member_user_id"],
    )
    db_session.add(conversation)
    await db_session.flush()
    db_session.add_all(
        [
            DirectConversationMember(conversation_id=conversation.id, user_id=seed_ids["member_user_id"]),
            DirectConversationMember(conversation_id=conversation.id, user_id=seed_ids["pm_user_id"]),
        ]
    )
    await db_session.commit()

    allowed = RouteSocket(create_access_token(data={"sub": seed_ids["member_user_id"]}))
    await call_signal(conversation.id, allowed, db_session)
    assert allowed.accepted is True
    assert allowed.closed_code is None
    assert allowed.messages[0]["type"] == "joined"

    denied = RouteSocket(create_access_token(data={"sub": seed_ids["outsider_user_id"]}))
    await call_signal(conversation.id, denied, db_session)
    assert denied.accepted is False
    assert denied.closed_code == 4403
