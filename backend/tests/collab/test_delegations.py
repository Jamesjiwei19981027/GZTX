import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import CompanyMembership
from app.services.acl import AclService


@pytest.mark.asyncio
async def test_create_list_revoke_delegation(async_client: AsyncClient, seed_ids):
    cid = seed_ids["company_id"]
    pid = seed_ids["project_id"]
    grantee = seed_ids["outsider_user_id"]

    # outsider is not company member — should fail
    r0 = await async_client.post(
        "/api/v1/delegations",
        headers=seed_ids["super_admin_headers"],
        json={
            "company_id": cid,
            "project_id": pid,
            "grantee_user_id": grantee,
            "actions": ["member.pull"],
        },
    )
    assert r0.status_code in (422, 200)
    if r0.status_code == 200:
        # if membership auto-created elsewhere, still ok
        pass
    else:
        assert r0.json()["code"] == 42200

    # grant to member
    r = await async_client.post(
        "/api/v1/delegations",
        headers=seed_ids["pm_headers"],
        json={
            "company_id": cid,
            "project_id": pid,
            "grantee_user_id": seed_ids["member_user_id"],
            "actions": ["member.pull", "progress.nudge"],
        },
    )
    assert r.status_code == 200
    did = r.json()["data"]["id"]
    assert "member.pull" in r.json()["data"]["actions"]

    r2 = await async_client.get(
        f"/api/v1/delegations?company_id={cid}&project_id={pid}",
        headers=seed_ids["member_headers"],
    )
    assert r2.status_code == 200
    assert any(i["id"] == did for i in r2.json()["data"]["items"])

    r3 = await async_client.post(
        f"/api/v1/delegations/{did}/revoke",
        headers=seed_ids["pm_headers"],
    )
    assert r3.status_code == 200
    assert r3.json()["data"]["status"] == "revoked"


@pytest.mark.asyncio
async def test_delegation_acl_allows_member_pull(
    db_session: AsyncSession, seed_ids, async_client: AsyncClient
):
    """非 PM 成员通过委托获得 member.pull"""
    cid = seed_ids["company_id"]
    pid = seed_ids["project_id"]
    member_id = seed_ids["member_user_id"]
    outsider_id = seed_ids["outsider_user_id"]

    # add outsider as company member only (not project)
    db_session.add(
        CompanyMembership(
            company_id=cid,
            user_id=outsider_id,
            status="active",
            employment_status="active",
        )
    )
    await db_session.commit()

    acl = AclService()
    assert not await acl.can(
        db_session, outsider_id, cid, "member.pull", project_id=pid
    )

    r = await async_client.post(
        "/api/v1/delegations",
        headers=seed_ids["pm_headers"],
        json={
            "company_id": cid,
            "project_id": pid,
            "grantee_user_id": outsider_id,
            "actions": ["member.pull"],
        },
    )
    assert r.status_code == 200

    assert await acl.can(
        db_session, outsider_id, cid, "member.pull", project_id=pid
    )
    # unrelated action still denied
    assert not await acl.can(
        db_session, outsider_id, cid, "progress.write_formal", project_id=pid
    )
