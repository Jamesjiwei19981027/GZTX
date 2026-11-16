"""AI 审计接口。授权范围完全由服务端人轴决定。"""
from typing import Literal
from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator
from sqlalchemy import select

from app.core.dependencies import CurrentUser, DbSession
from app.core.collab_errors import CollabError
from app.schemas.common import ResponseData
from app.models.audit_run import AuditRun
from app.services import axis_audit as svc
from app.services.tree_service import TreeService

router = APIRouter(tags=['AI 审计'])


class AuditBody(BaseModel):
    model_config = ConfigDict(extra='forbid')
    scope: Literal['self', 'node', 'project'] = 'self'
    node_id: int | None = Field(default=None, gt=0)
    custom_instruction: str | None = Field(default=None, max_length=500)

    @model_validator(mode='after')
    def valid_scope(self):
        if (self.scope == 'node') != (self.node_id is not None):
            raise ValueError('仅人员范围需要填写 node_id')
        self.custom_instruction = (self.custom_instruction or '').strip() or None
        return self


class AuditPermissionBody(BaseModel):
    model_config = ConfigDict(extra='forbid')
    allow_audit_subordinates: StrictBool | None


@router.get('/projects/{project_id}/audit-options', response_model=ResponseData, summary='获取可审计范围和人员开关')
async def audit_options(project_id: int, db: DbSession, user: CurrentUser):
    p = await svc.readable_project(db, project_id, user.id)
    return ResponseData(data=await svc.options(db, p, user.id))


@router.put('/projects/{project_id}/nodes/{node_id}/audit-permission', response_model=ResponseData, summary='设置人员下属审计权限')
async def audit_permission(project_id: int, node_id: int, body: AuditPermissionBody, db: DbSession, user: CurrentUser):
    p = await svc.readable_project(db, project_id, user.id)
    await TreeService().save_audit_permission(db, p, user.id, node_id, body.allow_audit_subordinates)
    return ResponseData(data=await svc.options(db, p, user.id))


@router.post('/projects/{project_id}/audits', response_model=ResponseData, summary='发起后台 AI 审计并立即返回规则快照')
async def create_audit(project_id: int, body: AuditBody, db: DbSession, user: CurrentUser):
    p = await svc.readable_project(db, project_id, user.id)
    return ResponseData(data=await svc.run(db, p, user, **body.model_dump()))


@router.get('/projects/{project_id}/audits', response_model=ResponseData, summary='查看本人发起或针对本人的审计历史')
async def list_audits(project_id: int, db: DbSession, user: CurrentUser,
    offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100)):
    await svc.readable_project(db, project_id, user.id)
    # 先按接收者裁剪再分页，不能暴露不可见运行的总数或空页。
    rows = (await db.execute(select(AuditRun).where(AuditRun.project_id == project_id).order_by(AuditRun.id.desc()))).scalars()
    items = []
    visible = 0
    for row in rows:
        projected = svc.project_result(row, user.id)
        if projected is not None:
            if visible >= offset:
                items.append(projected)
            visible += 1
            if len(items) > limit:
                break
    return ResponseData(data={'items': items[:limit], 'has_more': len(items) > limit})


@router.get('/projects/{project_id}/audits/{audit_id}', response_model=ResponseData, summary='查看权限裁剪后的审计详情')
async def get_audit(project_id: int, audit_id: int, db: DbSession, user: CurrentUser):
    await svc.readable_project(db, project_id, user.id)
    row = (await db.execute(select(AuditRun).where(AuditRun.id == audit_id, AuditRun.project_id == project_id))).scalar_one_or_none()
    if row is None:
        raise CollabError(404, 40400, '审计档案不存在')
    data = svc.project_result(row, user.id)
    if data is None:
        raise CollabError(403, 40301, '无权查看此审计，仅可查看本人发起或针对本人的结果')
    return ResponseData(data=data)
