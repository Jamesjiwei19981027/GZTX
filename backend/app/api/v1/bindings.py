"""公司/用户 ASR · Storage · Model 绑定 API"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps_collab import (
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

router = APIRouter(tags=["bindings"])


class BindingBody(BaseModel):
    provider_id: str = Field(..., min_length=1, max_length=64)
    config_json: dict | None = None


class UserAsrBody(BaseModel):
    provider_id: str = Field(..., min_length=1, max_length=64)
    company_id: int


class CollabReplyBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)


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
        "config_json": b.config_json,
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

    binding = AsrBinding(
        company_id=company.id,
        user_id=None,
        provider_id=body.provider_id,
        config_json=body.config_json,
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
):
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
    if not mq.scalar_one_or_none():
        raise CollabError(403, 40302, "非本公司成员")

    data = await file.read()
    engine = await AsrRouter().resolve(db, company, user_id=user.id)
    text = await engine.transcribe(
        data, file.content_type or "audio/wav", language="zh"
    )
    return ResponseData(
        data={"text": text, "provider_id": getattr(engine, "provider_id", "builtin")}
    )


@router.get("/notifications/collab", response_model=ResponseData)
async def list_collab_notifications(
    db: DbSession,
    user: CurrentUser,
    page: int = 1,
    page_size: int = 20,
):
    from sqlalchemy import func
    from app.models.notify import CollabInboxMessage

    page = max(1, page)
    page_size = min(100, max(1, page_size))
    total_q = await db.execute(
        select(func.count())
        .select_from(CollabInboxMessage)
        .where(CollabInboxMessage.user_id == user.id)
    )
    total = int(total_q.scalar() or 0)
    q = await db.execute(
        select(CollabInboxMessage, User)
        .outerjoin(User, User.id == CollabInboxMessage.sender_user_id)
        .where(CollabInboxMessage.user_id == user.id)
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
    from app.models.notify import CollabInboxMessage

    m = await db.get(CollabInboxMessage, message_id)
    if not m or m.user_id != user.id:
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
    from app.models.notify import CollabInboxMessage

    q = await db.execute(
        select(CollabInboxMessage).where(
            CollabInboxMessage.user_id == user.id,
            CollabInboxMessage.is_read.is_(False),
        )
    )
    rows = q.scalars().all()
    for m in rows:
        m.is_read = True
    await db.commit()
    return ResponseData(data={"updated": len(rows)})


@router.post("/notifications/collab/{message_id}/reply", response_model=ResponseData)
async def reply_collab_notification(
    message_id: int,
    body: CollabReplyBody,
    db: DbSession,
    user: CurrentUser,
):
    from app.models.notify import CollabInboxMessage

    message = await db.get(CollabInboxMessage, message_id)
    if not message or message.user_id != user.id:
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
