"""单公司 bootstrap 与 SaaS 开通"""
from copy import deepcopy
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company, CompanyLicense, CompanyMembership, ServiceActivation
from app.services.policy_presets import (
    DEFAULT_ENTITLEMENT,
    DEFAULT_LOGIN_METHODS,
    POLICY_PRESETS,
)


async def bootstrap_single_company(
    db: AsyncSession,
    *,
    name: str,
    slug: str,
    admin_user_id: int,
    policy_preset: str = "standard",
    activate: bool = False,
    license_payload: str | None = None,
    signature: str | None = None,
) -> Company:
    existing = await db.execute(select(Company).where(Company.slug == slug))
    if existing.scalar_one_or_none():
        raise ValueError(f"slug 已占用: {slug}")

    preset = policy_preset if policy_preset in POLICY_PRESETS else "standard"
    company = Company(
        name=name,
        slug=slug,
        status="pending_license",
        deploy_hint="single_company",
        policy_preset=preset,
        policy_json=dict(POLICY_PRESETS[preset]),
        entitlement_json=deepcopy(DEFAULT_ENTITLEMENT),
        login_methods_json=dict(DEFAULT_LOGIN_METHODS),
    )
    db.add(company)
    await db.flush()

    membership = CompanyMembership(
        company_id=company.id,
        user_id=admin_user_id,
        status="active",
        is_super_admin=True,
        is_org_leader=True,
        employment_status="active",
    )
    db.add(membership)

    if activate:
        company.status = "active"
        company.entitlement_json = deepcopy(DEFAULT_ENTITLEMENT)

    if license_payload and signature:
        from app.services.license_verify import verify_license_payload

        data = verify_license_payload(license_payload, signature)
        await _apply_license(db, company, license_payload, signature, data)

    await db.flush()
    return company


async def _apply_license(
    db: AsyncSession,
    company: Company,
    payload: str,
    signature: str,
    data: dict,
) -> CompanyLicense:
    features = data.get("features") or {}
    quotas = data.get("quotas") or {}
    valid_to_raw = data.get("valid_to")
    valid_to = None
    if valid_to_raw:
        valid_to = datetime.fromisoformat(str(valid_to_raw).replace("Z", "+00:00"))

    lic = CompanyLicense(
        company_id=company.id,
        license_payload=payload,
        signature=signature,
        valid_to=valid_to,
        features_json=features,
    )
    db.add(lic)

    ent = deepcopy(company.entitlement_json or DEFAULT_ENTITLEMENT)
    ent.setdefault("features", {}).update(features)
    ent.setdefault("quotas", {}).update(quotas)
    if valid_to_raw:
        ent["valid_to"] = valid_to_raw
    if data.get("on_expire"):
        ent["on_expire"] = data["on_expire"]
    company.entitlement_json = ent
    company.status = "active"
    await db.flush()
    return lic


async def apply_license_to_company(
    db: AsyncSession,
    company: Company,
    payload: str,
    signature: str,
) -> dict:
    from app.services.license_verify import verify_license_payload

    data = verify_license_payload(payload, signature)
    expected_slug = data.get("company_slug")
    if expected_slug and expected_slug != company.slug:
        raise ValueError("license 与公司 slug 不匹配")
    lic = await _apply_license(db, company, payload, signature, data)
    return {
        "status": company.status,
        "valid_to": data.get("valid_to"),
        "features": data.get("features") or {},
        "license_id": lic.id,
    }


async def saas_open_company(
    db: AsyncSession,
    *,
    name: str,
    slug: str,
    admin_user_id: int,
    plan_code: str = "standard",
) -> Company:
    company = await bootstrap_single_company(
        db,
        name=name,
        slug=slug,
        admin_user_id=admin_user_id,
        policy_preset="standard",
        activate=True,
    )
    company.deploy_hint = "saas"
    act = ServiceActivation(
        company_id=company.id,
        plan_code=plan_code,
        status="active",
        valid_from=datetime.now(timezone.utc),
        entitlement_override_json=None,
    )
    db.add(act)
    await db.flush()
    return company
