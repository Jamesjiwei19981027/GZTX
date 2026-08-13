"""轻遥测：自托管本地事件表，用于北极星度量（周活人均任务完成数等）。"""
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.core.dependencies import CurrentUser, DbSession
from app.models.company import CompanyMembership
from app.models.usage_event import UsageEvent
from app.schemas.common import ResponseData

router = APIRouter(prefix="/events", tags=["遥测"])

# 单次请求最多接收的事件条数，超出截断
MAX_EVENTS_PER_BATCH = 50


class EventIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    ts: Optional[datetime] = None
    props: Optional[dict] = None


class EventsBatch(BaseModel):
    events: List[EventIn]


@router.post("", response_model=ResponseData)
async def track_events(data: EventsBatch, db: DbSession, user: CurrentUser):
    """批量写入使用事件（当前用户）；单次最多 50 条，超出截断。"""
    accepted = 0
    for event in data.events[:MAX_EVENTS_PER_BATCH]:
        ts = event.ts
        if ts is not None and ts.tzinfo is not None:
            # SQLite 存 naive UTC，与 server_default 口径一致
            ts = ts.astimezone(timezone.utc).replace(tzinfo=None)
        db.add(
            UsageEvent(
                user_id=user.id,
                name=event.name.strip()[:64],
                props=event.props,
                created_at=ts or datetime.utcnow(),
            )
        )
        accepted += 1

    return ResponseData(data={"accepted": accepted})


@router.get("/summary", response_model=ResponseData)
async def events_summary(
    db: DbSession,
    user: CurrentUser,
    days: int = Query(7, ge=1, le=365),
):
    """按事件名聚合计数（最近 days 天），仅公司超管可看。"""
    is_super = (
        await db.execute(
            select(CompanyMembership.id)
            .where(
                CompanyMembership.user_id == user.id,
                CompanyMembership.is_super_admin == True,
                CompanyMembership.status == "active",
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if is_super is None:
        raise HTTPException(status_code=403, detail="仅超级管理员可查看遥测汇总")

    cutoff = datetime.utcnow() - timedelta(days=days)
    rows = (
        await db.execute(
            select(UsageEvent.name, func.count(UsageEvent.id))
            .where(UsageEvent.created_at >= cutoff)
            .group_by(UsageEvent.name)
            .order_by(func.count(UsageEvent.id).desc())
        )
    ).all()

    return ResponseData(
        data={
            "days": days,
            "items": [{"name": name, "count": count} for name, count in rows],
        }
    )
