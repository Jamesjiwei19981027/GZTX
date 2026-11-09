"""协作域依赖注入"""
from typing import Annotated, Optional

from fastapi import Depends, Header, Path, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.collab_errors import CollabError, fail
from app.core.dependencies import get_current_user, get_db
from app.models.company import Company, CompanyMembership
from app.models.user import User
from app.services.entitlement import EntitlementService
from app.services.org_roles import is_org_leader


async def get_client_channel(
    x_client_channel: Annotated[Optional[str], Header(alias="X-Client-Channel")] = None,
) -> str:
    ch = (x_client_channel or "web").strip().lower()
    if ch not in ("web", "miniprogram", "wechat"):
        ch = "web"
    return ch


async def get_company(
    company_id: int = Path(...),
    db: AsyncSession = Depends(get_db),
) -> Company:
    row = await db.get(Company, company_id)
    if not row:
        raise CollabError(404, 40400, "公司不存在")
    return row


async def require_company_member(
    company: Company = Depends(get_company),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CompanyMembership:
    q = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
    )
    m = q.scalar_one_or_none()
    if not m:
        raise CollabError(403, 40302, "非本公司成员")
    return m


async def require_company_member_active_employment(
    membership: CompanyMembership = Depends(require_company_member),
) -> CompanyMembership:
    if membership.employment_status != "active":
        raise CollabError(403, 40314, "在职状态无效，已禁止写入与项目操作")
    return membership


def require_feature(feature: str):
    """读路径：公司已解锁且开通 feature。"""

    async def _inner(company: Company = Depends(get_company)) -> Company:
        svc = EntitlementService()
        if company.status == "pending_license" or not svc.is_company_unlocked(company):
            raise CollabError(403, 40310, "需要有效 License 后方可使用")
        if not svc.has_feature(company, feature):
            raise CollabError(403, 40312, f"功能未开通: {feature}")
        return company

    return _inner


def require_company_write_allowed(company: Company) -> None:
    """写路径：active + 未过期；readonly/pending/suspended 拒绝。"""
    svc = EntitlementService()
    if not svc.is_write_allowed(company):
        if company.status == "readonly" or svc.is_expired(company):
            raise CollabError(403, 40311, "公司只读或 License 已过期，禁止写入")
        if company.status == "pending_license":
            raise CollabError(403, 40310, "需要有效 License 后方可使用")
        raise CollabError(403, 40310, "公司状态不允许写入")


async def assert_company_write(
    db: AsyncSession, company_id: int, *, feature: str | None = None
) -> Company:
    """加载公司并校验解锁 / 写权限 / 可选 feature。"""
    company = await db.get(Company, company_id)
    if not company:
        raise CollabError(404, 40400, "公司不存在")
    svc = EntitlementService()
    if company.status == "pending_license" or not svc.is_company_unlocked(company):
        if company.status == "readonly":
            # unlocked for reads but not writes
            require_company_write_allowed(company)
        else:
            raise CollabError(403, 40310, "需要有效 License 后方可使用")
    require_company_write_allowed(company)
    if feature and not svc.has_feature(company, feature):
        raise CollabError(403, 40312, f"功能未开通: {feature}")
    return company


async def assert_collaboration_write(
    db: AsyncSession, company_id: int, *, project_id: int | None = None,
    user_id: int | None = None, feature: str | None = None,
) -> Company:
    """协作写入统一门禁：公司可写、项目未归档、操作者仍在职。"""
    company = await assert_company_write(db, company_id, feature=feature)
    if project_id is not None:
        from app.models.project import Project
        project = await db.get(Project, project_id)
        if not project or project.company_id != company_id:
            raise CollabError(403, 40301, "无权写入该项目")
        if project.status == "archived":
            raise CollabError(403, 40311, "项目已归档，禁止写入")
    if user_id is not None:
        membership = await get_membership_for(db, company_id, user_id)
        if not membership or membership.employment_status != "active":
            raise CollabError(403, 40314, "在职状态无效，已禁止写入")
    return company


async def require_super_admin(
    membership: CompanyMembership = Depends(require_company_member),
) -> CompanyMembership:
    if not membership.is_super_admin:
        raise CollabError(403, 40303, "需要公司超级管理员")
    return membership


async def require_org_leader(
    membership: CompanyMembership = Depends(require_company_member),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    company: Company = Depends(get_company),
) -> CompanyMembership:
    if not await is_org_leader(db, user.id, company.id):
        raise CollabError(403, 40304, "需要组织负责人")
    if membership.employment_status != "active":
        raise CollabError(403, 40314, "在职状态无效")
    return membership


async def resolve_company_by_id(db: AsyncSession, company_id: int) -> Company:
    row = await db.get(Company, company_id)
    if not row:
        raise CollabError(404, 40400, "公司不存在")
    return row


async def get_membership_for(
    db: AsyncSession, company_id: int, user_id: int
) -> CompanyMembership | None:
    q = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == user_id,
            CompanyMembership.status == "active",
        )
    )
    return q.scalar_one_or_none()
