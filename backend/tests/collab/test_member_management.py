"""团队成员管理：改角色、停用/启用、移除、停用后登录提示、重新拉入项目"""
import pytest
from sqlalchemy import select

from app.models.project import ProjectMember

API = "/api/v1"


def _url(seed, uid):
    return f"{API}/companies/{seed['company_id']}/members/{uid}"


@pytest.mark.asyncio
async def test_super_admin_can_change_role_and_title(async_client, seed_ids):
    r = await async_client.patch(
        _url(seed_ids, seed_ids["member_user_id"]),
        json={"is_org_leader": True, "title": "研发主管"},
        headers=seed_ids["super_admin_headers"],
    )
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["is_org_leader"] is True and data["title"] == "研发主管"


@pytest.mark.asyncio
async def test_non_admin_cannot_manage_members(async_client, seed_ids):
    r = await async_client.patch(
        _url(seed_ids, seed_ids["member_user_id"]),
        json={"status": "disabled"},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 403
    r = await async_client.delete(
        _url(seed_ids, seed_ids["member_user_id"]), headers=seed_ids["member_headers"]
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_invalid_status_rejected(async_client, seed_ids):
    r = await async_client.patch(
        _url(seed_ids, seed_ids["member_user_id"]),
        json={"status": "banana"},
        headers=seed_ids["super_admin_headers"],
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_cannot_disable_self_or_last_super_admin(async_client, seed_ids):
    r = await async_client.patch(
        _url(seed_ids, seed_ids["admin_user_id"]),
        json={"status": "disabled"},
        headers=seed_ids["super_admin_headers"],
    )
    assert r.status_code == 422
    r = await async_client.patch(
        _url(seed_ids, seed_ids["admin_user_id"]),
        json={"is_super_admin": False},
        headers=seed_ids["super_admin_headers"],
    )
    assert r.status_code == 422
    r = await async_client.delete(
        _url(seed_ids, seed_ids["admin_user_id"]), headers=seed_ids["super_admin_headers"]
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_disable_revokes_projects_enable_then_pull_back(async_client, seed_ids, db_session):
    member = seed_ids["member_user_id"]
    pid = seed_ids["project_id"]
    r = await async_client.patch(
        _url(seed_ids, member), json={"status": "disabled"}, headers=seed_ids["super_admin_headers"]
    )
    assert r.status_code == 200 and r.json()["data"]["status"] == "disabled"
    db_session.expire_all()
    pm = (
        await db_session.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == pid, ProjectMember.user_id == member
            )
        )
    ).scalar_one()
    assert pm.left_at is not None

    # 启用后项目成员关系不会自动恢复，需由 PM 在团队页「拉入项目」
    r = await async_client.patch(
        _url(seed_ids, member), json={"status": "active"}, headers=seed_ids["super_admin_headers"]
    )
    assert r.status_code == 200 and r.json()["data"]["status"] == "active"
    r = await async_client.get(f"{API}/projects/{pid}/members", headers=seed_ids["pm_headers"])
    active_ids = [m["user_id"] for m in r.json()["data"]["items"] if not m.get("left_at")]
    assert member not in active_ids

    r = await async_client.post(
        f"{API}/projects/{pid}/members",
        json={"user_id": member},
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200, r.text
    db_session.expire_all()
    pm = (
        await db_session.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == pid, ProjectMember.user_id == member
            )
        )
    ).scalar_one()
    assert pm.left_at is None


@pytest.mark.asyncio
async def test_disabled_member_login_gets_clear_message(async_client, seed_ids):
    await async_client.patch(
        _url(seed_ids, seed_ids["member_user_id"]),
        json={"status": "disabled"},
        headers=seed_ids["super_admin_headers"],
    )
    r = await async_client.post(
        f"{API}/auth/login", json={"username": "member_user", "password": "password123"}
    )
    assert r.status_code == 403
    assert "停用" in r.json()["detail"]
    # 未被停用的成员照常登录
    ok = await async_client.post(
        f"{API}/auth/login", json={"username": "pm_user", "password": "password123"}
    )
    assert ok.status_code == 200, ok.text


@pytest.mark.asyncio
async def test_remove_member_hides_from_list_and_revokes(async_client, seed_ids, db_session):
    member = seed_ids["member_user_id"]
    r = await async_client.delete(_url(seed_ids, member), headers=seed_ids["super_admin_headers"])
    assert r.status_code == 200, r.text
    assert r.json()["data"]["status"] == "removed"
    r = await async_client.get(
        f"{API}/companies/{seed_ids['company_id']}/members",
        headers=seed_ids["super_admin_headers"],
    )
    ids = [m["user_id"] for m in r.json()["data"]["items"]]
    assert member not in ids
    r = await async_client.get(
        f"{API}/companies/{seed_ids['company_id']}/members?status=removed",
        headers=seed_ids["super_admin_headers"],
    )
    assert member in [m["user_id"] for m in r.json()["data"]["items"]]
    db_session.expire_all()
    pm = (
        await db_session.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == seed_ids["project_id"],
                ProjectMember.user_id == member,
            )
        )
    ).scalar_one()
    assert pm.left_at is not None
    # 已移出的人不能再被 PATCH
    r = await async_client.patch(
        _url(seed_ids, member), json={"status": "active"}, headers=seed_ids["super_admin_headers"]
    )
    assert r.status_code == 409
    r = await async_client.post(
        f"{API}/auth/login", json={"username": "member_user", "password": "password123"}
    )
    assert r.status_code == 403
