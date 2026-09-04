"""邀请接受的 HTTP 层：状态码与业务码，不只是 service 抛异常。

service 层用例见 test_invitations.py。这里盯的是路由把 PermissionError /
ValueError 翻译成 403/422 而不是漏成 500，以及单次使用在 API 上同样成立。
"""
import pytest
from sqlalchemy import select

from app.models.company import CompanyMembership
from app.models.project import Project
from app.services.project_service import ProjectService


def _body(response):
    return response.json()


async def _invite(db_session, seed_ids, invitee_user_id):
    svc = ProjectService()
    project = await db_session.get(Project, seed_ids["project_id"])
    invitation = await svc.create_invitation(
        db_session, project=project, invitee_user_id=invitee_user_id
    )
    await db_session.commit()
    return invitation.token


@pytest.mark.asyncio
async def test_accept_auto_joins_company_and_returns_project(
    async_client, db_session, seed_ids
):
    token = await _invite(db_session, seed_ids, seed_ids["outsider_user_id"])

    res = await async_client.post(
        f"/api/v1/projects/invitations/{token}/accept",
        headers=seed_ids["outsider_headers"],
    )
    assert res.status_code == 200, res.text
    data = _body(res)["data"]
    assert data["project_id"] == seed_ids["project_id"]

    membership = (
        await db_session.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == seed_ids["company_id"],
                CompanyMembership.user_id == seed_ids["outsider_user_id"],
            )
        )
    ).scalar_one()
    assert membership.status == "active"


@pytest.mark.asyncio
async def test_accept_twice_is_rejected_with_422(async_client, db_session, seed_ids):
    token = await _invite(db_session, seed_ids, seed_ids["outsider_user_id"])
    first = await async_client.post(
        f"/api/v1/projects/invitations/{token}/accept",
        headers=seed_ids["outsider_headers"],
    )
    assert first.status_code == 200, first.text

    second = await async_client.post(
        f"/api/v1/projects/invitations/{token}/accept",
        headers=seed_ids["outsider_headers"],
    )
    assert second.status_code == 422, second.text
    assert _body(second)["code"] == 42200


@pytest.mark.asyncio
async def test_accept_by_wrong_user_is_403(async_client, db_session, seed_ids):
    """点名邀请 outsider，member 拿 token 也不能用。"""
    token = await _invite(db_session, seed_ids, seed_ids["outsider_user_id"])

    res = await async_client.post(
        f"/api/v1/projects/invitations/{token}/accept",
        headers=seed_ids["member_headers"],
    )
    assert res.status_code == 403, res.text
    assert _body(res)["code"] == 40300


@pytest.mark.asyncio
async def test_inactive_membership_is_403_with_dedicated_code(
    async_client, db_session, seed_ids
):
    """离职成员不能靠邀请复活，且要给出可区分的业务码。"""
    db_session.add(
        CompanyMembership(
            company_id=seed_ids["company_id"],
            user_id=seed_ids["outsider_user_id"],
            status="inactive",
            employment_status="terminated",
            is_super_admin=False,
            is_org_leader=False,
        )
    )
    await db_session.commit()
    token = await _invite(db_session, seed_ids, seed_ids["outsider_user_id"])

    res = await async_client.post(
        f"/api/v1/projects/invitations/{token}/accept",
        headers=seed_ids["outsider_headers"],
    )
    assert res.status_code == 403, res.text
    assert _body(res)["code"] == 40314

    membership = (
        await db_session.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == seed_ids["company_id"],
                CompanyMembership.user_id == seed_ids["outsider_user_id"],
            )
        )
    ).scalar_one()
    assert membership.status == "inactive", "不得被邀请流程改回 active"
    assert membership.employment_status == "terminated"


@pytest.mark.asyncio
async def test_unknown_token_is_422(async_client, seed_ids):
    res = await async_client.post(
        "/api/v1/projects/invitations/definitely-not-a-token/accept",
        headers=seed_ids["outsider_headers"],
    )
    assert res.status_code == 422, res.text
