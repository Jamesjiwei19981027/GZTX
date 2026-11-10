"""系统推送设备接口：仅操作当前登录账号。"""
from datetime import datetime, timezone
from typing import Literal
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from app.core.config import settings
from app.core.dependencies import CurrentUser, DbSession
from app.models.push_device import PushDevice

router = APIRouter(prefix="/push", tags=["系统推送"])


class DeviceRegistration(BaseModel):
    platform: Literal['android', 'ios']
    registration_id: str = Field(min_length=1, max_length=255, pattern=r'^[A-Za-z0-9_-]+$')
    app_version: str | None = Field(default=None, max_length=64)


class PushStatus(BaseModel):
    enabled: bool


@router.get('/status', summary='查询系统推送状态')
async def status(current_user: CurrentUser) -> PushStatus:
    return {"enabled": settings.jpush_enabled}


@router.post('/devices', summary='登记或刷新推送设备')
async def register_device(body: DeviceRegistration, current_user: CurrentUser, db: DbSession) -> PushStatus:
    if not settings.jpush_enabled:
        return {"enabled": False}
    # 唯一 rid 的并发刷新/换号必须原子完成，避免 select-then-insert 竞争。
    if db.get_bind().dialect.name == 'postgresql':
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    values = dict(user_id=current_user.id, platform=body.platform,
                  registration_id=body.registration_id, app_version=body.app_version,
                  last_seen_at=datetime.now(timezone.utc), disabled_at=None)
    stmt = insert(PushDevice).values(**values)
    await db.execute(stmt.on_conflict_do_update(
        index_elements=['registration_id'],
        set_={key: value for key, value in values.items() if key != 'registration_id'},
    ))
    await db.flush()
    return {"enabled": True}


@router.delete('/devices/{registration_id}', status_code=204, summary='注销自己的推送设备')
async def unregister_device(registration_id: str, current_user: CurrentUser, db: DbSession):
    owner = (await db.execute(select(PushDevice.user_id).where(PushDevice.registration_id == registration_id))).scalar_one_or_none()
    if owner is not None and owner != current_user.id:
        raise HTTPException(status_code=404, detail="设备不存在")
    await db.execute(delete(PushDevice).where(PushDevice.registration_id == registration_id, PushDevice.user_id == current_user.id))
    return Response(status_code=204)
