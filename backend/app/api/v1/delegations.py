"""委托授权 API §14"""
from datetime import datetime, timezone

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps_collab import assert_company_write
from app.core.collab_errors import CollabError, fail
from app.core.dependencies import CurrentUser, DbSession
from app.models.company import Company, CompanyMembership
from app.models.delegation import DelegationGrant
from app.models.project import Project
from app.schemas.common import ResponseData
from app.services.acl import AclService

router = APIRouter(prefix="/delegations", tags=["委托授权"])
acl = AclService()

# 禁止 "*" 与任意串；仅允许明确动作（含 prefix 形式需完整列出）
ALLOWED_DELEGATION_ACTIONS = frozenset(
    {
        "progress.read",
        "progress.write_formal",
        "progress.nudge",
        "evidence.read",
        "evidence.submit",
        "tree.edit_subtree",
        "wiki.manual_write",
        "review.read",
        "review.confirm",
        "project.read",
        "member.pull",
    }
)


class DelegationCreate(BaseModel):
    company_id: int
    project_id: int | None = None
    grantee_user_id: int
    actions: list[str] = Field(default_factory=list)
    valid_to: datetime | None = None
    reason: str | None = None


def _dto(g: DelegationGrant) -> dict:
    return {
        "id": g.id,
        "company_id": g.company_id,
        "project_id": g.project_id,
        "grantor_user_id": g.grantor_user_id,
        "grantee_user_id": g.grantee_user_id,
        "actions": list(g.actions_json or []),
        "status": g.status,
        "valid_from": g.valid_from.isoformat() if g.valid_from else None,
        "valid_to": g.valid_to.isoformat() if g.valid_to else None,
        "reason": g.reason,
        "created_at": g.created_at.isoformat() if g.created_at else None,
    }


async def _can_grant(db, user_id: int, company_id: int, project_id: int | None) -> bool:
    mq = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == user_id,
            CompanyMembership.status == "active",
        )
    )
    m = mq.scalar_one_or_none()
    if not m:
        return False
    if m.is_super_admin:
        return True
    if project_id is None:
        return False
    return await acl.can(
        db, user_id, company_id, "tree.edit_any", project_id=project_id
    )


@router.post("")
async def create_delegation(body: DelegationCreate, db: DbSession, user: CurrentUser):
    """创建委托授权"""
    company = await db.get(Company, body.company_id)
    if not company:
        return fail(404, 40400, "公司不存在")
    try:
        await assert_company_write(db, body.company_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    if not await _can_grant(db, user.id, body.company_id, body.project_id):
        return fail(403, 40300, "无权创建委托（需超管或项目 PM）")
    if body.project_id is not None:
        p = await db.get(Project, body.project_id)
        if not p or p.company_id != body.company_id:
            return fail(422, 42200, "项目不属于该公司")
    if not body.actions:
        return fail(422, 42200, "actions 不能为空")
    bad = [a for a in body.actions if a == "*" or a not in ALLOWED_DELEGATION_ACTIONS]
    if bad:
        return fail(
            422,
            42200,
            f"非法委托动作: {bad}；允许: {sorted(ALLOWED_DELEGATION_ACTIONS)}",
        )

    gq = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == body.company_id,
            CompanyMembership.user_id == body.grantee_user_id,
            CompanyMembership.status == "active",
        )
    )
    if not gq.scalar_one_or_none():
        return fail(422, 42200, "被授权人非公司成员")

    grant = DelegationGrant(
        company_id=body.company_id,
        project_id=body.project_id,
        grantor_user_id=user.id,
        grantee_user_id=body.grantee_user_id,
        actions_json=list(body.actions),
        status="active",
        valid_to=body.valid_to,
        reason=body.reason,
    )
    db.add(grant)
    await db.commit()
    await db.refresh(grant)
    return ResponseData(data=_dto(grant))


@router.get("")
async def list_delegations(
    db: DbSession,
    user: CurrentUser,
    company_id: int = Query(...),
    project_id: int | None = Query(None),
):
    """列出委托授权"""
    mq = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
    )
    if not mq.scalar_one_or_none():
        return fail(403, 40302, "非本公司成员")

    filters = [
        DelegationGrant.company_id == company_id,
        DelegationGrant.status == "active",
    ]
    if project_id is not None:
        filters.append(DelegationGrant.project_id == project_id)

    rows = (
        await db.execute(select(DelegationGrant).where(*filters).order_by(DelegationGrant.id.desc()))
    ).scalars().all()
    return ResponseData(data={"items": [_dto(g) for g in rows]})


@router.post("/{delegation_id}/revoke")
async def revoke_delegation(delegation_id: int, db: DbSession, user: CurrentUser):
    """撤销委托授权"""
    grant = await db.get(DelegationGrant, delegation_id)
    if not grant:
        return fail(404, 40400, "委托不存在")
    if not await _can_grant(db, user.id, grant.company_id, grant.project_id):
        # grantor can revoke own
        if grant.grantor_user_id != user.id:
            return fail(403, 40300, "无权撤销")
    grant.status = "revoked"
    grant.revoked_at = datetime.now(timezone.utc)
    await db.commit()
    return ResponseData(data={"id": grant.id, "status": "revoked"})
