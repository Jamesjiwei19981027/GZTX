"""公司/用户 ASR · Storage · Model 绑定 API"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps_collab import (
    assert_company_write,
    get_company,
    require_company_member,
    require_super_admin,
)
from app.core.collab_errors import CollabError
from app.core.dependencies import CurrentUser, DbSession
from app.models.bindings import AsrBinding, ModelBinding, StorageBinding
from app.models.company import Company
from app.models.user import User
from app.schemas.common import ResponseData
from app.services.asr.router import AsrRouter
from app.services.policy_guard import PolicyGuard

router = APIRouter(tags=["能力绑定与协作通知"])


class BindingBody(BaseModel):
    provider_id: str = Field(..., min_length=1, max_length=64)
    config_json: dict | None = None


class UserAsrBody(BaseModel):
    provider_id: str = Field(..., min_length=1, max_length=64)
    company_id: int


class CollabReplyBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)


class CollabStateBody(BaseModel):
    read: bool | None = None
    archived: bool | None = None


def _summary_storage(b: StorageBinding | None) -> dict:
    if not b:
        return {"provider_id": "local", "is_default": True, "config_json": None}
    return {
        "provider_id": b.provider_id,
        "is_default": bool(b.is_default),
        "config_json": b.config_json,
    }


def _summary_asr(b: AsrBinding | None) -> dict:
    if not b:
        return {"provider_id": "builtin", "is_default": True, "config_json": None}
    return {
        "provider_id": b.provider_id,
        "is_default": bool(b.is_default),
        "user_id": b.user_id,
        "config_json": {key:value for key,value in (b.config_json or {}).items() if key not in ('api_key', 'api_key_encrypted')},
        "has_api_key": bool((b.config_json or {}).get('api_key') or (b.config_json or {}).get('api_key_encrypted')),
    }


def _summary_model(b: ModelBinding | None) -> dict:
    if not b:
        return {"provider_id": "fake", "is_default": True, "config_json": None}
    return {
        "provider_id": b.provider_id,
        "is_default": bool(b.is_default),
        "config_json": b.config_json,
    }


@router.get("/companies/{company_id}/bindings", response_model=ResponseData)
async def get_bindings(
    db: DbSession,
    user: CurrentUser,
    company: Company = Depends(get_company),
    _m=Depends(require_company_member),
):
    """查看企业能力绑定"""
    sq = await db.execute(
        select(StorageBinding)
        .where(StorageBinding.company_id == company.id, StorageBinding.is_default.is_(True))
        .limit(1)
    )
    aq = await db.execute(
        select(AsrBinding)
        .where(
            AsrBinding.company_id == company.id,
            AsrBinding.user_id.is_(None),
            AsrBinding.is_default.is_(True),
        )
        .limit(1)
    )
    mq = await db.execute(
        select(ModelBinding)
        .where(
            ModelBinding.company_id == company.id,
            ModelBinding.user_id.is_(None),
            ModelBinding.is_default.is_(True),
        )
        .limit(1)
    )
    return ResponseData(
        data={
            "storage": _summary_storage(sq.scalar_one_or_none()),
            "asr": _summary_asr(aq.scalar_one_or_none()),
            "model": _summary_model(mq.scalar_one_or_none()),
        }
    )


@router.put("/companies/{company_id}/bindings/storage", response_model=ResponseData)
async def put_storage_binding(
    body: BindingBody,
    db: DbSession,
    user: CurrentUser,
    company: Company = Depends(get_company),
    _admin=Depends(require_super_admin),
):
    """设置企业存储绑定"""
    guard = PolicyGuard()
    if body.provider_id in ("s3", "cloud") or str(body.provider_id).startswith("s3"):
        if not guard.allow_file_egress(company):
            raise CollabError(403, 40300, "隔离策略禁止外部对象存储")

    q = await db.execute(
        select(StorageBinding).where(StorageBinding.company_id == company.id)
    )
    existing = list(q.scalars().all())
    for row in existing:
        row.is_default = False

    binding = StorageBinding(
        company_id=company.id,
        provider_id=body.provider_id,
        config_json=body.config_json,
        is_default=True,
    )
    db.add(binding)
    await db.flush()
    return ResponseData(data=_summary_storage(binding))


@router.put("/companies/{company_id}/bindings/asr", response_model=ResponseData)
async def put_company_asr(
    body: BindingBody,
    db: DbSession,
    user: CurrentUser,
    company: Company = Depends(get_company),
    _admin=Depends(require_super_admin),
):
    """设置企业语音识别绑定"""
    guard = PolicyGuard()
    if not guard.allow_asr(company, body.provider_id):
        # company default may set allowed list; for empty allowlist + standard preset merged via policy
        # still reject clearly disallowed
        pol = guard.policy(company)
        allowed = pol.get("allowed_asr_ids") or []
        if allowed and body.provider_id not in allowed and not any(
            a.endswith(":*") and body.provider_id.startswith(a[:-1]) for a in allowed
        ):
            if body.provider_id != "builtin":
                raise CollabError(403, 40300, f"ASR 不在白名单: {body.provider_id}")

    q = await db.execute(
        select(AsrBinding).where(
            AsrBinding.company_id == company.id,
            AsrBinding.user_id.is_(None),
        )
    )
    for row in q.scalars().all():
        row.is_default = False

    config = dict(body.config_json or {})
    # Secrets are accepted only on administrator writes and never returned.
    config.pop('api_key_encrypted', None)
    key = str(config.pop('api_key', '') or '').strip()
    if key:
        from app.services.secret_box import encrypt_str
        config['api_key_encrypted'] = encrypt_str(key)
    else:
        previous = (await db.execute(select(AsrBinding).where(AsrBinding.company_id == company.id,
            AsrBinding.user_id.is_(None), AsrBinding.provider_id == body.provider_id).order_by(AsrBinding.id.desc()).limit(1))).scalar_one_or_none()
        if previous and (previous.config_json or {}).get('api_key_encrypted'):
            config['api_key_encrypted'] = previous.config_json['api_key_encrypted']
    if body.provider_id != 'builtin' and config.get('base_url'):
        from app.services.asr.openai_compatible import OpenAICompatibleAsr
        try:
            OpenAICompatibleAsr(body.provider_id, config)
        except ValueError:
            raise CollabError(422, 42200, 'ASR 服务地址无效')
    binding = AsrBinding(
        company_id=company.id,
        user_id=None,
        provider_id=body.provider_id,
        config_json=config or None,
        is_default=True,
    )
    db.add(binding)
    await db.flush()
    return ResponseData(data=_summary_asr(binding))


@router.put("/companies/{company_id}/bindings/models", response_model=ResponseData)
async def put_company_model(
    body: BindingBody,
    db: DbSession,
    user: CurrentUser,
    company: Company = Depends(get_company),
    _admin=Depends(require_super_admin),
):
    """设置企业模型绑定"""
    guard = PolicyGuard()
    if not guard.allow_model(company, body.provider_id):
        raise CollabError(403, 40300, f"模型不在白名单: {body.provider_id}")

    q = await db.execute(
        select(ModelBinding).where(
            ModelBinding.company_id == company.id,
            ModelBinding.user_id.is_(None),
        )
    )
    for row in q.scalars().all():
        row.is_default = False

    binding = ModelBinding(
        company_id=company.id,
        user_id=None,
        provider_id=body.provider_id,
        config_json=body.config_json,
        is_default=True,
    )
    db.add(binding)
    await db.flush()
    return ResponseData(data=_summary_model(binding))


@router.put("/users/me/bindings/asr", response_model=ResponseData)
async def put_user_asr(body: UserAsrBody, db: DbSession, user: CurrentUser):
    """设置个人语音识别绑定"""
    company = await db.get(Company, body.company_id)
    if not company:
        raise CollabError(404, 40400, "公司不存在")
    # must be member
    from app.models.company import CompanyMembership

    mq = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
    )
    if not mq.scalar_one_or_none():
        raise CollabError(403, 40302, "非本公司成员")

    guard = PolicyGuard()
    if not guard.allow_asr(company, body.provider_id):
        raise CollabError(403, 40300, f"ASR 不在白名单: {body.provider_id}")

    q = await db.execute(
        select(AsrBinding).where(
            AsrBinding.company_id == company.id,
            AsrBinding.user_id == user.id,
        )
    )
    old = q.scalar_one_or_none()
    if old:
        old.provider_id = body.provider_id
        old.is_default = False
        await db.flush()
        return ResponseData(data=_summary_asr(old))

    binding = AsrBinding(
        company_id=company.id,
        user_id=user.id,
        provider_id=body.provider_id,
        config_json=None,
        is_default=False,
    )
    db.add(binding)
    await db.flush()
    return ResponseData(data=_summary_asr(binding))


@router.post("/asr/transcribe", response_model=ResponseData)
async def asr_transcribe(
    db: DbSession,
    user: CurrentUser,
    company_id: int = Form(...),
    file: UploadFile = File(...),
    project_id: int | None = Form(None),
):
    """语音转文字"""
    company = await db.get(Company, company_id)
    if not company:
        raise CollabError(404, 40400, "公司不存在")
    from app.models.company import CompanyMembership

    mq = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
    )
    membership = mq.scalar_one_or_none()
    if not membership or membership.employment_status != 'active':
        raise CollabError(403, 40302, "非本公司成员")

    await assert_company_write(db, company.id, feature='asr')
    if project_id is not None:
        from app.models.project import Project
        from app.services.acl import AclService
        project = await db.get(Project, project_id)
        if not project or project.company_id != company.id:
            raise CollabError(404, 40400, '项目不存在')
        if not await AclService().can(db, user.id, company.id, 'evidence.submit', project_id=project_id):
            raise CollabError(403, 40300, '无权在此项目录入材料')
    mime = (file.content_type or '').split(';')[0].lower()
    if mime == 'application/octet-stream':
        extension = (file.filename or '').rsplit('.', 1)[-1].lower()
        mime = {'mp3':'audio/mpeg','m4a':'audio/mp4','mp4':'audio/mp4','webm':'audio/webm','ogg':'audio/ogg','wav':'audio/wav','aac':'audio/aac','flac':'audio/flac'}.get(extension, mime)
    if not (mime.startswith('audio/') or mime in ('video/webm', 'video/mp4')):
        raise CollabError(422, 42200, '请选择有效音频文件')
    data = await file.read(20 * 1024 * 1024 + 1)
    if not data:
        raise CollabError(422, 42200, '录音为空，请重新录音')
    if len(data) > 20 * 1024 * 1024:
        raise CollabError(413, 41300, '录音超过 20 MB，请分段输入')
    try:
        engine = await AsrRouter().resolve(db, company, user_id=user.id)
    except PermissionError:
        raise CollabError(403, 40300, '当前公司未允许此语音服务')
    except ValueError:
        raise CollabError(503, 50300, '语音服务配置无效，请联系管理员检查 ASR 配置')
    if getattr(engine, 'provider_id', 'builtin') == 'builtin':
        raise CollabError(503, 50300, '语音转写服务尚未配置，请联系管理员配置 ASR，或直接输入文字')
    try:
        text = str(await engine.transcribe(data, mime, language='zh')).strip()
    except Exception:
        raise CollabError(502, 50200, '语音识别服务暂不可用，请重试或直接输入文字')
    if text.startswith('[builtin-asr]'):
        raise CollabError(503, 50300, '语音转写服务尚未配置，请联系管理员配置 ASR，或直接输入文字')
    if not text:
        raise CollabError(422, 42200, '未识别到有效语音，请重新录音')
    return ResponseData(
        data={"text": text, "provider_id": getattr(engine, "provider_id", "builtin")}
    )


@router.get("/notifications/collab", response_model=ResponseData)
async def list_collab_notifications(
    db: DbSession,
    user: CurrentUser,
    page: int = 1,
    page_size: int = 20,
    state: str = Query("active", pattern="^(active|archived|all)$"),
):
    """列出协作通知"""
    from sqlalchemy import func
    from app.models.notify import CollabInboxMessage

    page = max(1, page)
    page_size = min(100, max(1, page_size))
    filters = [CollabInboxMessage.user_id == user.id, CollabInboxMessage.deleted_at.is_(None)]
    if state == "active":
        filters.append(CollabInboxMessage.archived_at.is_(None))
    elif state == "archived":
        filters.append(CollabInboxMessage.archived_at.is_not(None))
    total_q = await db.execute(select(func.count()).select_from(CollabInboxMessage).where(*filters))
    total = int(total_q.scalar() or 0)
    q = await db.execute(
        select(CollabInboxMessage, User)
        .outerjoin(User, User.id == CollabInboxMessage.sender_user_id)
        .where(*filters)
        .order_by(CollabInboxMessage.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = []
    for m, sender in q.all():
        items.append(
            {
                "id": m.id,
                "template_key": m.template_key,
                "payload": m.payload_json,
                "body_text": m.body_text,
                "read": m.is_read,
                "sender": {
                    "user_id": sender.id,
                    "name": sender.nickname or sender.username,
                    "avatar_url": sender.avatar_url or "",
                }
                if sender
                else None,
                "recipient_user_ids": list(m.recipient_user_ids or []),
                "attachments": list(m.attachments_json or []),
                "requires_reply": bool(m.requires_reply),
                "reply_text": m.reply_text,
                "replied_at": m.replied_at.isoformat() if m.replied_at else None,
                "archived": m.archived_at is not None,
                "archived_at": m.archived_at.isoformat() if m.archived_at else None,
                "deleted": m.deleted_at is not None,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
        )
    return ResponseData(
        data={
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@router.put("/notifications/collab/{message_id}/read", response_model=ResponseData)
async def mark_collab_notification_read(
    message_id: int,
    db: DbSession,
    user: CurrentUser,
):
    """标记协作通知已读"""
    from app.models.notify import CollabInboxMessage

    m = await db.get(CollabInboxMessage, message_id)
    if not m or m.user_id != user.id or m.deleted_at is not None:
        from app.core.collab_errors import fail

        return fail(404, 40400, "通知不存在")
    m.is_read = True
    await db.commit()
    return ResponseData(data={"id": m.id, "read": True})


@router.put("/notifications/collab/read-all", response_model=ResponseData)
async def mark_all_collab_notifications_read(
    db: DbSession,
    user: CurrentUser,
):
    """全部协作通知标记已读"""
    from app.models.notify import CollabInboxMessage

    q = await db.execute(
        select(CollabInboxMessage).where(
            CollabInboxMessage.user_id == user.id,
            CollabInboxMessage.is_read.is_(False),
            CollabInboxMessage.deleted_at.is_(None),
        )
    )
    rows = q.scalars().all()
    for m in rows:
        m.is_read = True
    await db.commit()
    return ResponseData(data={"updated": len(rows)})


@router.put("/notifications/collab/{message_id}/state", response_model=ResponseData)
async def update_collab_notification_state(
    message_id: int,
    body: CollabStateBody,
    db: DbSession,
    user: CurrentUser,
):
    """修改协作通知状态"""
    from app.models.notify import CollabInboxMessage
    message = await db.get(CollabInboxMessage, message_id)
    if not message or message.user_id != user.id or message.deleted_at is not None:
        from app.core.collab_errors import fail
        return fail(404, 40400, "通知不存在")
    if body.read is not None:
        message.is_read = body.read
    if body.archived is not None:
        message.archived_at = datetime.now(timezone.utc) if body.archived else None
    await db.commit()
    return ResponseData(data={
        "id": message.id,
        "read": bool(message.is_read),
        "archived": message.archived_at is not None,
        "archived_at": message.archived_at.isoformat() if message.archived_at else None,
    })


@router.delete("/notifications/collab/{message_id}", response_model=ResponseData)
async def delete_collab_notification(
    message_id: int,
    db: DbSession,
    user: CurrentUser,
):
    """删除协作通知"""
    from app.models.notify import CollabInboxMessage
    message = await db.get(CollabInboxMessage, message_id)
    if not message or message.user_id != user.id or message.deleted_at is not None:
        from app.core.collab_errors import fail
        return fail(404, 40400, "通知不存在")
    message.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return ResponseData(data={"id": message.id, "deleted": True})


@router.post("/notifications/collab/{message_id}/reply", response_model=ResponseData)
async def reply_collab_notification(
    message_id: int,
    body: CollabReplyBody,
    db: DbSession,
    user: CurrentUser,
):
    """回复协作通知"""
    from app.models.notify import CollabInboxMessage

    message = await db.get(CollabInboxMessage, message_id)
    if not message or message.user_id != user.id or message.deleted_at is not None:
        from app.core.collab_errors import fail

        return fail(404, 40400, "通知不存在")
    message.reply_text = body.text.strip()
    message.replied_at = datetime.now(timezone.utc)
    message.is_read = True
    await db.commit()
    return ResponseData(
        data={
            "id": message.id,
            "reply_text": message.reply_text,
            "replied_at": message.replied_at.isoformat(),
        }
    )
