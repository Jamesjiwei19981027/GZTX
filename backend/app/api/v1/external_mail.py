"""Explicit external IMAP mail adapter; never mixes records into collab inbox."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.config import settings
from app.core.dependencies import CurrentUser, DbSession
from app.models.company import CompanyMembership
from app.models.external_mail import ExternalMail
from app.schemas.common import ResponseData

router = APIRouter(prefix="/external-mail", tags=["external-mail"])


class ExternalMailStateBody(BaseModel):
    state: str = Field(..., pattern="^(active|archived|deleted)$")


async def _require_company_member(db, company_id: int, user_id: int) -> None:
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


def _configured() -> bool:
    return bool(settings.IMAP_HOST and settings.IMAP_USER and settings.IMAP_PASSWORD)


def _mail_dto(mail: ExternalMail, *, include_body: bool = True) -> dict:
    data = {
        "id": mail.id,
        "company_id": mail.company_id,
        "provider": mail.provider,
        "external_id": mail.external_id,
        "from_address": mail.from_address,
        "to_addresses": list(mail.to_addresses or []),
        "subject": mail.subject,
        "headers": dict(mail.headers_json or {}),
        "state": mail.state,
        "received_at": mail.received_at.isoformat() if mail.received_at else None,
        "synced_at": mail.synced_at.isoformat() if mail.synced_at else None,
        "created_at": mail.created_at.isoformat() if mail.created_at else None,
    }
    if include_body:
        data["body_text"] = mail.body_text[:20000]
    return data


@router.get("/status", response_model=ResponseData)
async def external_mail_status(db: DbSession, user: CurrentUser, company_id: int = Query(...)):
    await _require_company_member(db, company_id, user.id)
    return ResponseData(
        data={
            "provider": "imap",
            "configured": _configured(),
            "host": settings.IMAP_HOST or None,
            "username": settings.IMAP_USER or None,
            "reason": None if _configured() else "IMAP credentials are not configured",
        }
    )


@router.post("/sync", response_model=ResponseData)
async def sync_external_mail(
    db: DbSession,
    user: CurrentUser,
    company_id: int = Query(...),
    limit: int = Query(20, ge=1, le=100),
):
    await _require_company_member(db, company_id, user.id)
    if not _configured():
        raise HTTPException(status_code=503, detail="IMAP credentials are not configured")
    from app.services.email_receiver import EmailReceiver

    receiver = EmailReceiver()
    messages = await asyncio.to_thread(receiver.fetch_new_emails)
    synced = 0
    skipped = 0
    for item in messages[:limit]:
        external_id = str(item.get("message_id") or "").strip()
        if not external_id:
            skipped += 1
            continue
        existing = await db.scalar(
            select(ExternalMail).where(
                ExternalMail.company_id == company_id,
                ExternalMail.provider == "imap",
                ExternalMail.external_id == external_id,
            )
        )
        if existing:
            skipped += 1
            continue
        to_raw = str(item.get("to") or "")
        to_addresses = [part.strip() for part in to_raw.replace(";", ",").split(",") if part.strip()]
        subject = str(item.get("subject") or "")[:500]
        from_address = str(item.get("from") or "")[:500]
        body = str(item.get("body") or "")[:20000]
        db.add(
            ExternalMail(
                company_id=company_id,
                synced_by_user_id=user.id,
                provider="imap",
                external_id=external_id,
                from_address=from_address,
                to_addresses=to_addresses,
                subject=subject,
                headers_json={
                    "message_id": external_id,
                    "from": from_address,
                    "to": to_addresses,
                    "subject": subject,
                },
                body_text=body,
                state="active",
                synced_at=datetime.now(timezone.utc),
            )
        )
        synced += 1
    await db.flush()
    return ResponseData(data={"provider": "imap", "synced": synced, "skipped": skipped})


@router.get("", response_model=ResponseData)
async def list_external_mail(
    db: DbSession,
    user: CurrentUser,
    company_id: int = Query(...),
    state: str = Query("active", pattern="^(active|archived|deleted|all)$"),
    limit: int = Query(50, ge=1, le=100),
):
    await _require_company_member(db, company_id, user.id)
    query = select(ExternalMail).where(ExternalMail.company_id == company_id)
    if state != "all":
        query = query.where(ExternalMail.state == state)
    rows = (await db.execute(query.order_by(ExternalMail.id.desc()).limit(limit))).scalars().all()
    return ResponseData(data={"items": [_mail_dto(row, include_body=False) for row in rows], "total": len(rows)})


@router.get("/{mail_id}", response_model=ResponseData)
async def get_external_mail(mail_id: int, db: DbSession, user: CurrentUser):
    mail = await db.get(ExternalMail, mail_id)
    if not mail:
        raise HTTPException(status_code=404, detail="external mail not found")
    await _require_company_member(db, mail.company_id, user.id)
    return ResponseData(data=_mail_dto(mail, include_body=True))


@router.put("/{mail_id}/state", response_model=ResponseData)
async def update_external_mail_state(mail_id: int, body: ExternalMailStateBody, db: DbSession, user: CurrentUser):
    mail = await db.get(ExternalMail, mail_id)
    if not mail:
        raise HTTPException(status_code=404, detail="external mail not found")
    await _require_company_member(db, mail.company_id, user.id)
    if not mail.synced_at:
        raise HTTPException(status_code=409, detail="external mail has not been synchronized")
    mail.state = body.state
    await db.flush()
    return ResponseData(data={"id": mail.id, "state": mail.state})
