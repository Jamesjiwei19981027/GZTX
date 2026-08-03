"""Authenticated WebRTC signaling and ICE configuration endpoints."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.config import settings
from app.core.dependencies import CurrentUser, DbSession
from app.core.security import decode_token
from app.models.company import Company, CompanyMembership
from app.models.shell import DirectConversation, DirectConversationMember
from app.models.user import User
from app.schemas.common import ResponseData
from app.services.call_registry import call_registry

router = APIRouter(tags=["calls"])


def _parse_urls(raw: str | None) -> list[str]:
    if not raw:
        return []
    value = raw.strip()
    if not value:
        return []
    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
    except json.JSONDecodeError:
        pass
    return [item.strip() for item in value.split(",") if item.strip()]


async def _require_company_access(db, user_id: int, company_id: int) -> Company:
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="company not found")
    membership = await db.scalar(
        select(CompanyMembership.id).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == user_id,
            CompanyMembership.status == "active",
            CompanyMembership.employment_status == "active",
        )
    )
    if membership is None:
        raise HTTPException(status_code=403, detail="not an active company member")
    if company.status == "pending_license":
        raise HTTPException(status_code=403, detail="company call feature is not active")
    return company


def _ice_servers() -> list[dict[str, Any]]:
    servers: list[dict[str, Any]] = []
    for url in _parse_urls(settings.WEBRTC_STUN_URLS):
        servers.append({"urls": url})
    turn_urls = _parse_urls(settings.WEBRTC_TURN_URLS)
    if turn_urls:
        item: dict[str, Any] = {"urls": turn_urls}
        if settings.WEBRTC_TURN_USERNAME:
            item["username"] = settings.WEBRTC_TURN_USERNAME
        if settings.WEBRTC_TURN_CREDENTIAL:
            item["credential"] = settings.WEBRTC_TURN_CREDENTIAL
        servers.append(item)
    return servers


@router.get("/calls/config", response_model=ResponseData)
async def call_config(db: DbSession, user: CurrentUser, company_id: int = Query(...)):
    await _require_company_access(db, user.id, company_id)
    servers = _ice_servers()
    return ResponseData(
        data={
            "configured": bool(servers),
            "ice_servers": servers,
            "message": "STUN/TURN is not configured; local/browser defaults may still work"
            if not servers
            else "ICE servers configured",
        }
    )


async def _websocket_user(websocket: WebSocket, db) -> User:
    authorization = websocket.headers.get("authorization", "")
    token = websocket.query_params.get("token")
    if authorization.lower().startswith("bearer "):
        token = authorization[7:]
    payload = decode_token(token or "")
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="invalid access token")
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="invalid access token") from exc
    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="invalid user")
    return user


async def _require_conversation_access(db, user_id: int, conversation_id: int) -> DirectConversation:
    conversation = await db.get(DirectConversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="conversation not found")
    await _require_company_access(db, user_id, conversation.company_id)
    member = await db.scalar(
        select(DirectConversationMember.id).where(
            DirectConversationMember.conversation_id == conversation_id,
            DirectConversationMember.user_id == user_id,
        )
    )
    if member is None:
        raise HTTPException(status_code=403, detail="not a conversation member")
    return conversation


@router.websocket("/calls/ws/{conversation_id}")
async def call_signal(conversation_id: int, websocket: WebSocket, db: DbSession):
    try:
        user = await _websocket_user(websocket, db)
        await _require_conversation_access(db, user.id, conversation_id)
    except HTTPException as exc:
        await websocket.close(code=4403 if exc.status_code == 403 else 4401)
        return

    await websocket.accept()
    joined = False
    try:
        participants = await call_registry.join(conversation_id, user.id, websocket)
        joined = True
        await websocket.send_json(
            {
                "type": "joined",
                "conversation_id": conversation_id,
                "user_id": user.id,
                "participants": participants,
                "ice_servers": _ice_servers(),
            }
        )
        await call_registry.broadcast(
            conversation_id,
            user.id,
            {"type": "peer_joined", "conversation_id": conversation_id},
        )
        while True:
            incoming = await websocket.receive_json()
            kind = incoming.get("type") if isinstance(incoming, dict) else None
            if kind == "leave":
                break
            if kind not in {"offer", "answer", "ice"}:
                await websocket.send_json({"type": "error", "message": "unsupported signaling message"})
                continue
            envelope = {"type": kind, "conversation_id": conversation_id}
            for key in ("sdp", "candidate", "sdpMid", "sdpMLineIndex", "to_user_id"):
                if key in incoming:
                    envelope[key] = incoming[key]
            await call_registry.broadcast(conversation_id, user.id, envelope)
    except WebSocketDisconnect:
        pass
    finally:
        if joined:
            await call_registry.leave(conversation_id, user.id, websocket)
            await call_registry.broadcast(
                conversation_id,
                user.id,
                {"type": "peer_left", "conversation_id": conversation_id},
            )
