"""Authenticated WebRTC signaling and ICE configuration endpoints."""

from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.config import settings
from app.core.dependencies import CurrentUser, DbSession
from app.core.security import decode_token, token_revoked_for_user
from app.models.company import Company, CompanyMembership
from app.models.project import Project
from app.models.shell import DirectConversation, DirectConversationMember
from app.models.communication import CallRecording, CallSession, ConversationSummary
from app.models.user import User
from app.schemas.common import ResponseData
from app.services.call_registry import call_registry
from app.services.communication_summary import summarize_lines_with_llm, summary_dto
from app.services.asr.router import AsrRouter
from app.services.responsibility_access import can_access_project_channels

router = APIRouter(tags=["语音通话"])

# 首帧鉴权等待上限（秒）：太长会让未鉴权连接白占 worker
_AUTH_FRAME_TIMEOUT = 10.0


class CallSessionCreate(BaseModel):
    conversation_id: int
    call_type: str = Field(default="audio", pattern="^(audio|video)$")
    project_id: int | None = None


def _call_session_dto(row: CallSession) -> dict[str, Any]:
    return {
        "id": row.id,
        "company_id": row.company_id,
        "project_id": row.project_id,
        "conversation_id": row.conversation_id,
        "initiated_by": row.initiated_by,
        "call_type": row.call_type,
        "status": row.status,
        "participants": list(row.participants_json or []),
        "started_at": row.started_at.isoformat() if row.started_at else None,
        "ended_at": row.ended_at.isoformat() if row.ended_at else None,
    }


def _recording_dto(row: CallRecording) -> dict[str, Any]:
    return {
        "id": row.id,
        "call_session_id": row.call_session_id,
        "original_name": row.original_name,
        "mime_type": row.mime_type,
        "size_bytes": row.size_bytes,
        "status": row.transcription_status,
        "transcription_status": row.transcription_status,
        "transcription_provider": row.transcription_provider,
        "transcript_text": row.transcript_text,
        "transcription_error": row.transcription_error,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


async def _call_access(db, user_id: int, session_id: int) -> tuple[CallSession, DirectConversation]:
    session = await db.get(CallSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="call session not found")
    conversation = await _require_conversation_access(db, user_id, session.conversation_id)
    return session, conversation


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
    """获取语音通话配置"""
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


@router.post("/calls/sessions", response_model=ResponseData)
async def create_call_session(body: CallSessionCreate, db: DbSession, user: CurrentUser):
    """发起语音通话"""
    try:
        conversation = await _require_conversation_access(db, user.id, body.conversation_id)
    except HTTPException as exc:
        raise exc
    members = (await db.execute(
        select(DirectConversationMember.user_id)
        .where(DirectConversationMember.conversation_id == conversation.id)
        .order_by(DirectConversationMember.user_id.asc())
    )).scalars().all()
    row = CallSession(
        company_id=conversation.company_id,
        project_id=body.project_id if body.project_id is not None else conversation.project_id,
        conversation_id=conversation.id,
        initiated_by=user.id,
        call_type=body.call_type,
        participants_json=[int(item) for item in members],
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ResponseData(data=_call_session_dto(row))


@router.get("/calls/sessions/{session_id}", response_model=ResponseData)
async def get_call_session(session_id: int, db: DbSession, user: CurrentUser):
    """获取通话详情"""
    session, _ = await _call_access(db, user.id, session_id)
    recordings = (await db.execute(
        select(CallRecording).where(CallRecording.call_session_id == session.id).order_by(CallRecording.id.desc())
    )).scalars().all()
    return ResponseData(data={"session": _call_session_dto(session), "recordings": [_recording_dto(item) for item in recordings]})


@router.post("/calls/sessions/{session_id}/end", response_model=ResponseData)
async def end_call_session(session_id: int, db: DbSession, user: CurrentUser):
    """结束通话"""
    session, _ = await _call_access(db, user.id, session_id)
    if session.status != "ended":
        session.status = "ended"
        session.ended_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(session)
    return ResponseData(data=_call_session_dto(session))


@router.post("/calls/sessions/{session_id}/recordings", response_model=ResponseData, status_code=201)
async def upload_call_recording(session_id: int, db: DbSession, user: CurrentUser, file: UploadFile = File(...)):
    """上传通话录音"""
    session, conversation = await _call_access(db, user.id, session_id)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=422, detail="recording is empty")
    max_recording_size = 100 * 1024 * 1024
    if len(data) > max_recording_size:
        raise HTTPException(status_code=413, detail="recording too large")
    from app.api.v1.shell import _store_collab_file

    # Reuse the existing collaboration object store and ACL-scoped file metadata.
    class MemoryUpload:
        def __init__(self, filename: str, content_type: str):
            self.filename = filename
            self.content_type = content_type

        async def read(self, size: int = -1):
            return data

    collab = await _store_collab_file(
        db,
        file=MemoryUpload(file.filename or "call-recording.wav", file.content_type or "audio/wav"),
        company_id=conversation.company_id,
        owner_user_id=user.id,
        scope_type="conversation",
        scope_id=conversation.id,
    )
    recording = CallRecording(
        call_session_id=session.id,
        company_id=conversation.company_id,
        storage_key=collab.storage_key,
        original_name=collab.original_name,
        mime_type=collab.mime_type,
        size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
    )
    db.add(recording)
    await db.commit()
    await db.refresh(recording)
    return ResponseData(data=_recording_dto(recording))


@router.post("/calls/sessions/{session_id}/transcribe", response_model=ResponseData)
async def transcribe_call_recording(session_id: int, db: DbSession, user: CurrentUser):
    """通话录音转文字"""
    session, conversation = await _call_access(db, user.id, session_id)
    recording = (await db.execute(
        select(CallRecording).where(CallRecording.call_session_id == session.id).order_by(CallRecording.id.desc())
    )).scalars().first()
    if not recording:
        raise HTTPException(status_code=404, detail="recording not found")
    from app.api.v1.shell import _collab_file_path

    path = _collab_file_path(recording.storage_key)
    if not path.exists():
        recording.transcription_status = "unavailable"
        recording.transcription_error = "recording content not found"
        await db.commit()
        return ResponseData(data=_recording_dto(recording))
    company = await db.get(Company, conversation.company_id)
    engine = await AsrRouter().resolve(db, company, user_id=user.id)
    try:
        text = await engine.transcribe(path.read_bytes(), recording.mime_type, language="zh")
        provider = getattr(engine, "provider_id", "unknown")
        if provider == "builtin" or str(text).startswith("[builtin-asr]"):
            recording.transcription_status = "unavailable"
            recording.transcription_error = "真实 ASR 未配置"
            recording.transcription_provider = provider
            recording.transcript_text = None
        else:
            recording.transcription_status = "completed"
            recording.transcription_provider = provider
            recording.transcript_text = str(text or "").strip()
    except Exception as exc:
        recording.transcription_status = "failed"
        recording.transcription_error = str(exc)[:2000]
    await db.commit()
    await db.refresh(recording)
    return ResponseData(data=_recording_dto(recording))


@router.post("/calls/sessions/{session_id}/summarize", response_model=ResponseData)
async def summarize_call_session(session_id: int, db: DbSession, user: CurrentUser):
    """AI 总结通话内容"""
    session, _ = await _call_access(db, user.id, session_id)
    recording = (await db.execute(
        select(CallRecording).where(
            CallRecording.call_session_id == session.id,
            CallRecording.transcription_status == "completed",
        ).order_by(CallRecording.id.desc())
    )).scalars().first()
    if not recording or not recording.transcript_text:
        raise HTTPException(status_code=409, detail="请先完成真实语音转写")
    result = await summarize_lines_with_llm(
        db,
        company_id=session.company_id,
        user=user,
        lines=[recording.transcript_text],
    )
    row = ConversationSummary(
        company_id=session.company_id,
        project_id=session.project_id,
        scope_type="call",
        scope_id=session.id,
        requested_by=user.id,
        source_count=1,
        summary_text=result["summary_text"],
        key_points_json=result["key_points"],
        decisions_json=result["decisions"],
        action_items_json=result["action_items"],
        risks_json=result["risks"],
        provider=result["provider"],
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ResponseData(data=summary_dto(row))


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
    if conversation.project_id is not None:
        project = await db.get(Project, conversation.project_id)
        if not project or project.company_id != conversation.company_id or not await can_access_project_channels(db, project, user_id):
            raise HTTPException(status_code=403, detail='project conversation access denied')
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
