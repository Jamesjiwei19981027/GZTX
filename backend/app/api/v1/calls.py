"""Authenticated WebRTC signaling and ICE configuration endpoints."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.config import settings
from app.core.dependencies import CurrentUser, DbSession
from app.core.security import decode_token, token_revoked_for_user
from app.models.company import Company, CompanyMembership
from app.models.shell import DirectConversation, DirectConversationMember
from app.models.user import User
from app.schemas.common import ResponseData
from app.services.call_registry import call_registry

router = APIRouter(tags=["calls"])

# 首帧鉴权等待上限（秒）：太长会让未鉴权连接白占 worker
_AUTH_FRAME_TIMEOUT = 10.0


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


async def _user_from_token(db, token: str) -> User:
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
    if token_revoked_for_user(payload, user.sessions_revoked_at):
        raise HTTPException(status_code=401, detail="invalid access token")
    return user


async def _websocket_user(websocket: WebSocket, db) -> tuple[User, bool]:
    """WS 鉴权：优先 Authorization 头，否则读首帧 {"type":"auth","token":...}。

    浏览器 WebSocket 构造函数不能设自定义头，旧实现只好把 access token 放进
    `?token=`——URL 会进反代日志与 Referer。首帧鉴权把令牌挪进消息体：
    先 accept 再等一帧，超时或首帧不合法即关闭。

    返回 (user, already_accepted)：首帧鉴权必须先握手，调用方据此不要重复 accept。
    """
    authorization = websocket.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        return await _user_from_token(db, authorization[7:]), False

    await websocket.accept()
    try:
        first = await asyncio.wait_for(
            websocket.receive_json(), timeout=_AUTH_FRAME_TIMEOUT
        )
    except (asyncio.TimeoutError, WebSocketDisconnect, ValueError) as exc:
        raise HTTPException(status_code=401, detail="missing auth frame") from exc
    if not isinstance(first, dict) or first.get("type") != "auth":
        raise HTTPException(status_code=401, detail="first frame must be auth")
    return await _user_from_token(db, str(first.get("token") or "")), True


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
    # 首帧鉴权路径必须先 accept 才能收到那一帧，因此这里记录是否已握手，
    # 避免后面重复 accept。
    accepted = False
    try:
        user, accepted = await _websocket_user(websocket, db)
        await _require_conversation_access(db, user.id, conversation_id)
    except HTTPException as exc:
        await websocket.close(code=4403 if exc.status_code == 403 else 4401)
        return

    if not accepted:
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
            if "to_user_id" in envelope:
                try:
                    envelope["to_user_id"] = int(envelope["to_user_id"])
                except (TypeError, ValueError):
                    await websocket.send_json({"type": "error", "message": "to_user_id must be an integer"})
                    continue
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
