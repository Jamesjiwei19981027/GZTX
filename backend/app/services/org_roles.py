"""组织角色判定（OrgLeader 等）"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import CompanyMembership, OrgUnit


async def get_membership(
    db: AsyncSession, user_id: int, company_id: int
) -> CompanyMembership | None:
    q = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == user_id,
        )
    )
    return q.scalar_one_or_none()


async def is_org_leader(db: AsyncSession, user_id: int, company_id: int) -> bool:
    m = await get_membership(db, user_id, company_id)
    if not m or m.status != "active":
        return False
    if m.is_super_admin or m.is_org_leader:
        return True
    q = await db.execute(
        select(OrgUnit.id)
        .where(
            OrgUnit.company_id == company_id,
            OrgUnit.leader_user_id == user_id,
            OrgUnit.is_active.is_(True),
        )
        .limit(1)
    )
    return q.scalar_one_or_none() is not None
