"""钉钉目录写入；完整拉取成功后再变更，绝不自动开户或恢复离职成员。"""
from datetime import datetime, timezone
from sqlalchemy import select

from app.models.company import OrgUnit
from app.models.sso import OrgDirectoryPerson
from app.services.sso.matching import match_member


async def run_dingtalk_sync(db, company_id, provider, corp_id):
    departments = await provider.fetch_departments()
    users = await provider.fetch_users()
    report = {"created": 0, "updated": 0, "failed": 0, "dept_upserted": 0, "users_matched": 0,
              "users_unmatched": 0, "left_count": 0, "errors": []}
    units = {unit.external_id: unit for unit in (await db.scalars(select(OrgUnit).where(
        OrgUnit.company_id == company_id, OrgUnit.source == "dingtalk"))).all()}
    for department in departments:
        unit = units.get(department.external_id)
        report["updated" if unit else "created"] += 1
        if not unit:
            unit = OrgUnit(company_id=company_id, source="dingtalk", external_id=department.external_id, path="/")
            db.add(unit)
            units[department.external_id] = unit
        unit.name, unit.is_active = department.name, True
        await db.flush()
        parent = units.get(department.parent_external_id)
        unit.parent_id = parent.id if parent else None
        unit.path = f"{parent.path}{unit.id}/" if parent else f"/{unit.id}/"
        report["dept_upserted"] += 1
    current_departments = {department.external_id for department in departments}
    for external_id, unit in units.items():
        if external_id not in current_departments and unit.is_active:
            unit.is_active = False
            report["updated"] += 1
    people = {person.external_id: person for person in (await db.scalars(select(OrgDirectoryPerson).where(
        OrgDirectoryPerson.company_id == company_id, OrgDirectoryPerson.source == "dingtalk"))).all()}
    for user in users:
        person = people.get(user.external_id)
        report["updated" if person else "created"] += 1
        if not person:
            person = OrgDirectoryPerson(company_id=company_id, source="dingtalk", external_id=user.external_id)
            db.add(person)
        person.union_id, person.name, person.email, person.mobile = user.union_id, user.name, user.email, user.mobile
        person.title, person.dept_external_ids = user.title, user.dept_external_ids
        person.synced_at = datetime.now(timezone.utc)
        person.is_active = True
        match = await match_member(db, company_id, provider="dingtalk", issuer=corp_id,
            external_id=user.union_id or "", email=user.email, mobile=user.mobile)
        person.user_id = None
        if match:
            membership, account = match
            if membership.status == "active" and membership.employment_status == "active" and account.is_active:
                person.user_id = account.id
                membership.title = user.title
                if user.dept_external_ids and user.dept_external_ids[0] in units:
                    membership.org_unit_id = units[user.dept_external_ids[0]].id
                report["users_matched"] += 1
            else:
                report["users_unmatched"] += 1
        else:
            report["users_unmatched"] += 1
    current_people = {user.external_id for user in users}
    for external_id, person in people.items():
        if external_id not in current_people and person.is_active:
            person.is_active = False
            person.user_id = None
            person.synced_at = datetime.now(timezone.utc)
            report["updated"] += 1
    if report["failed"]:
        raise ValueError("钉钉组织同步失败")
    await db.flush()
    return report
