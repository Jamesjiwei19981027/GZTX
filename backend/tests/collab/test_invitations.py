"""项目邀请：创建 / 接受 / 过期 / 归属校验。

历史缺陷（此前该路径零测试覆盖）：
1. accept_invitation 用 `inv.expires_at < datetime.now(timezone.utc)` 比较，
   而 SQLite 的 DATETIME 不存时区、读回来是 naive，默认 SQLite 部署下
   本接口必然抛 TypeError → 500，邀请功能整体不可用；
2. 邮箱邀请不校验受邀邮箱与当前用户是否一致，拿到链接的任何人都能入项目。
"""
import pytest
from sqlalchemy import select

from app.models.project import Project, ProjectInvitation
from app.services.project_service import ProjectService


@pytest.fixture
async def invitee_id(db_session, seed_ids):
    """一个「已是公司成员、但还不是项目成员」的用户 —— 邀请的正常目标。

    seed_ids 的 outsider 连公司成员都不是，pull_member 会先以
    not_company_member 拒绝，测不到邀请本身的逻辑。
    """
    from app.models.company import CompanyMembership

    uid = seed_ids["outsider_user_id"]
    db_session.add(
        CompanyMembership(
            company_id=seed_ids["company_id"],
            user_id=uid,
            status="active",
            is_super_admin=False,
            is_org_leader=False,
            employment_status="active",
        )
    )
    await db_session.commit()
    return uid


@pytest.mark.sqlite_only
@pytest.mark.asyncio
async def test_accept_invitation_works_on_sqlite(db_session, seed_ids, invitee_id):
    """回归：naive/aware 比较不得抛 TypeError"""
    svc = ProjectService()
    project = await db_session.get(Project, seed_ids["project_id"])
    outsider = invitee_id

    inv = await svc.create_invitation(
        db_session, project=project, invitee_user_id=outsider
    )
    await db_session.commit()
    token = inv.token

    # 关键：必须让 expires_at 真的从 SQLite 读回来（naive），否则身份映射里
    # 留着创建时那个 aware 值，测不出 naive/aware 比较的崩溃。
    # 真实场景就是这样——邀请在上一个请求里创建，接受时是全新会话。
    db_session.expire_all()
    reloaded = (
        await db_session.execute(
            select(ProjectInvitation).where(ProjectInvitation.token == token)
        )
    ).scalar_one()
    assert reloaded.expires_at.tzinfo is None, "SQLite 应读回 naive datetime"

    member = await svc.accept_invitation(db_session, token, outsider)
    await db_session.commit()

    assert member.user_id == outsider
    await db_session.refresh(reloaded)
    assert reloaded.status == "accepted"


@pytest.mark.asyncio
async def test_expired_invitation_rejected(db_session, seed_ids, invitee_id):
    from datetime import datetime, timedelta, timezone

    svc = ProjectService()
    project = await db_session.get(Project, seed_ids["project_id"])
    outsider = invitee_id

    inv = await svc.create_invitation(
        db_session, project=project, invitee_user_id=outsider
    )
    inv.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
    await db_session.commit()

    with pytest.raises(ValueError, match="过期"):
        await svc.accept_invitation(db_session, inv.token, outsider)


@pytest.mark.asyncio
async def test_invitation_bound_to_other_user_rejected(db_session, seed_ids, invitee_id):
    """点名邀请 A，B 拿着 token 也不能用"""
    svc = ProjectService()
    project = await db_session.get(Project, seed_ids["project_id"])

    inv = await svc.create_invitation(
        db_session, project=project, invitee_user_id=seed_ids["member_user_id"]
    )
    await db_session.commit()

    assert invitee_id != seed_ids["member_user_id"]
    with pytest.raises(PermissionError):
        await svc.accept_invitation(db_session, inv.token, invitee_id)


@pytest.mark.asyncio
async def test_email_invitation_requires_matching_email(db_session, seed_ids, invitee_id):
    """邮箱邀请必须由该邮箱的所有者接受，否则拿到链接的人即可入项目"""
    from app.models.user import User

    svc = ProjectService()
    project = await db_session.get(Project, seed_ids["project_id"])
    outsider = await db_session.get(User, invitee_id)

    inv = await svc.create_invitation(
        db_session, project=project, invitee_email="someone-else@example.com"
    )
    await db_session.commit()

    with pytest.raises(PermissionError):
        await svc.accept_invitation(db_session, inv.token, outsider.id)

    # 邮箱对得上则放行
    inv2 = await svc.create_invitation(
        db_session, project=project, invitee_email=outsider.email
    )
    await db_session.commit()
    member = await svc.accept_invitation(db_session, inv2.token, outsider.id)
    assert member.user_id == outsider.id


@pytest.mark.asyncio
async def test_accept_invitation_auto_joins_company_and_project(db_session, seed_ids):
    """首次被邀请者无需先被管理员手工加入公司。"""
    from app.models.company import CompanyMembership

    svc = ProjectService()
    project = await db_session.get(Project, seed_ids["project_id"])
    outsider_id = seed_ids["outsider_user_id"]
    assert (
        await db_session.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == project.company_id,
                CompanyMembership.user_id == outsider_id,
            )
        )
    ).scalar_one_or_none() is None

    invitation = await svc.create_invitation(
        db_session, project=project, invitee_user_id=outsider_id
    )
    await db_session.commit()

    member = await svc.accept_invitation(db_session, invitation.token, outsider_id)
    await db_session.commit()

    assert member.project_id == project.id
    assert member.user_id == outsider_id
    membership = (
        await db_session.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == project.company_id,
                CompanyMembership.user_id == outsider_id,
            )
        )
    ).scalar_one()
    assert membership.status == "active"
    assert membership.employment_status == "active"
    assert membership.is_super_admin is False
    assert membership.is_org_leader is False


@pytest.mark.asyncio
async def test_inactive_membership_cannot_be_revived_by_invitation(db_session, seed_ids):
    """停用/离职成员不能通过邀请链接自动复活。"""
    from app.models.company import CompanyMembership

    svc = ProjectService()
    project = await db_session.get(Project, seed_ids["project_id"])
    outsider_id = seed_ids["outsider_user_id"]
    db_session.add(
        CompanyMembership(
            company_id=project.company_id,
            user_id=outsider_id,
            status="inactive",
            employment_status="terminated",
            is_super_admin=False,
            is_org_leader=False,
        )
    )
    await db_session.commit()
    invitation = await svc.create_invitation(
        db_session, project=project, invitee_user_id=outsider_id
    )
    await db_session.commit()
    with pytest.raises(PermissionError, match="membership_inactive"):
        await svc.accept_invitation(db_session, invitation.token, outsider_id)


@pytest.mark.asyncio
async def test_used_invitation_cannot_be_reused(db_session, seed_ids, invitee_id):
    svc = ProjectService()
    project = await db_session.get(Project, seed_ids["project_id"])
    outsider = invitee_id

    inv = await svc.create_invitation(
        db_session, project=project, invitee_user_id=outsider
    )
    await db_session.commit()
    await svc.accept_invitation(db_session, inv.token, outsider)
    await db_session.commit()

    with pytest.raises(ValueError, match="邀请无效"):
        await svc.accept_invitation(db_session, inv.token, outsider)
