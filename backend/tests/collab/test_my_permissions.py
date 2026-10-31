"""GET /projects/{id}/my-permissions 六类角色口径回归

覆盖：PM / 有负责节点的成员 / 无负责节点的成员 / 委托授权用户 /
非成员公司超管 / 外人 403。委托是项目粒度 → can_edit_all，
但 move/delete 只认 tree.edit_any（不可委托）。
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, get_password_hash
from app.models.company import CompanyMembership
from app.models.project import ProjectMember
from app.models.user import User


def _headers(user_id: int) -> dict:
    token = create_access_token(data={"sub": user_id})
    return {"Authorization": f"Bearer {token}"}


async def _make_extra_user(db: AsyncSession, username: str) -> User:
    from datetime import datetime as _dt

    u = User(
        username=username,
        email=f"{username}@example.com",
        email_verified_at=_dt.utcnow(),
        phone_verified_at=_dt.utcnow(),
        password_hash=get_password_hash("password123"),
        nickname=username,
        is_active=True,
    )
    db.add(u)
    await db.flush()
    return u


async def _get_perms(client: AsyncClient, pid: int, headers: dict) -> dict:
    r = await client.get(f"/api/v1/projects/{pid}/my-permissions", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["data"]


@pytest.mark.asyncio
async def test_pm_permissions(async_client: AsyncClient, seed_ids):
    d = await _get_perms(async_client, seed_ids["project_id"], seed_ids["pm_headers"])
    assert d["role"] == "pm"
    assert d["is_pm"] is True
    assert d["is_superadmin"] is False
    assert d["can_edit_all"] is True
    assert d["via_delegation"] is False
    assert d["can_move"] is True
    assert d["can_delete"] is True
    assert d["can_submit_evidence"] is True
    assert d["can_read_evidence"] is True


@pytest.mark.asyncio
async def test_member_with_owned_nodes(async_client: AsyncClient, seed_ids):
    """seed 里 member 是 root 与 work_item 的 primary → 锚点回传，全树编辑不放行"""
    d = await _get_perms(async_client, seed_ids["project_id"], seed_ids["member_headers"])
    assert d["role"] == "member"
    assert d["is_pm"] is False
    assert d["can_edit_all"] is False
    assert d["via_delegation"] is False
    assert d["can_move"] is False
    assert d["can_delete"] is False
    # 只返回指派锚点节点 id，由前端沿树下传（与 _owns_path 前缀口径一致）
    assert set(d["owned_node_ids"]) == {seed_ids["root_node_id"], seed_ids["node_id"]}


@pytest.mark.asyncio
async def test_member_without_owned_nodes(
    async_client: AsyncClient, db_session: AsyncSession, seed_ids
):
    plain = await _make_extra_user(db_session, "plain_member")
    db_session.add(
        CompanyMembership(
            company_id=seed_ids["company_id"],
            user_id=plain.id,
            status="active",
            employment_status="active",
        )
    )
    db_session.add(ProjectMember(project_id=seed_ids["project_id"], user_id=plain.id, role="member"))
    await db_session.commit()

    d = await _get_perms(async_client, seed_ids["project_id"], _headers(plain.id))
    assert d["role"] == "member"
    assert d["can_edit_all"] is False
    assert d["owned_node_ids"] == []
    assert d["can_move"] is False
    assert d["can_delete"] is False
    assert d["can_submit_evidence"] is True
    assert d["can_read_evidence"] is True


@pytest.mark.asyncio
async def test_delegated_user_gets_edit_all_but_not_move(
    async_client: AsyncClient, db_session: AsyncSession, seed_ids
):
    """委托授权用户：公司成员但非项目成员，委托 tree.edit_subtree 是项目粒度 →
    can_edit_all=True / via_delegation=True；move/delete 仍拿不到"""
    cid = seed_ids["company_id"]
    pid = seed_ids["project_id"]
    outsider_id = seed_ids["outsider_user_id"]

    db_session.add(
        CompanyMembership(
            company_id=cid,
            user_id=outsider_id,
            status="active",
            employment_status="active",
        )
    )
    await db_session.commit()

    r = await async_client.post(
        "/api/v1/delegations",
        headers=seed_ids["pm_headers"],
        json={
            "company_id": cid,
            "project_id": pid,
            "grantee_user_id": outsider_id,
            # progress.read 让被授权人能进项目视图（与其他读接口同门禁）
            "actions": ["progress.read", "tree.edit_subtree"],
        },
    )
    assert r.status_code == 200, r.text

    d = await _get_perms(async_client, pid, seed_ids["outsider_headers"])
    assert d["role"] == "outsider"
    assert d["is_pm"] is False
    assert d["is_superadmin"] is False
    assert d["can_edit_all"] is True
    assert d["via_delegation"] is True
    assert d["owned_node_ids"] == []
    assert d["can_move"] is False
    assert d["can_delete"] is False
    assert d["can_submit_evidence"] is False


@pytest.mark.asyncio
async def test_non_member_superadmin(
    async_client: AsyncClient, db_session: AsyncSession, seed_ids
):
    """非项目成员的公司超管：客户端推断不出来的第二个盲区"""
    root_admin = await _make_extra_user(db_session, "root_admin")
    db_session.add(
        CompanyMembership(
            company_id=seed_ids["company_id"],
            user_id=root_admin.id,
            status="active",
            is_super_admin=True,
            employment_status="active",
        )
    )
    await db_session.commit()

    d = await _get_perms(async_client, seed_ids["project_id"], _headers(root_admin.id))
    assert d["role"] == "superadmin"
    assert d["is_pm"] is False
    assert d["is_superadmin"] is True
    assert d["can_edit_all"] is True
    assert d["via_delegation"] is False
    assert d["can_move"] is True
    assert d["can_delete"] is True


@pytest.mark.asyncio
async def test_outsider_403_and_missing_project_404(async_client: AsyncClient, seed_ids):
    r = await async_client.get(
        f"/api/v1/projects/{seed_ids['project_id']}/my-permissions",
        headers=seed_ids["outsider_headers"],
    )
    assert r.status_code == 403, r.text
    assert r.json()["code"] == 40301

    r = await async_client.get(
        "/api/v1/projects/999999/my-permissions",
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 404, r.text
    assert r.json()["code"] == 40400
