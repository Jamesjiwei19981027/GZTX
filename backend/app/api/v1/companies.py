"""公司 · License · 成员 · 策略 API"""
from copy import deepcopy
from math import ceil

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func, select

from app.api.deps_collab import (
    get_company,
    require_company_member,
    require_org_leader,
    require_super_admin,
)
from app.core.collab_errors import CollabError, fail
from app.core.config import settings
from app.core.dependencies import CurrentUser, DbSession, CollaborationUser
from app.models.company import Company, CompanyMembership
from app.models.user import User
from app.schemas.common import ResponseData
from app.schemas.company import (
    CompanyCreate,
    LicenseUpload,
    MembershipPatch,
    PolicyPatch,
    SaasOpenBody,
)
from app.services.company_bootstrap import (
    apply_license_to_company,
    bootstrap_single_company,
    saas_open_company,
)
from app.services.entitlement import EntitlementService
from app.services.policy_presets import (
    DEFAULT_ENTITLEMENT,
    DEFAULT_LOGIN_METHODS,
    POLICY_PRESETS,
)

router = APIRouter(prefix="/companies", tags=["企业"])


def _company_summary(company: Company, membership: CompanyMembership | None = None) -> dict:
    ent = company.entitlement_json or {}
    return {
        "id": company.id,
        "name": company.name,
        "slug": company.slug,
        "status": company.status,
        "policy_preset": company.policy_preset,
        "policy": company.policy_json or {},
        "entitlement": ent,
        "login_methods": company.login_methods_json or DEFAULT_LOGIN_METHODS,
        "my_membership": (
            {
                "status": membership.status,
                "is_super_admin": membership.is_super_admin,
                "is_org_leader": membership.is_org_leader,
                "employment_status": membership.employment_status,
                "title": membership.title,
            }
            if membership
            else None
        ),
        "created_at": company.created_at.isoformat() if company.created_at else None,
    }


@router.post("")
async def create_company(body: CompanyCreate, db: DbSession, user: CollaborationUser):
    """创建公司需完成双验证（邮箱 + 手机）。single_company 下仅允许空库首次 bootstrap，禁止第二家公司。"""
    mode = (settings.DEPLOY_MODE or "single_company").lower()
    if mode == "single_company":
        existing_n = (
            await db.execute(select(func.count()).select_from(Company))
        ).scalar() or 0
        if int(existing_n) > 0:
            return fail(
                403,
                40312,
                "单公司部署模式不允许创建第二家公司；请使用已有公司或切换 DEPLOY_MODE=saas",
            )
    try:
        company = await bootstrap_single_company(
            db,
            name=body.name,
            slug=body.slug,
            admin_user_id=user.id,
            policy_preset=body.policy_preset or "standard",
            activate=False,
        )
    except ValueError as e:
        if "slug" in str(e):
            return fail(409, 40900, "slug 已占用")
        return fail(422, 42200, str(e))
    await db.commit()
    await db.refresh(company)
    q = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.user_id == user.id,
        )
    )
    m = q.scalar_one()
    return ResponseData(data=_company_summary(company, m))


@router.get("/mine")
async def list_my_companies(db: DbSession, user: CurrentUser):
    """当前用户所属公司列表（登录后选公司上下文用）。"""
    q = await db.execute(
        select(Company, CompanyMembership)
        .join(
            CompanyMembership,
            CompanyMembership.company_id == Company.id,
        )
        .where(
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
        .order_by(Company.id.asc())
    )
    items = [_company_summary(c, m) for c, m in q.all()]
    return ResponseData(data={"items": items, "total": len(items)})


@router.post("/saas-open")
async def saas_open(body: SaasOpenBody, db: DbSession, user: CurrentUser):
    """SaaS 模式自助开通企业"""
    if settings.DEPLOY_MODE != "saas":
        return fail(403, 40311, "当前环境未启用 SaaS 开通")
    try:
        company = await saas_open_company(
            db,
            name=body.name,
            slug=body.slug,
            admin_user_id=user.id,
            plan_code=body.plan_code,
        )
    except ValueError as e:
        if "slug" in str(e):
            return fail(409, 40900, "slug 已占用")
        return fail(422, 42200, str(e))
    await db.commit()
    await db.refresh(company)
    return ResponseData(
        data={
            "id": company.id,
            "name": company.name,
            "slug": company.slug,
            "status": company.status,
            "plan_code": body.plan_code,
        }
    )


@router.get("/{company_id}")
async def get_company_detail(
    company_id: int,
    db: DbSession,
    user: CurrentUser,
):
    """获取企业详情"""
    company = await db.get(Company, company_id)
    if not company:
        return fail(404, 40400, "公司不存在")
    q = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
    )
    m = q.scalar_one_or_none()
    if not m:
        return fail(403, 40302, "非本公司成员")
    return ResponseData(data=_company_summary(company, m))


@router.get("/{company_id}/smtp", response_model=ResponseData)
async def get_company_smtp(
    company_id: int,
    db: DbSession,
    user: CurrentUser,
):
    """公司级 SMTP（密码脱敏）。成员可读状态；改密需超管 PUT。"""
    company = await db.get(Company, company_id)
    if not company:
        return fail(404, 40400, "公司不存在")
    q = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
    )
    m = q.scalar_one_or_none()
    if not m:
        return fail(403, 40302, "非本公司成员")
    from app.services.smtp_settings import company_smtp_public

    data = await company_smtp_public(db, company_id)
    return ResponseData(data=data)


@router.put("/{company_id}/smtp", response_model=ResponseData)
async def put_company_smtp(
    company_id: int,
    body: dict,
    db: DbSession,
    user: CurrentUser,
):
    """前端可配置公司 SMTP（含密码）；密码空字符串表示不改动。超管可写。"""
    company = await db.get(Company, company_id)
    if not company:
        return fail(404, 40400, "公司不存在")
    q = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
    )
    m = q.scalar_one_or_none()
    if not m or not m.is_super_admin:
        return fail(403, 40303, "需要公司超级管理员")
    from app.services.smtp_settings import save_company_smtp

    data = await save_company_smtp(
        db,
        company_id,
        smtp_host=body.get("smtp_host"),
        smtp_port=body.get("smtp_port"),
        smtp_user=body.get("smtp_user"),
        smtp_password=body.get("smtp_password"),
        smtp_from=body.get("smtp_from"),
    )
    await db.commit()
    return ResponseData(data=data, message="公司 SMTP 已保存")


@router.post("/{company_id}/smtp/test", response_model=ResponseData)
async def test_company_smtp(
    company_id: int,
    db: DbSession,
    user: CurrentUser,
):
    """用公司 SMTP 向当前用户邮箱发测试信（超管）。"""
    company = await db.get(Company, company_id)
    if not company:
        return fail(404, 40400, "公司不存在")
    q = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
    )
    m = q.scalar_one_or_none()
    if not m or not m.is_super_admin:
        return fail(403, 40303, "需要公司超级管理员")
    if not user.email:
        return fail(400, 40000, "请先在个人资料中填写邮箱")
    from app.services.smtp_settings import smtp_from_company
    from app.utils.email import _send_smtp

    resolved = await smtp_from_company(db, company_id)
    if not resolved or not resolved.is_complete():
        return fail(400, 40000, "公司 SMTP 未配置完整（主机/账号/密码）")
    import asyncio

    ok = await asyncio.to_thread(
        _send_smtp,
        to_email=user.email,
        from_addr=resolved.from_addr,
        subject="[WorkTodo] 公司 SMTP 测试",
        text_body=f"公司「{company.name}」SMTP 配置可用。",
        html_body=f"<p>公司「{company.name}」SMTP 配置可用。</p>",
        smtp_host=resolved.host,
        smtp_port=resolved.port,
        smtp_user=resolved.user,
        smtp_password=resolved.password,
    )
    if not ok:
        return fail(500, 50000, "发送失败，请检查主机/端口/账号密码")
    return ResponseData(message=f"测试邮件已发送至 {user.email}")


@router.get("/{company_id}/llm", response_model=ResponseData)
async def get_company_llm(
    company_id: int,
    db: DbSession,
    user: CurrentUser,
):
    """公司级 LLM 配置（api_key 脱敏）。成员可读；改密需超管。"""
    company = await db.get(Company, company_id)
    if not company:
        return fail(404, 40400, "公司不存在")
    q = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
    )
    m = q.scalar_one_or_none()
    if not m:
        return fail(403, 40302, "非本公司成员")
    from app.services.llm_settings import company_llm_public

    return ResponseData(data=await company_llm_public(db, company_id))


@router.put("/{company_id}/llm", response_model=ResponseData)
async def put_company_llm(
    company_id: int,
    body: dict,
    db: DbSession,
    user: CurrentUser,
):
    """前端可配置公司 LLM（含 API Key）；空 api_key 表示不改动。超管可写。"""
    company = await db.get(Company, company_id)
    if not company:
        return fail(404, 40400, "公司不存在")
    q = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
    )
    m = q.scalar_one_or_none()
    if not m or not m.is_super_admin:
        return fail(403, 40303, "需要公司超级管理员")
    from app.services.llm_settings import save_company_llm
    from app.services.policy_guard import PolicyGuard

    provider = (body.get("provider") or "fake").strip()
    model_name = (body.get("model") or "").strip()
    provider_id = f"{provider}:{model_name}" if model_name and provider != "fake" else provider
    guard = PolicyGuard()
    if not guard.allow_model(company, provider_id) and provider != "fake":
        # allow_cloud 预设通常放行；隔离策略下拒绝云模型
        if not guard.allow_model(company, provider):
            return fail(403, 40300, f"策略不允许该模型: {provider_id}")

    data = await save_company_llm(
        db,
        company_id,
        provider=body.get("provider"),
        base_url=body.get("base_url"),
        model=body.get("model"),
        api_key=body.get("api_key"),
        temperature=body.get("temperature"),
        max_tokens=body.get("max_tokens"),
        enabled=body.get("enabled"),
        use_for_judge=body.get("use_for_judge"),
        use_for_agent=body.get("use_for_agent"),
    )
    await db.commit()
    return ResponseData(data=data, message="公司 LLM 已保存")


@router.post("/{company_id}/llm/test", response_model=ResponseData)
async def test_company_llm_api(
    company_id: int,
    db: DbSession,
    user: CurrentUser,
):
    """用公司 LLM 发一次 ping（超管）；不回显密钥。"""
    company = await db.get(Company, company_id)
    if not company:
        return fail(404, 40400, "公司不存在")
    q = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
    )
    m = q.scalar_one_or_none()
    if not m or not m.is_super_admin:
        return fail(403, 40303, "需要公司超级管理员")
    from app.services.llm_settings import test_company_llm

    result = await test_company_llm(db, company_id)
    if not result.get("ok"):
        return fail(400, 40000, result.get("error") or "LLM 测试失败")
    return ResponseData(
        data={
            "provider": result.get("provider"),
            "model": result.get("model"),
            "base_url": result.get("base_url"),
            "content": (result.get("content") or "")[:500],
        },
        message="LLM 连通性测试成功",
    )


@router.post("/{company_id}/license")
async def upload_license(
    company_id: int,
    body: LicenseUpload,
    db: DbSession,
    user: CurrentUser,
):
    """上传企业授权许可证"""
    company = await db.get(Company, company_id)
    if not company:
        return fail(404, 40400, "公司不存在")
    q = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
    )
    m = q.scalar_one_or_none()
    if not m or not m.is_super_admin:
        return fail(403, 40303, "需要公司超级管理员")
    try:
        result = await apply_license_to_company(
            db, company, body.license_payload, body.signature
        )
    except ValueError as e:
        return fail(422, 42200, str(e))
    await db.commit()
    return ResponseData(data=result)


@router.patch("/{company_id}/policy")
async def patch_policy(
    company_id: int,
    body: PolicyPatch,
    db: DbSession,
    user: CurrentUser,
):
    """修改企业数据与模型策略"""
    company = await db.get(Company, company_id)
    if not company:
        return fail(404, 40400, "公司不存在")
    q = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
    )
    m = q.scalar_one_or_none()
    if not m or not m.is_super_admin:
        return fail(403, 40303, "需要公司超级管理员")

    if body.policy_preset:
        if body.policy_preset not in POLICY_PRESETS:
            return fail(422, 42200, "未知 policy_preset")
        company.policy_preset = body.policy_preset
        base = dict(POLICY_PRESETS[body.policy_preset])
        if body.policy_json:
            base.update(body.policy_json)
        company.policy_json = base
    elif body.policy_json is not None:
        cur = dict(company.policy_json or {})
        cur.update(body.policy_json)
        company.policy_json = cur

    if body.login_methods is not None:
        from app.services.login_methods import validate_login_methods
        validate_login_methods(body.login_methods)
        lm = dict(company.login_methods_json or DEFAULT_LOGIN_METHODS)
        lm.update(body.login_methods)
        company.login_methods_json = lm

    await db.commit()
    await db.refresh(company)
    return ResponseData(
        data={
            "id": company.id,
            "policy_preset": company.policy_preset,
            "policy": company.policy_json,
            "login_methods": company.login_methods_json,
        }
    )


@router.get("/{company_id}/members")
async def list_members(
    company_id: int,
    db: DbSession,
    user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
):
    """列出企业成员"""
    company = await db.get(Company, company_id)
    if not company:
        return fail(404, 40400, "公司不存在")
    q = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
    )
    if not q.scalar_one_or_none():
        return fail(403, 40302, "非本公司成员")

    filters = [CompanyMembership.company_id == company_id]
    if status:
        filters.append(CompanyMembership.status == status)
    else:
        # 默认不展示已移出的人；需要时显式传 status=removed
        filters.append(CompanyMembership.status != "removed")

    total = (
        await db.execute(select(func.count()).select_from(CompanyMembership).where(*filters))
    ).scalar() or 0
    rows = (
        await db.execute(
            select(CompanyMembership, User)
            .join(User, User.id == CompanyMembership.user_id)
            .where(*filters)
            .order_by(CompanyMembership.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()

    items = [_member_dto(m, u) for m, u in rows]
    return ResponseData(
        data={
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": ceil(total / page_size) if page_size else 0,
        }
    )


def _member_dto(m: CompanyMembership, u: User) -> dict:
    return {
        "user_id": m.user_id,
        "username": u.username,
        "nickname": u.nickname,
        "email": u.email,
        "avatar_url": u.avatar_url,
        "status": m.status,
        "employment_status": m.employment_status,
        "is_super_admin": m.is_super_admin,
        "is_org_leader": m.is_org_leader,
        "org_unit_id": m.org_unit_id,
        "title": m.title,
    }


async def _active_super_admin_count(db, company_id: int) -> int:
    return int(
        (
            await db.execute(
                select(func.count())
                .select_from(CompanyMembership)
                .where(
                    CompanyMembership.company_id == company_id,
                    CompanyMembership.status == "active",
                    CompanyMembership.is_super_admin.is_(True),
                )
            )
        ).scalar()
        or 0
    )


async def _load_manage_target(db, company_id: int, user_id: int, actor: User):
    """成员管理的公共前置：公司存在、操作者是超管、目标成员存在。

    返回 (error_response, membership, user)；error_response 非空时直接返回给调用方。
    """
    company = await db.get(Company, company_id)
    if not company:
        return fail(404, 40400, "公司不存在"), None, None
    q = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.user_id == actor.id,
            CompanyMembership.status == "active",
        )
    )
    me = q.scalar_one_or_none()
    if not me or not me.is_super_admin:
        return fail(403, 40303, "需要公司超级管理员"), None, None
    tq = await db.execute(
        select(CompanyMembership, User)
        .join(User, User.id == CompanyMembership.user_id)
        .where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == user_id,
        )
    )
    row = tq.one_or_none()
    if not row:
        return fail(404, 40400, "成员不存在"), None, None
    return None, row[0], row[1]


@router.patch("/{company_id}/members/{user_id}")
async def patch_member(
    company_id: int,
    user_id: int,
    body: MembershipPatch,
    db: DbSession,
    user: CurrentUser,
):
    """修改企业成员角色或状态（停用 / 启用 / 设为组织负责人 / 设为超管）"""
    err, m, u = await _load_manage_target(db, company_id, user_id, user)
    if err is not None:
        return err
    if m.status == "removed":
        return fail(409, 40904, "该成员已被移出公司，请重新邀请后再管理")
    is_self = user_id == user.id
    # 防自锁：不能停用自己，也不能把自己的超管身份撤掉
    if is_self and body.status == "disabled":
        return fail(422, 42210, "不能停用自己的账号")
    if is_self and body.is_super_admin is False:
        return fail(422, 42211, "不能撤销自己的超级管理员身份，请先指定其他超管")
    # 防止公司只剩 0 个启用中的超管
    losing_admin = m.is_super_admin and m.status == "active" and (
        body.is_super_admin is False or body.status == "disabled"
    )
    if losing_admin and await _active_super_admin_count(db, company_id) <= 1:
        return fail(422, 42212, "公司至少要保留一名启用中的超级管理员")
    if body.is_org_leader is not None:
        m.is_org_leader = body.is_org_leader
    if body.is_super_admin is not None:
        m.is_super_admin = body.is_super_admin
    if body.status is not None:
        m.status = body.status
    if body.title is not None:
        m.title = body.title
    if body.employment_status is not None:
        m.employment_status = body.employment_status
    # 离职 / 停用：立即收项目 ACL
    if m.employment_status != "active" or m.status != "active":
        from app.services.membership_revoke import revoke_left_members

        await revoke_left_members(db, company_id=company_id)
    await db.commit()
    return ResponseData(data=_member_dto(m, u))


@router.delete("/{company_id}/members/{user_id}")
async def remove_member(
    company_id: int,
    user_id: int,
    db: DbSession,
    user: CurrentUser,
):
    """把成员移出公司：状态记为 removed，并收回其全部项目成员关系。

    不物理删除成员记录，历史任务、汇报与审计仍可追溯；被移出的人
    重新通过邀请注册 / 加入时会被恢复为启用状态。
    """
    err, m, u = await _load_manage_target(db, company_id, user_id, user)
    if err is not None:
        return err
    if user_id == user.id:
        return fail(422, 42213, "不能把自己移出公司")
    if m.is_super_admin and m.status == "active" and await _active_super_admin_count(db, company_id) <= 1:
        return fail(422, 42212, "公司至少要保留一名启用中的超级管理员")
    m.status = "removed"
    m.is_super_admin = False
    m.is_org_leader = False
    from app.services.membership_revoke import revoke_left_members

    await revoke_left_members(db, company_id=company_id)
    await db.commit()
    return ResponseData(data=_member_dto(m, u))


@router.get("/{company_id}/features")
async def get_features(company_id: int, db: DbSession, user: CurrentUser):
    """查看企业已开通的功能"""
    company = await db.get(Company, company_id)
    if not company:
        return fail(404, 40400, "公司不存在")
    q = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
    )
    if not q.scalar_one_or_none():
        return fail(403, 40302, "非本公司成员")
    svc = EntitlementService()
    unlocked = svc.is_company_unlocked(company)
    return ResponseData(
        data={
            "features": svc.feature_map(company) if unlocked else {},
            "unlocked": unlocked,
            "status": company.status,
        }
    )
