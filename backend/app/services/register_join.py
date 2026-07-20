"""单公司开放注册：加入默认公司 + 用户配额。"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.company import Company, CompanyMembership
from app.models.user import User
from app.services.entitlement import EntitlementService


class RegisterJoinError(Exception):
    def __init__(self, http_status: int, code: int, message: str):
        self.http_status = http_status
        self.code = code
        self.message = message
        super().__init__(message)


@dataclass
class JoinResult:
    joined: bool
    company_id: int | None = None
    company_slug: str | None = None
    reason: str = ""


async def count_active_members(db: AsyncSession, company_id: int) -> int:
    q = await db.execute(
        select(func.count())
        .select_from(CompanyMembership)
        .where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.status == "active",
        )
    )
    return int(q.scalar() or 0)


async def get_default_company(db: AsyncSession) -> Company | None:
    slug = (settings.DEFAULT_COMPANY_SLUG or "default").strip()
    if not slug:
        return None
    q = await db.execute(select(Company).where(Company.slug == slug))
    return q.scalar_one_or_none()


async def try_join_default_company(db: AsyncSession, user: User) -> JoinResult:
    """DEPLOY_MODE=single_company 时，将新用户加入 DEFAULT_COMPANY_SLUG。

    - 公司不存在：no-op（仅个人账号）
    - 未解锁：join false reason=company_locked（个人账号仍可注册）
    - 超 max_users：RegisterJoinError 409
    - 已是成员：返回 joined=True
    - 不创建第二家公司
    - 并发：对公司行 FOR UPDATE 后重计 active members，降低超卖
    """
    from app.services.entitlement import QuotaExceeded

    mode = (settings.DEPLOY_MODE or "single_company").lower()
    if mode != "single_company":
        return JoinResult(joined=False, reason="not_single_company")

    company = await get_default_company(db)
    if not company:
        return JoinResult(joined=False, reason="no_default_company")

    # 行锁：Postgres 真正串行化 seat claim；SQLite 至少保证本连接事务内一致
    locked = await db.execute(
        select(Company).where(Company.id == company.id).with_for_update()
    )
    company = locked.scalar_one()

    ent = EntitlementService()
    if not ent.is_company_unlocked(company):
        return JoinResult(
            joined=False,
            company_id=company.id,
            company_slug=company.slug,
            reason="company_locked",
        )

    existing = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.user_id == user.id,
        )
    )
    m = existing.scalar_one_or_none()
    if m:
        if m.status != "active":
            m.status = "active"
            m.employment_status = m.employment_status or "active"
            await db.flush()
        return JoinResult(
            joined=True, company_id=company.id, company_slug=company.slug, reason="already"
        )

    n = await count_active_members(db, company.id)
    try:
        ent.check_quota(company, "max_users", n)
    except QuotaExceeded as e:
        raise RegisterJoinError(
            409,
            40901,
            f"公司用户名额已满（最多 {e.limit} 人），请联系管理员",
        ) from e

    db.add(
        CompanyMembership(
            company_id=company.id,
            user_id=user.id,
            status="active",
            employment_status="active",
            is_super_admin=False,
            is_org_leader=False,
        )
    )
    await db.flush()

    # 二次校验：防止 TOCTOU 在 flush 后仍超卖（并发路径）
    n2 = await count_active_members(db, company.id)
    try:
        # n2 含本条；配额含义为「当前 active 数」不得超过 limit，即允许恰好 = limit
        limit = (company.entitlement_json or {}).get("quotas", {}).get("max_users")
        if limit is not None and n2 > int(limit):
            raise RegisterJoinError(
                409,
                40901,
                f"公司用户名额已满（最多 {int(limit)} 人），请联系管理员",
            )
    except RegisterJoinError:
        raise

    return JoinResult(
        joined=True,
        company_id=company.id,
        company_slug=company.slug,
        reason="joined",
    )
