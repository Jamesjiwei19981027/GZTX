"""离职成员项目 ACL 收权"""
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import CompanyMembership
from app.models.project import Project, ProjectMember


async def revoke_left_members(
    db: AsyncSession, company_id: int | None = None
) -> int:
    """对 employment!=active 或 membership.status!=active 的用户，写 project_members.left_at。"""
    filters = [
        or_(
            CompanyMembership.employment_status != "active",
            CompanyMembership.status != "active",
        )
    ]
    if company_id is not None:
        filters.append(CompanyMembership.company_id == company_id)

    mq = await db.execute(select(CompanyMembership).where(*filters))
    left_members = list(mq.scalars().all())
    if not left_members:
        return 0

    now = datetime.now(timezone.utc)
    count = 0
    for m in left_members:
        # projects in this company
        pq = await db.execute(select(Project.id).where(Project.company_id == m.company_id))
        project_ids = [row[0] for row in pq.all()]
        if not project_ids:
            continue
        pmq = await db.execute(
            select(ProjectMember).where(
                ProjectMember.user_id == m.user_id,
                ProjectMember.project_id.in_(project_ids),
                ProjectMember.left_at.is_(None),
            )
        )
        for pm in pmq.scalars().all():
            pm.left_at = now
            count += 1
    await db.flush()
    return count
