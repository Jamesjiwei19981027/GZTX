import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import CompanyMembership
from app.models.project import ProjectMember
from app.services.membership_revoke import revoke_left_members


@pytest.mark.asyncio
async def test_left_member_project_acl_revoked(db_session: AsyncSession, seed_ids):
    company_id = seed_ids["company_id"]
    member_id = seed_ids["member_user_id"]
    project_id = seed_ids["project_id"]

    mq = await db_session.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == member_id,
        )
    )
    m = mq.scalar_one()
    m.employment_status = "left"
    await db_session.flush()

    n = await revoke_left_members(db_session, company_id)
    assert n >= 1

    pmq = await db_session.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == member_id,
        )
    )
    pm = pmq.scalar_one()
    assert pm.left_at is not None
