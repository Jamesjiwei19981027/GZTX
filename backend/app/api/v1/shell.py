"""Remix UI 壳层补齐 API：消息 / 活动流 / 人轴审计 / 节点布局 / 趋势"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import mimetypes
import os
import uuid
from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select, or_
from sqlalchemy.orm.attributes import flag_modified

from app.core.collab_errors import CollabError, fail
from app.core.dependencies import CurrentUser, DbSession
from app.core.config import settings
from app.models.collab_file import CollabFile
from app.models.audit import AuditLog
from app.models.category import Category
from app.models.company import CompanyMembership
from app.models.evidence import EvidencePackage
from app.models.project import Project
from app.models.shell import (
    TeamChannel,
    TeamChannelMessage,
    UserPresence,
    DirectConversation,
    DirectConversationMember,
    DirectMessage,
    PinnedLink,
)
from app.models.communication import ConversationSummary
from app.models.task import Task
from app.services.task_statistics import statistics_query, statistics_window
from app.models.tree import TreeNode
from app.models.user import User
from app.schemas.common import ResponseData
from app.services.acl import AclService
from app.services.tree_service import TreeService
from app.services.communication_summary import summarize_lines_with_llm, summary_dto
from app.services.work_contacts import allowed_work_contacts
from app.services.responsibility_access import can_access_project_channels

router = APIRouter(tags=["频道私聊与界面偏好"])
acl = AclService()
tsvc = TreeService()


class ChannelCreate(BaseModel):
    key: str = "general"
    name: str = Field(..., min_length=1, max_length=120)
    project_id: Optional[int] = None


class MessageCreate(BaseModel):
    body: str = Field(default="", max_length=4000)
    parent_id: Optional[int] = None
    message_type: str = "user"
    attachments: list[dict] = Field(default_factory=list)
    file_ids: list[int] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def body_or_file(self):
        if not self.body.strip() and not self.file_ids and not self.attachments:
            raise ValueError("message body or attachment is required")
        return self


class ConversationCreate(BaseModel):
    member_user_ids: list[int] = Field(..., min_length=1, max_length=50)
    kind: str = "direct"
    title: Optional[str] = Field(default=None, max_length=120)
    project_id: Optional[int] = None


class PinnedLinkBody(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    url: str = Field(..., min_length=4, max_length=2000)


class LayoutBody(BaseModel):
    offset_x: float = 0
    offset_y: float = 0
    orientation: Literal["horizontal", "vertical"] | None = None


class UiPrefsBody(BaseModel):
    language: Optional[str] = None
    accent: Optional[str] = None
    theme_mode: Optional[str] = None
    task_default_priority: Optional[int] = None
    task_default_category_id: Optional[int] = None


class PresenceBody(BaseModel):
    status: str = "online"  # online|busy|offline


MAX_COLLAB_FILE_SIZE = 20 * 1024 * 1024
ALLOWED_COLLAB_EXTENSIONS = {
    ".7z",
    ".csv",
    ".doc",
    ".docx",
    ".gif",
    ".jpeg",
    ".jpg",
    ".json",
    ".md",
    ".pdf",
    ".png",
    ".ppt",
    ".pptx",
    ".rar",
    ".txt",
    ".webp",
    ".xls",
    ".xlsx",
    ".zip",
    ".wav",
    ".mp3",
    ".m4a",
    ".ogg",
    ".webm",
}


async def _require_company_member(db, user_id: int, company_id: int):
    mq = await db.execute(
        select(CompanyMembership.id).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == user_id,
            CompanyMembership.status == "active",
        ).limit(1)
    )
    if mq.scalar():
        return
    # A project membership is not a substitute for an active company
    # membership.  The ACL service follows the same rule; allowing a stale
    # project_members row here would expose company-wide channels after a
    # member was suspended or removed from the company.
    raise CollabError(403, 40301, "非公司成员")


async def _require_channel_scope(
    db, user_id: int, company_id: int, project_id: int | None
):
    """Check the company scope and, for project channels, project membership."""
    await _require_company_member(db, user_id, company_id)
    if project_id is None:
        return
    project = await db.get(Project, project_id)
    if not project or project.company_id != company_id:
        raise CollabError(404, 40400, "项目不存在")
    if not await acl.can(db, user_id, company_id, "project.read", project_id=project_id):
        raise CollabError(403, 40301, "非项目成员")
    if not await can_access_project_channels(db, project, user_id):
        raise CollabError(403, 40301, '下辖人员尚未获得项目频道访问授权，请联系项目管理人员')


async def _ensure_default_channels(db, company_id: int, project_id: int | None):
    keys = [
        ("general", "全员交流大厅"),
        ("project", "项目冲刺组"),
        ("direct", "公共提及频道"),
    ]
    out = []
    for key, name in keys:
        conds = [
            TeamChannel.company_id == company_id,
            TeamChannel.key == key,
        ]
        if project_id is not None:
            conds.append(TeamChannel.project_id == project_id)
        else:
            conds.append(TeamChannel.project_id.is_(None))
        q = await db.execute(select(TeamChannel).where(*conds))
        ch = q.scalar_one_or_none()
        if not ch:
            ch = TeamChannel(
                company_id=company_id,
                project_id=project_id,
                key=key,
                name=name,
            )
            db.add(ch)
            await db.flush()
        out.append(ch)
    return out


def _collab_file_dto(file: CollabFile) -> dict:
    return {
        "id": file.id,
        "company_id": file.company_id,
        "owner_user_id": file.owner_user_id,
        "scope_type": file.scope_type,
        "scope_id": file.scope_id,
        "message_id": file.message_id,
        "storage_key": file.storage_key,
        "original_name": file.original_name,
        "mime_type": file.mime_type,
        "size_bytes": file.size_bytes,
        "sha256": file.sha256,
        "download_url": f"/api/v1/collab/files/{file.id}/download",
        "created_at": file.created_at.isoformat() if file.created_at else None,
    }


def _collab_file_path(storage_key: str) -> Path:
    root = Path(settings.UPLOAD_DIR).resolve()
    path = (root / storage_key).resolve()
    if root not in path.parents:
        raise HTTPException(status_code=404, detail="file not found")
    return path


async def _store_collab_file(
    db: DbSession,
    *,
    file: UploadFile,
    company_id: int,
    owner_user_id: int,
    scope_type: str,
    scope_id: int,
) -> CollabFile:
    filename = Path(file.filename or "").name
    if not filename:
        raise HTTPException(status_code=400, detail="file name is required")
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_COLLAB_EXTENSIONS:
        raise HTTPException(status_code=415, detail="unsupported collaboration file type")
    content = await file.read(MAX_COLLAB_FILE_SIZE + 1)
    if not content:
        raise HTTPException(status_code=400, detail="file is empty")
    if len(content) > MAX_COLLAB_FILE_SIZE:
        raise HTTPException(status_code=413, detail="collaboration file exceeds 20 MiB")

    safe_name = filename[:255]
    storage_key = f"collab/{company_id}/{owner_user_id}/{uuid.uuid4().hex}{extension}"
    path = _collab_file_path(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    row = CollabFile(
        company_id=company_id,
        owner_user_id=owner_user_id,
        scope_type=scope_type,
        scope_id=scope_id,
        storage_key=storage_key,
        original_name=safe_name,
        mime_type=file.content_type or mimetypes.guess_type(safe_name)[0] or "application/octet-stream",
        size_bytes=len(content),
        sha256=hashlib.sha256(content).hexdigest(),
    )
    db.add(row)
    await db.flush()
    return row


async def _bind_collab_files(
    db: DbSession,
    *,
    file_ids: list[int],
    owner_user_id: int,
    scope_type: str,
    scope_id: int,
    message_id: int,
) -> list[dict]:
    ids = list(dict.fromkeys(file_ids))
    if not ids:
        return []
    rows = (
        await db.execute(
            select(CollabFile).where(
                CollabFile.id.in_(ids),
                CollabFile.owner_user_id == owner_user_id,
                CollabFile.scope_type == scope_type,
                CollabFile.scope_id == scope_id,
                CollabFile.message_id.is_(None),
            )
        )
    ).scalars().all()
    if {row.id for row in rows} != set(ids):
        raise HTTPException(status_code=422, detail="invalid or already bound collaboration file")
    by_id = {row.id: row for row in rows}
    metadata = []
    for file_id in ids:
        row = by_id[file_id]
        row.message_id = message_id
        metadata.append(
            {
                "file_id": row.id,
                "original_name": row.original_name,
                "mime_type": row.mime_type,
                "size_bytes": row.size_bytes,
                "download_url": f"/api/v1/collab/files/{row.id}/download",
            }
        )
    await db.flush()
    return metadata


def _msg_dto(m: TeamChannelMessage, u: User | None) -> dict:
    return {
        "id": m.id,
        "channel_id": m.channel_id,
        "user_id": m.user_id,
        "sender_name": (u.nickname or u.username) if u else f"用户{m.user_id}",
        "sender_avatar": (u.avatar_url or "") if u else "",
        "body": m.body,
        "likes": m.likes or 0,
        "parent_id": m.parent_id,
        "message_type": m.message_type or "user",
        "attachments": list(m.attachments_json or []),
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


@router.get("/companies/{company_id}/channels", response_model=ResponseData)
async def list_channels(
    company_id: int,
    db: DbSession,
    user: CurrentUser,
    project_id: Optional[int] = None,
):
    """列出企业频道"""
    try:
        await _require_channel_scope(db, user.id, company_id, project_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    channels = await _ensure_default_channels(db, company_id, project_id)
    await db.commit()
    return ResponseData(
        data={
            "items": [
                {
                    "id": c.id,
                    "key": c.key,
                    "name": '公共提及频道' if c.key == 'direct' and c.name == '私信与提及' else c.name,
                    "project_id": c.project_id,
                }
                for c in channels
            ]
        }
    )


@router.post("/companies/{company_id}/channels", response_model=ResponseData)
async def create_channel(
    company_id: int, body: ChannelCreate, db: DbSession, user: CurrentUser
):
    """创建频道"""
    try:
        await _require_channel_scope(db, user.id, company_id, body.project_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    ch = TeamChannel(
        company_id=company_id,
        project_id=body.project_id,
        key=body.key[:32],
        name=body.name,
    )
    db.add(ch)
    await db.commit()
    await db.refresh(ch)
    return ResponseData(
        data={"id": ch.id, "key": ch.key, "name": ch.name, "project_id": ch.project_id}
    )


@router.post("/channels/{channel_id}/files", response_model=ResponseData, status_code=201)
async def upload_channel_file(
    channel_id: int,
    db: DbSession,
    user: CurrentUser,
    file: UploadFile = File(...),
):
    """上传频道文件"""
    channel = await db.get(TeamChannel, channel_id)
    if not channel:
        return fail(404, 40400, "channel not found")
    try:
        await _require_channel_scope(db, user.id, channel.company_id, channel.project_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    row = await _store_collab_file(
        db,
        file=file,
        company_id=channel.company_id,
        owner_user_id=user.id,
        scope_type="channel",
        scope_id=channel.id,
    )
    await db.commit()
    await db.refresh(row)
    return ResponseData(data=_collab_file_dto(row))


@router.get("/channels/{channel_id}/messages", response_model=ResponseData)
async def list_messages(
    channel_id: int,
    db: DbSession,
    user: CurrentUser,
    page: int = 1,
    page_size: int = 50,
):
    """列出频道消息"""
    ch = await db.get(TeamChannel, channel_id)
    if not ch:
        return fail(404, 40400, "频道不存在")
    try:
        await _require_channel_scope(db, user.id, ch.company_id, ch.project_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    page = max(1, page)
    page_size = min(100, max(1, page_size))
    q = await db.execute(
        select(TeamChannelMessage, User)
        .outerjoin(User, User.id == TeamChannelMessage.user_id)
        .where(TeamChannelMessage.channel_id == channel_id)
        .order_by(TeamChannelMessage.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = q.all()
    items = [_msg_dto(m, u) for m, u in rows]
    items.reverse()
    return ResponseData(data={"items": items, "page": page, "page_size": page_size})


@router.post("/channels/{channel_id}/messages", response_model=ResponseData)
async def post_message(
    channel_id: int, body: MessageCreate, db: DbSession, user: CurrentUser
):
    """发送频道消息"""
    ch = await db.get(TeamChannel, channel_id)
    if not ch:
        return fail(404, 40400, "频道不存在")
    try:
        await _require_channel_scope(db, user.id, ch.company_id, ch.project_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    m = TeamChannelMessage(
        channel_id=channel_id,
        user_id=user.id,
        body=body.body.strip(),
        parent_id=body.parent_id,
        message_type=body.message_type if body.message_type in ("user", "system") else "user",
        attachments_json=[dict(item) for item in body.attachments[:20] if isinstance(item, dict)],
    )
    db.add(m)
    await db.flush()
    file_metadata = await _bind_collab_files(
        db,
        file_ids=body.file_ids,
        owner_user_id=user.id,
        scope_type="channel",
        scope_id=channel_id,
        message_id=m.id,
    )
    m.attachments_json = [*list(m.attachments_json or []), *file_metadata]
    await db.commit()
    await db.refresh(m)
    u = await db.get(User, user.id)
    return ResponseData(data=_msg_dto(m, u))


@router.post("/channels/messages/{message_id}/like", response_model=ResponseData)
async def like_message(message_id: int, db: DbSession, user: CurrentUser):
    """点赞频道消息"""
    m = (
        await db.execute(
            select(TeamChannelMessage)
            .where(TeamChannelMessage.id == message_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if not m:
        return fail(404, 40400, "消息不存在")
    ch = await db.get(TeamChannel, m.channel_id)
    if not ch:
        return fail(404, 40400, "频道不存在")
    try:
        await _require_channel_scope(db, user.id, ch.company_id, ch.project_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    liked_by = list(m.liked_by or [])
    if user.id not in liked_by:
        liked_by.append(user.id)
        m.liked_by = liked_by
        m.likes = int(m.likes or 0) + 1
    await db.commit()
    return ResponseData(data={"id": m.id, "likes": m.likes})


async def _require_direct_member(db, user_id: int, conversation_id: int):
    conversation = await db.get(DirectConversation, conversation_id)
    if not conversation:
        raise CollabError(404, 40400, "conversation not found")
    await _require_company_member(db, user_id, conversation.company_id)
    if conversation.project_id is not None:
        await _require_channel_scope(db, user_id, conversation.company_id, conversation.project_id)
    membership = (
        await db.execute(
            select(DirectConversationMember.id).where(
                DirectConversationMember.conversation_id == conversation_id,
                DirectConversationMember.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        raise CollabError(403, 40301, "not a conversation member")
    return conversation


@router.get("/companies/{company_id}/conversations", response_model=ResponseData)
async def list_direct_conversations(company_id: int, db: DbSession, user: CurrentUser):
    """列出私聊会话"""
    try:
        await _require_company_member(db, user.id, company_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    rows = (
        await db.execute(
            select(DirectConversation)
            .join(DirectConversationMember, DirectConversationMember.conversation_id == DirectConversation.id)
            .where(
                DirectConversation.company_id == company_id,
                DirectConversationMember.user_id == user.id,
            )
            .order_by(DirectConversation.id.desc())
        )
    ).scalars().unique().all()
    items = []
    for conversation in rows:
        if conversation.project_id is not None:
            try:
                await _require_channel_scope(db, user.id, company_id, conversation.project_id)
            except CollabError:
                continue
        members = (
            await db.execute(
                select(DirectConversationMember, User)
                .join(User, User.id == DirectConversationMember.user_id)
                .where(DirectConversationMember.conversation_id == conversation.id)
            )
        ).all()
        last = (
            await db.execute(
                select(DirectMessage)
                .where(DirectMessage.conversation_id == conversation.id)
                .order_by(DirectMessage.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        items.append(
            {
                "id": conversation.id,
                "company_id": conversation.company_id,
                "project_id": conversation.project_id,
                "kind": conversation.kind,
                "title": conversation.title,
                "members": [
                    {
                        "user_id": member.user_id,
                        "name": user.nickname or user.username,
                        "avatar": user.avatar_url or "",
                    }
                    for member, user in members
                ],
                "last_message": {
                    "body": last.body,
                    "created_at": last.created_at.isoformat() if last and last.created_at else None,
                }
                if last
                else None,
            }
        )
    return ResponseData(data={"items": items})


@router.get("/companies/{company_id}/contacts", response_model=ResponseData)
async def list_work_contacts(company_id: int, db: DbSession, user: CurrentUser, project_id: int | None = None):
    """列出工作联系人"""
    try:
        await _require_company_member(db, user.id, company_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    ids = await allowed_work_contacts(db, company_id, user.id, project_id)
    rows = (await db.execute(select(User).where(User.id.in_(ids)).order_by(User.id))).scalars().all()
    return ResponseData(data={'items': [{'id': u.id, 'name': u.nickname or u.username, 'avatar': u.avatar_url or ''} for u in rows]})


@router.post("/companies/{company_id}/conversations", response_model=ResponseData)
async def create_direct_conversation(
    company_id: int, body: ConversationCreate, db: DbSession, user: CurrentUser
):
    """创建私聊会话"""
    try:
        await _require_company_member(db, user.id, company_id)
        if body.project_id is not None:
            await _require_channel_scope(db, user.id, company_id, body.project_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    member_ids = sorted(set([user.id, *body.member_user_ids]))
    if body.kind not in ("direct", "group"):
        return fail(422, 42200, "kind must be direct or group")
    active = (
        await db.execute(
            select(CompanyMembership.user_id).where(
                CompanyMembership.company_id == company_id,
                CompanyMembership.user_id.in_(member_ids),
                CompanyMembership.status == "active",
            )
        )
    ).scalars().all()
    if set(active) != set(member_ids):
        return fail(422, 42200, "all conversation members must be active company members")
    if body.project_id is not None:
        for member_id in member_ids:
            try:
                await _require_channel_scope(db, member_id, company_id, body.project_id)
            except CollabError:
                return fail(403, 40300, '项目群聊成员必须具有本项目频道访问权限')
    if body.kind == 'direct' and len(member_ids) != 2:
        return fail(422, 42200, '私聊必须选择一位联系人，多人讨论请选择群聊')
    allowed = await allowed_work_contacts(db, company_id, user.id, body.project_id)
    if not (set(member_ids) - {user.id}) <= allowed:
        return fail(403, 40300, '仅可向工作联系人发起会话，请通过项目频道沟通或由项目经理发起')
    if body.kind == "direct":
        existing_rows = (
            await db.execute(
                select(DirectConversation).where(
                    DirectConversation.company_id == company_id,
                    DirectConversation.project_id == body.project_id,
                    DirectConversation.kind == "direct",
                )
            )
        ).scalars().all()
        for existing in existing_rows:
            existing_members = (
                await db.execute(
                    select(DirectConversationMember.user_id).where(
                        DirectConversationMember.conversation_id == existing.id
                    )
                )
            ).scalars().all()
            if set(existing_members) == set(member_ids):
                return ResponseData(data={"id": existing.id, "member_user_ids": sorted(existing_members), "kind": existing.kind})
    conversation = DirectConversation(
        company_id=company_id,
        project_id=body.project_id,
        kind=body.kind,
        title=(body.title or "").strip() or None,
        created_by=user.id,
    )
    db.add(conversation)
    await db.flush()
    for member_id in member_ids:
        db.add(DirectConversationMember(conversation_id=conversation.id, user_id=member_id))
    await db.commit()
    return ResponseData(data={"id": conversation.id, "member_user_ids": member_ids, "kind": conversation.kind})


@router.post("/conversations/{conversation_id}/files", response_model=ResponseData, status_code=201)
async def upload_conversation_file(
    conversation_id: int,
    db: DbSession,
    user: CurrentUser,
    file: UploadFile = File(...),
):
    """上传私聊文件"""
    try:
        conversation = await _require_direct_member(db, user.id, conversation_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    row = await _store_collab_file(
        db,
        file=file,
        company_id=conversation.company_id,
        owner_user_id=user.id,
        scope_type="conversation",
        scope_id=conversation.id,
    )
    await db.commit()
    await db.refresh(row)
    return ResponseData(data=_collab_file_dto(row))


def _direct_msg_dto(message: DirectMessage, sender: User | None) -> dict:
    return {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "user_id": message.user_id,
        "sender_name": (sender.nickname or sender.username) if sender else f"用户{message.user_id}",
        "sender_avatar": sender.avatar_url if sender else "",
        "body": message.body,
        "message_type": message.message_type,
        "attachments": list(message.attachments_json or []),
        "created_at": message.created_at.isoformat() if message.created_at else None,
    }


async def _create_scope_summary(db, *, user_id: int, company_id: int, project_id: int | None,
                                scope_type: str, scope_id: int, messages: list[dict], user: User | None = None) -> ConversationSummary:
    result = await summarize_lines_with_llm(
        db,
        company_id=company_id,
        user=user,
        lines=[str(item.get("body") or "") for item in messages],
    )
    row = ConversationSummary(
        company_id=company_id,
        project_id=project_id,
        scope_type=scope_type,
        scope_id=scope_id,
        requested_by=user_id,
        source_from_id=messages[0].get("id") if messages else None,
        source_to_id=messages[-1].get("id") if messages else None,
        source_count=result["source_count"],
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
    return row


async def _list_scope_summaries(db, *, company_id: int, scope_type: str, scope_id: int) -> list[dict]:
    rows = (await db.execute(
        select(ConversationSummary)
        .where(
            ConversationSummary.company_id == company_id,
            ConversationSummary.scope_type == scope_type,
            ConversationSummary.scope_id == scope_id,
        )
        .order_by(ConversationSummary.id.desc())
        .limit(20)
    )).scalars().all()
    return [summary_dto(row) for row in rows]


@router.post("/channels/{channel_id}/summaries", response_model=ResponseData)
async def summarize_channel(channel_id: int, db: DbSession, user: CurrentUser):
    """AI 总结频道聊天记录"""
    channel = await db.get(TeamChannel, channel_id)
    if not channel:
        return fail(404, 40400, "channel not found")
    try:
        await _require_channel_scope(db, user.id, channel.company_id, channel.project_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    rows = (await db.execute(
        select(TeamChannelMessage).where(TeamChannelMessage.channel_id == channel_id)
        .order_by(TeamChannelMessage.id.asc()).limit(500)
    )).scalars().all()
    row = await _create_scope_summary(
        db,
        user_id=user.id,
        company_id=channel.company_id,
        project_id=channel.project_id,
        scope_type="channel",
        scope_id=channel.id,
        messages=[{"id": item.id, "body": item.body} for item in rows],
        user=user,
    )
    return ResponseData(data=summary_dto(row))


@router.get("/channels/{channel_id}/summaries", response_model=ResponseData)
async def list_channel_summaries(channel_id: int, db: DbSession, user: CurrentUser):
    """列出频道 AI 总结"""
    channel = await db.get(TeamChannel, channel_id)
    if not channel:
        return fail(404, 40400, "channel not found")
    try:
        await _require_channel_scope(db, user.id, channel.company_id, channel.project_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    return ResponseData(data={"items": await _list_scope_summaries(db, company_id=channel.company_id, scope_type="channel", scope_id=channel.id)})


@router.post("/conversations/{conversation_id}/summaries", response_model=ResponseData)
async def summarize_conversation(conversation_id: int, db: DbSession, user: CurrentUser):
    """AI 总结私聊记录"""
    try:
        conversation = await _require_direct_member(db, user.id, conversation_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    rows = (await db.execute(
        select(DirectMessage).where(DirectMessage.conversation_id == conversation_id)
        .order_by(DirectMessage.id.asc()).limit(500)
    )).scalars().all()
    row = await _create_scope_summary(
        db,
        user_id=user.id,
        company_id=conversation.company_id,
        project_id=conversation.project_id,
        scope_type="conversation",
        scope_id=conversation.id,
        messages=[{"id": item.id, "body": item.body} for item in rows],
        user=user,
    )
    return ResponseData(data=summary_dto(row))


@router.get("/conversations/{conversation_id}/summaries", response_model=ResponseData)
async def list_conversation_summaries(conversation_id: int, db: DbSession, user: CurrentUser):
    """列出私聊 AI 总结"""
    try:
        conversation = await _require_direct_member(db, user.id, conversation_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    return ResponseData(data={"items": await _list_scope_summaries(db, company_id=conversation.company_id, scope_type="conversation", scope_id=conversation.id)})


@router.get("/conversations/{conversation_id}/messages", response_model=ResponseData)
async def list_direct_messages(
    conversation_id: int, db: DbSession, user: CurrentUser, page: int = 1, page_size: int = 50
):
    """列出私聊消息"""
    try:
        await _require_direct_member(db, user.id, conversation_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    page = max(1, page)
    page_size = min(100, max(1, page_size))
    rows = (
        await db.execute(
            select(DirectMessage, User)
            .outerjoin(User, User.id == DirectMessage.user_id)
            .where(DirectMessage.conversation_id == conversation_id)
            .order_by(DirectMessage.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    items = [_direct_msg_dto(message, sender) for message, sender in rows]
    items.reverse()
    return ResponseData(data={"items": items, "page": page, "page_size": page_size})


@router.post("/conversations/{conversation_id}/messages", response_model=ResponseData)
async def post_direct_message(
    conversation_id: int, body: MessageCreate, db: DbSession, user: CurrentUser
):
    """发送私聊消息"""
    try:
        await _require_direct_member(db, user.id, conversation_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    message = DirectMessage(
        conversation_id=conversation_id,
        user_id=user.id,
        body=body.body.strip(),
        message_type=body.message_type if body.message_type in ("user", "system") else "user",
        attachments_json=[dict(item) for item in body.attachments[:20] if isinstance(item, dict)],
    )
    db.add(message)
    await db.flush()
    file_metadata = await _bind_collab_files(
        db,
        file_ids=body.file_ids,
        owner_user_id=user.id,
        scope_type="conversation",
        scope_id=conversation_id,
        message_id=message.id,
    )
    message.attachments_json = [*list(message.attachments_json or []), *file_metadata]
    await db.commit()
    await db.refresh(message)
    return ResponseData(data=_direct_msg_dto(message, user))


@router.get("/channels/{channel_id}/files", response_model=ResponseData)
async def list_channel_files(channel_id: int, db: DbSession, user: CurrentUser):
    """列出频道文件"""
    channel = await db.get(TeamChannel, channel_id)
    if not channel:
        return fail(404, 40400, "channel not found")
    try:
        await _require_channel_scope(db, user.id, channel.company_id, channel.project_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    rows = (
        await db.execute(
            select(TeamChannelMessage)
            .where(TeamChannelMessage.channel_id == channel_id)
            .order_by(TeamChannelMessage.id.desc())
        )
    ).scalars().all()
    binary_rows = (
        await db.execute(
            select(CollabFile)
            .where(CollabFile.scope_type == "channel", CollabFile.scope_id == channel_id)
            .order_by(CollabFile.id.desc())
            .limit(100)
        )
    ).scalars().all()
    files = [_collab_file_dto(row) for row in binary_rows]
    binary_ids = {row.id for row in binary_rows}
    for message in rows:
        for item in list(message.attachments_json or []):
            if isinstance(item, dict):
                if item.get("file_id") in binary_ids:
                    continue
                files.append({**item, "message_id": message.id, "created_at": message.created_at.isoformat() if message.created_at else None})
    return ResponseData(data={"items": files[:100]})


@router.get("/conversations/{conversation_id}/files", response_model=ResponseData)
async def list_conversation_files(conversation_id: int, db: DbSession, user: CurrentUser):
    """列出私聊文件"""
    try:
        await _require_direct_member(db, user.id, conversation_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    rows = (
        await db.execute(
            select(CollabFile)
            .where(CollabFile.scope_type == "conversation", CollabFile.scope_id == conversation_id)
            .order_by(CollabFile.id.desc())
            .limit(100)
        )
    ).scalars().all()
    return ResponseData(data={"items": [_collab_file_dto(row) for row in rows]})


@router.get("/collab/files/{file_id}/download")
async def download_collab_file(file_id: int, db: DbSession, user: CurrentUser):
    """下载协作文件"""
    row = await db.get(CollabFile, file_id)
    if not row:
        return fail(404, 40400, "file not found")
    try:
        if row.scope_type == "channel":
            channel = await db.get(TeamChannel, row.scope_id)
            if not channel or channel.company_id != row.company_id:
                return fail(404, 40400, "channel not found")
            await _require_channel_scope(db, user.id, channel.company_id, channel.project_id)
        elif row.scope_type == "conversation":
            await _require_direct_member(db, user.id, row.scope_id)
        else:
            return fail(404, 40400, "file scope not found")
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    path = _collab_file_path(row.storage_key)
    if not path.exists():
        return fail(404, 40400, "file content not found")
    return FileResponse(path=path, filename=row.original_name, media_type=row.mime_type)


@router.get("/channels/{channel_id}/pinned-links", response_model=ResponseData)
async def list_pinned_links(channel_id: int, db: DbSession, user: CurrentUser):
    """列出频道置顶链接"""
    channel = await db.get(TeamChannel, channel_id)
    if not channel:
        return fail(404, 40400, "channel not found")
    try:
        await _require_channel_scope(db, user.id, channel.company_id, channel.project_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    rows = (
        await db.execute(select(PinnedLink).where(PinnedLink.channel_id == channel_id).order_by(PinnedLink.id.desc()))
    ).scalars().all()
    return ResponseData(data={"items": [{"id": row.id, "title": row.title, "url": row.url, "created_by": row.created_by, "created_at": row.created_at.isoformat() if row.created_at else None} for row in rows]})


@router.post("/channels/{channel_id}/pinned-links", response_model=ResponseData)
async def create_pinned_link(channel_id: int, body: PinnedLinkBody, db: DbSession, user: CurrentUser):
    """新增频道置顶链接"""
    channel = await db.get(TeamChannel, channel_id)
    if not channel:
        return fail(404, 40400, "channel not found")
    try:
        await _require_channel_scope(db, user.id, channel.company_id, channel.project_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    link = PinnedLink(company_id=channel.company_id, project_id=channel.project_id, channel_id=channel_id, title=body.title.strip(), url=body.url.strip(), created_by=user.id)
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return ResponseData(data={"id": link.id, "title": link.title, "url": link.url})


@router.delete("/channels/{channel_id}/pinned-links/{link_id}", response_model=ResponseData)
async def delete_pinned_link(channel_id: int, link_id: int, db: DbSession, user: CurrentUser):
    """删除频道置顶链接"""
    channel = await db.get(TeamChannel, channel_id)
    link = await db.get(PinnedLink, link_id)
    if not channel or not link or link.channel_id != channel_id:
        return fail(404, 40400, "pinned link not found")
    try:
        await _require_channel_scope(db, user.id, channel.company_id, channel.project_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    await db.delete(link)
    await db.commit()
    return ResponseData(data={"id": link_id, "deleted": True})


@router.get("/projects/{project_id}/activity", response_model=ResponseData)
async def project_activity(
    project_id: int,
    db: DbSession,
    user: CurrentUser,
    limit: int = Query(30, ge=1, le=100),
):
    """获取项目动态"""
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "project.read", project_id=p.id):
        return fail(403, 40301, "无权查看项目")
    q = await db.execute(
        select(AuditLog)
        .where(AuditLog.project_id == project_id)
        .order_by(AuditLog.id.desc())
        .limit(limit)
    )
    logs = q.scalars().all()
    items = []
    for a in logs:
        detail = a.detail_json or {}
        title = detail.get("title") or a.action
        items.append(
            {
                "id": a.id,
                "type": a.action,
                "title": title,
                "resource_type": a.resource_type,
                "resource_id": a.resource_id,
                "actor_user_id": a.actor_user_id,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "detail": detail,
            }
        )
    # 若审计为空，用最近证据补一刀
    if not items:
        eq = await db.execute(
            select(EvidencePackage)
            .where(EvidencePackage.project_id == project_id)
            .order_by(EvidencePackage.id.desc())
            .limit(limit)
        )
        for pkg in eq.scalars().all():
            items.append(
                {
                    "id": f"ev-{pkg.id}",
                    "type": "evidence.submitted",
                    "title": (pkg.summary_text or "证据提交")[:80],
                    "resource_type": "evidence",
                    "resource_id": str(pkg.id),
                    "actor_user_id": pkg.submitter_user_id,
                    "created_at": pkg.submitted_at.isoformat()
                    if pkg.submitted_at
                    else None,
                    "detail": {},
                }
            )
    return ResponseData(data={"items": items})


@router.get("/users/me/activity", response_model=ResponseData)
async def user_activity(
    db: DbSession,
    user: CurrentUser,
    limit: int = Query(50, ge=1, le=200),
):
    """汇总我在各项目的近期动态

    Aggregate recent activity across every project visible to the user."""
    from app.models.project import ProjectMember

    project_ids = (
        await db.execute(
            select(Project.id)
            .outerjoin(ProjectMember, ProjectMember.project_id == Project.id)
            .where(
                (Project.created_by == user.id)
                | ((ProjectMember.user_id == user.id) & ProjectMember.left_at.is_(None))
            )
            .distinct()
        )
    ).scalars().all()
    if not project_ids:
        return ResponseData(data={"items": []})
    rows = (
        await db.execute(
            select(AuditLog, Project)
            .join(Project, Project.id == AuditLog.project_id)
            .where(AuditLog.project_id.in_(project_ids))
            .order_by(AuditLog.id.desc())
            .limit(limit)
        )
    ).all()
    items = []
    for audit, project in rows:
        detail = audit.detail_json or {}
        items.append(
            {
                "id": audit.id,
                "project_id": project.id,
                "project_name": project.name,
                "type": audit.action,
                "title": detail.get("title") or audit.action,
                "resource_type": audit.resource_type,
                "resource_id": audit.resource_id,
                "actor_user_id": audit.actor_user_id,
                "created_at": audit.created_at.isoformat() if audit.created_at else None,
                "detail": detail,
            }
        )
    return ResponseData(data={"items": items})


@router.get("/users/me/people-axis", response_model=ResponseData)
async def aggregate_people_axis(
    db: DbSession,
    user: CurrentUser,
    limit_projects: int = Query(100, ge=1, le=200),
):
    """跨项目只读人轴总览

    Read-only cross-project people-axis overview for dashboard views."""
    from app.models.project import ProjectMember

    projects = (
        await db.execute(
            select(Project)
            .outerjoin(ProjectMember, ProjectMember.project_id == Project.id)
            .where(
                (Project.created_by == user.id)
                | ((ProjectMember.user_id == user.id) & ProjectMember.left_at.is_(None))
            )
            .distinct()
            .order_by(Project.id)
            .limit(limit_projects)
        )
    ).scalars().all()
    output = []
    for project in projects:
        if not await acl.can(db, user.id, project.company_id, "progress.read", project_id=project.id):
            continue
        membership = (await db.execute(select(ProjectMember).where(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == user.id,
            ProjectMember.left_at.is_(None),
        ))).scalar_one_or_none()
        rows = (
            await db.execute(
                select(TreeNode).where(
                    TreeNode.project_id == project.id,
                    TreeNode.is_deleted.is_(False),
                ).order_by(TreeNode.sort_order, TreeNode.id)
            )
        ).scalars().all()
        nodes = []
        for node in rows:
            key, template = await tsvc.get_type_key(db, node)
            nodes.append({
                "id": node.id,
                "parent_id": node.parent_id,
                "node_type_key": key,
                "behavior_template": template,
                "title": node.title,
                "description": node.description,
                "node_origin": node.node_origin,
                "responsibility_permissions": node.responsibility_permissions or {},
                "sort_order": node.sort_order,
                "depth": node.depth,
                "progress_json": node.progress_json,
                "ui_offset": (node.progress_json or {}).get("ui_offset") if isinstance(node.progress_json, dict) else None,
                "ui_offsets": (node.progress_json or {}).get("ui_offsets") or {} if isinstance(node.progress_json, dict) else {},
                "assignees": await tsvc.list_assignees(db, node.id),
            })
        output.append({
            "project_id": project.id, "project_name": project.name,
            "company_id": project.company_id, "nodes": nodes,
            "pm_user_id": project.pm_user_id,
            "final_owner_user_id": project.pm_user_id,
            "my_role": "pm" if project.pm_user_id == user.id or (membership and membership.role == "pm") else "member",
            "my_owned_node_ids": [node["id"] for node in nodes if any(
                assignment.get("user_id") == user.id and assignment.get("role_key") in ("primary", "collaborator")
                for assignment in node["assignees"]
            )],
        })
    return ResponseData(data={"projects": output})


@router.post("/projects/{project_id}/axis-audit", response_model=ResponseData)
async def axis_audit(project_id: int, db: DbSession, user: CurrentUser):
    """人轴风险审计：基于进度/证据的启发式（不依赖前端 Gemini）。"""
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "project.read", project_id=p.id):
        return fail(403, 40301, "无权查看项目")

    nodes = (
        await db.execute(
            select(TreeNode).where(
                TreeNode.project_id == project_id, TreeNode.is_deleted.is_(False)
            )
        )
    ).scalars().all()
    type_keys = {}
    people = []
    for n in nodes:
        key, _ = await tsvc.get_type_key(db, n)
        type_keys[n.id] = key
        if key == "person":
            people.append(n)

    node_audits = []
    for person in people:
        children = [n for n in nodes if n.parent_id == person.id]
        matters = [c for c in children if type_keys.get(c.id) != "person"]
        blocked = 0
        stale = 0
        done = 0
        for m in matters:
            pj = m.progress_json or {}
            st = pj.get("status")
            pct = float(pj.get("percent") or 0)
            if st in ("blocked", "at_risk") or pct < 0:
                blocked += 1
            if st in ("done", "completed", "reached") or pct >= 100:
                done += 1
            # 无进展且无证据 → stale
            ev_cnt = (
                await db.execute(
                    select(func.count())
                    .select_from(EvidencePackage)
                    .where(EvidencePackage.node_id == m.id)
                )
            ).scalar() or 0
            if pct < 10 and int(ev_cnt) == 0 and matters:
                stale += 1
        risk = "low"
        if blocked >= 2 or stale >= 3:
            risk = "high"
        elif blocked >= 1 or stale >= 1:
            risk = "medium"
        suggested = []
        if blocked:
            suggested.append("跟进被阻塞事项并补充证据")
        if stale:
            suggested.append("推动无进展事项提交首份证据")
        if not matters:
            suggested.append("为人节点挂载范围/工作项")
        if not suggested:
            suggested.append("保持节奏，按期复核终责链路")
        node_audits.append(
            {
                "node_id": person.id,
                "title": person.title,
                "risk_level": risk,
                "summary": f"事项 {len(matters)}，完成 {done}，阻塞 {blocked}，停滞 {stale}",
                "suggested_actions": suggested,
            }
        )

    overall = "low"
    if any(a["risk_level"] == "high" for a in node_audits):
        overall = "high"
    elif any(a["risk_level"] == "medium" for a in node_audits):
        overall = "medium"

    return ResponseData(
        data={
            "project_id": project_id,
            "overall_risk": overall,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "nodes": node_audits,
        }
    )


@router.put("/nodes/{node_id}/layout", response_model=ResponseData)
async def put_node_layout(
    node_id: int, body: LayoutBody, db: DbSession, user: CurrentUser
):
    """保存节点在画布上的位置"""
    node = await db.get(TreeNode, node_id)
    if not node or node.is_deleted:
        return fail(404, 40400, "节点不存在")
    if not await acl.can(
        db, user.id, node.company_id, "tree.edit_any", project_id=node.project_id
    ):
        # 允许成员编辑自己指派节点的布局
        if not await acl.can(
            db,
            user.id,
            node.company_id,
            "tree.edit_subtree",
            project_id=node.project_id,
            node_id=node.id,
        ):
            return fail(403, 40300, "无权编辑布局")
    pj = dict(node.progress_json or {})
    offset = {"x": float(body.offset_x), "y": float(body.offset_y)}
    if body.orientation is not None:
        offsets = dict(pj.get("ui_offsets") or {})
        offsets[body.orientation] = offset
        pj["ui_offsets"] = offsets
    else:
        pj["ui_offset"] = offset
    node.progress_json = pj
    flag_modified(node, "progress_json")
    await db.commit()
    return ResponseData(
        data={
            "id": node.id,
            "ui_offset": pj.get("ui_offset"),
            "ui_offsets": pj.get("ui_offsets") or {},
        }
    )


@router.get("/tasks/stats/trend", response_model=ResponseData)
async def task_stats_trend(
    db: DbSession,
    user: CurrentUser,
    period: str = "week",
    project_id: int | None = Query(None, gt=0),
    timezone_offset: int = Query(0, ge=-720, le=840),
):
    """获取任务统计趋势"""
    start, now, local_start, local_today = statistics_window(period, timezone_offset)
    days = (local_today - local_start).days + 1
    q = await db.execute(statistics_query(user.id, project_id).where(or_(
        Task.created_at.between(start, now), Task.completed_at.between(start, now))))
    tasks = q.scalars().all()
    buckets: dict[str, dict] = {}
    for i in range(days):
        d = (local_start + timedelta(days=i)).strftime("%Y-%m-%d")
        buckets[d] = {"date": d, "created": 0, "completed": 0}
    for t in tasks:
        if t.created_at:
            key = (t.created_at + timedelta(minutes=timezone_offset)).strftime("%Y-%m-%d")
            if key in buckets:
                buckets[key]["created"] += 1
        if t.completed_at and t.status == Task.STATUS_DONE:
            key = (t.completed_at + timedelta(minutes=timezone_offset)).strftime("%Y-%m-%d")
            if key in buckets:
                buckets[key]["completed"] += 1
    series = list(buckets.values())
    return ResponseData(data={"period": period, "series": series})


@router.put("/users/me/ui-prefs", response_model=ResponseData)
async def put_ui_prefs(body: UiPrefsBody, db: DbSession, user: CurrentUser):
    """保存界面偏好"""
    pref = dict(user.notify_pref or {})
    ui = dict(pref.get("ui") or {})
    data = body.model_dump(exclude_unset=True)
    if data.get("task_default_priority") is not None and data["task_default_priority"] not in (0, 1, 2):
        return fail(422, 42200, "task_default_priority must be 0, 1, or 2")
    if data.get("task_default_category_id") is not None:
        category_exists = await db.scalar(
            select(func.count()).select_from(Category).where(
                Category.id == data["task_default_category_id"],
                Category.user_id == user.id,
            )
        )
        if not category_exists:
            return fail(404, 40400, "default category not found")
    ui.update({k: v for k, v in data.items() if v is not None})
    pref["ui"] = ui
    user.notify_pref = pref
    flag_modified(user, "notify_pref")
    await db.commit()
    return ResponseData(data={"ui": ui})


@router.get("/users/me/ui-prefs", response_model=ResponseData)
async def get_ui_prefs(db: DbSession, user: CurrentUser):
    """获取界面偏好"""
    pref = user.notify_pref or {}
    return ResponseData(data={"ui": pref.get("ui") or {}})


@router.put("/users/me/presence", response_model=ResponseData)
async def put_presence(body: PresenceBody, db: DbSession, user: CurrentUser):
    """上报在线状态"""
    status = body.status if body.status in ("online", "busy", "offline") else "online"
    row = await db.get(UserPresence, user.id)
    if not row:
        row = UserPresence(user_id=user.id, status=status)
        db.add(row)
    else:
        row.status = status
        row.last_seen_at = datetime.now(timezone.utc)
    await db.commit()
    return ResponseData(data={"user_id": user.id, "status": status})


@router.get("/companies/{company_id}/presence", response_model=ResponseData)
async def list_presence(company_id: int, db: DbSession, user: CurrentUser):
    """列出企业成员在线状态"""
    try:
        await _require_company_member(db, user.id, company_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    # 公司成员
    mq = await db.execute(
        select(CompanyMembership.user_id).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.status == "active",
        )
    )
    user_ids = [r[0] for r in mq.all()]
    if not user_ids:
        return ResponseData(data={"items": []})
    pq = await db.execute(select(UserPresence).where(UserPresence.user_id.in_(user_ids)))
    by_id = {p.user_id: p for p in pq.scalars().all()}
    now = datetime.now(timezone.utc)
    items = []
    for uid in user_ids:
        p = by_id.get(uid)
        st = "offline"
        if p:
            st = p.status
            if p.last_seen_at:
                seen = p.last_seen_at
                if seen.tzinfo is None:
                    seen = seen.replace(tzinfo=timezone.utc)
                if (now - seen).total_seconds() > 300 and st == "online":
                    st = "offline"
        items.append({"user_id": uid, "status": st})
    return ResponseData(data={"items": items})
