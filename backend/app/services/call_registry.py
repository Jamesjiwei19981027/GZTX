"""In-memory WebRTC signaling rooms.

Only signaling envelopes live here. Media always remains in the browser's
peer connection; a process restart simply clears the transient rooms.
"""

import asyncio
from typing import Any


class CallRegistry:
    def __init__(self) -> None:
        self._rooms: dict[int, dict[int, Any]] = {}
        self._lock = asyncio.Lock()

    async def join(self, conversation_id: int, user_id: int, websocket: Any) -> list[int]:
        async with self._lock:
            room = self._rooms.setdefault(conversation_id, {})
            room[user_id] = websocket
            return sorted(room)

    async def leave(self, conversation_id: int, user_id: int, websocket: Any | None = None) -> None:
        async with self._lock:
            room = self._rooms.get(conversation_id)
            if not room:
                return
            if websocket is None or room.get(user_id) is websocket:
                room.pop(user_id, None)
            if not room:
                self._rooms.pop(conversation_id, None)

    async def participant_ids(self, conversation_id: int) -> list[int]:
        async with self._lock:
            return sorted(self._rooms.get(conversation_id, {}))

    async def broadcast(
        self,
        conversation_id: int,
        sender_user_id: int,
        payload: dict[str, Any],
    ) -> None:
        async with self._lock:
            targets = [
                (user_id, websocket)
                for user_id, websocket in self._rooms.get(conversation_id, {}).items()
                if user_id != sender_user_id
            ]
        event = {**payload, "from_user_id": sender_user_id}
        stale: list[int] = []
        for user_id, websocket in targets:
            try:
                await websocket.send_json(event)
            except Exception:  # noqa: BLE001 - a dropped socket is cleaned up below
                stale.append(user_id)
        for user_id in stale:
            await self.leave(conversation_id, user_id)


call_registry = CallRegistry()

