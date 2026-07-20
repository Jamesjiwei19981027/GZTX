"""组织同步 Runner"""
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import CompanyMembership, OrgUnit
from app.models.user import User
from app.services.org_sync.base import OrgSyncProvider


@dataclass
class SyncReport:
    dept_upserted: int = 0
    users_matched: int = 0
    left_count: int = 0
    activated_count: int = 0
    errors: list[str] = field(default_factory=list)


async def run_org_sync(
    db: AsyncSession,
    company_id: int,
    provider: OrgSyncProvider,
    source: str = "generic",
    auto_create_users: bool = False,
) -> SyncReport:
    report = SyncReport()
    depts = await provider.fetch_departments()
    users = await provider.fetch_users()

    # map external_id -> OrgUnit
    existing_q = await db.execute(
        select(OrgUnit).where(OrgUnit.company_id == company_id, OrgUnit.source == source)
    )
    by_ext: dict[str, OrgUnit] = {
        u.external_id: u for u in existing_q.scalars().all() if u.external_id
    }

    # first pass upsert without parent path
    for d in depts:
        unit = by_ext.get(d.external_id)
        if unit:
            unit.name = d.name
            unit.is_active = True
        else:
            unit = OrgUnit(
                company_id=company_id,
                name=d.name,
                external_id=d.external_id,
                source=source,
                path="/",
                is_active=True,
            )
            db.add(unit)
            await db.flush()
            by_ext[d.external_id] = unit
        report.dept_upserted += 1

    # resolve parents + path
    for d in depts:
        unit = by_ext[d.external_id]
        if d.parent_external_id and d.parent_external_id in by_ext:
            parent = by_ext[d.parent_external_id]
            unit.parent_id = parent.id
            unit.path = f"{parent.path.rstrip('/')}/{unit.id}/"
        else:
            unit.parent_id = None
            unit.path = f"/{unit.id}/"
    await db.flush()

    for u in users:
        membership = None
        # match by external_user_id
        mq = await db.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == company_id,
                CompanyMembership.external_user_id == u.external_id,
            )
        )
        membership = mq.scalar_one_or_none()
        user_row = None
        if not membership and u.email:
            uq = await db.execute(select(User).where(User.email == u.email))
            user_row = uq.scalar_one_or_none()
            if user_row:
                mq2 = await db.execute(
                    select(CompanyMembership).where(
                        CompanyMembership.company_id == company_id,
                        CompanyMembership.user_id == user_row.id,
                    )
                )
                membership = mq2.scalar_one_or_none()

        if not membership:
            if not auto_create_users:
                continue
            # auto create not implemented fully — skip
            continue

        report.users_matched += 1
        membership.external_user_id = u.external_id
        if u.title is not None:
            membership.title = u.title
        # attach first dept
        if u.dept_external_ids:
            first = u.dept_external_ids[0]
            if first in by_ext:
                membership.org_unit_id = by_ext[first].id
        if u.employment == "left":
            if membership.employment_status != "left":
                membership.employment_status = "left"
                report.left_count += 1
        else:
            if membership.employment_status == "left":
                report.activated_count += 1
            membership.employment_status = "active"

    await db.flush()
    # 同步后立即收权，不等待 cron
    from app.services.membership_revoke import revoke_left_members

    await revoke_left_members(db, company_id=company_id)
    return report
