"""企业登录方式规则：无租户选择的全局登录必须满足所有有效任职公司的限制。"""
from fastapi import HTTPException
from sqlalchemy import select
from app.models.company import Company, CompanyMembership
from app.services.policy_presets import DEFAULT_LOGIN_METHODS


def login_enabled(company: Company, method: str) -> bool:
    return bool({**DEFAULT_LOGIN_METHODS, **(company.login_methods_json or {})}.get(method, False))


def validate_login_methods(values):
    if any(values.get(key) for key in ("wecom", "feishu", "saml")):
        raise HTTPException(status_code=422, detail="企业微信、飞书及联合身份认证下一期支持")


async def enforce_user_login_method(db, user_id: int, method: str):
    rows = (await db.execute(select(CompanyMembership, Company).join(
        Company, Company.id == CompanyMembership.company_id).where(
            CompanyMembership.user_id == user_id, CompanyMembership.status == "active",
            CompanyMembership.employment_status == "active"))).all()
    for membership, company in rows:
        # 仅该公司的有效在职超管保留密码入口；不是全站绕过其他企业规则。
        if method == "password" and membership.is_super_admin:
            continue
        if not login_enabled(company, method):
            raise HTTPException(status_code=403, detail="企业已关闭该登录方式，请使用管理员启用的登录入口")
