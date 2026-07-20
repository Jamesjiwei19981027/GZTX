import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_integration_and_sync(async_client: AsyncClient, seed_ids, db_session):
    from sqlalchemy import select
    from app.models.company import CompanyMembership

    cid = seed_ids["company_id"]
    member_id = seed_ids["member_user_id"]
    mq = await db_session.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == cid,
            CompanyMembership.user_id == member_id,
        )
    )
    m = mq.scalar_one()
    m.external_user_id = "api-ext-1"
    await db_session.commit()

    r = await async_client.post(
        f"/api/v1/companies/{cid}/integrations",
        headers=seed_ids["super_admin_headers"],
        json={
            "provider": "generic_scim",
            "credentials": {"token": "t"},
            "config": {
                "static_snapshot": {
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
                            "external_id": "api-ext-1",
                            "name": "成员",
                            "email": "member_user@example.com",
                            "mobile": None,
                            "dept_external_ids": ["d1"],
                            "employment": "active",
                            "title": "工程师",
                        }
                    ],
                }
            },
        },
    )
    assert r.status_code == 200
    assert r.json()["data"]["provider"] == "generic_scim"

    r2 = await async_client.post(
        f"/api/v1/companies/{cid}/org-sync",
        headers=seed_ids["super_admin_headers"],
    )
    assert r2.status_code == 200
    assert r2.json()["data"]["status"] == "completed"
    assert r2.json()["data"]["report"]["dept_upserted"] >= 1
