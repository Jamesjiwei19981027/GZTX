import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import CompanyMembership
from app.services.org_sync.generic import GenericSnapshotProvider
from app.services.org_sync.runner import run_org_sync


@pytest.mark.asyncio
async def test_sync_marks_left_employment(db_session: AsyncSession, seed_ids):
    member_id = seed_ids["member_user_id"]
    company_id = seed_ids["company_id"]

    mq = await db_session.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == member_id,
        )
    )
    m = mq.scalar_one()
    m.external_user_id = "ext-member-1"
    await db_session.flush()

    provider = GenericSnapshotProvider(
        {
            "depts": [
                {
                    "external_id": "d1",
                    "name": "研发",
                    "parent_external_id": None,
                    "leader_external_id": None,
                }
            ],
            "users": [
                {
                    "external_id": "ext-member-1",
                    "name": "成员",
                    "email": "member_user@example.com",
                    "mobile": None,
                    "dept_external_ids": ["d1"],
                    "employment": "left",
                    "title": None,
                }
            ],
        }
    )
    report = await run_org_sync(db_session, company_id, provider, source="generic")
    assert report.left_count == 1
    await db_session.refresh(m)
    assert m.employment_status == "left"
    assert report.dept_upserted == 1
