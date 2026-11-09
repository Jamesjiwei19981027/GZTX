import json
from datetime import datetime, timedelta, timezone
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_collaboration_user
from app.core.security import create_access_token, get_password_hash
from app.models.category import Category
from app.models.company import Company, CompanyLicense, CompanyMembership
from app.models.project import Project, ProjectInvitation, ProjectMember
from app.models.user import User
from app.services.license_verify import sign_license_dev
from fastapi import HTTPException


def _headers(user_id: int) -> dict:
    token = create_access_token(data={"sub": user_id})
    return {"Authorization": f"Bearer {token}"}


async def _create_test_company(db: AsyncSession, admin_user: User, slug: str = "launch-test") -> Company:
    company = Company(
        name="上线测试公司",
        slug=slug,
        status="pending_license",
    )
    db.add(company)
    await db.flush()

    # 添加 License 使得 project_tree 功能开通
    payload = {
        "company_slug": slug,
        "features": {"project_tree": True},
        "quotas": {"max_users": 50, "max_projects": 20},
        "valid_to": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
    }
    raw = json.dumps(payload, sort_keys=True)
    sig = sign_license_dev(raw, settings.LICENSE_PUBLIC_KEY)
    
    from app.services.company_bootstrap import apply_license_to_company
    await apply_license_to_company(db, company, raw, sig)

    # 管理员成员记录（同时也是 org_leader）
    membership = CompanyMembership(
        company_id=company.id,
        user_id=admin_user.id,
        status="active",
        employment_status="active",
        is_super_admin=True,
        is_org_leader=True,
    )
    db.add(membership)
    await db.commit()
    await db.refresh(company)
    return company


async def _create_test_project(db: AsyncSession, company: Company, pm_user: User) -> Project:
    project = Project(
        company_id=company.id,
        name="测试协作项目",
        status="active",
        created_by=pm_user.id,
        pm_user_id=pm_user.id,
    )
    db.add(project)
    await db.flush()
    member = ProjectMember(
        project_id=project.id,
        user_id=pm_user.id,
        role="pm",
    )
    db.add(member)
    await db.commit()
    await db.refresh(project)
    return project


# ===== 1. 生产门禁测试 =====

def test_production_guard_phone_required_and_fake_sms(monkeypatch):
    """生产门禁：PHONE_VERIFICATION_REQUIRED=true + fake 短信 → 校验报错"""
    monkeypatch.setattr(settings, "DEBUG", False)
    monkeypatch.setattr(settings, "SECRET_KEY", "a9f8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0")
    monkeypatch.setattr(settings, "LICENSE_PUBLIC_KEY", "b9f8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0")
    monkeypatch.setattr(settings, "LICENSE_VERIFY_MODE", "ed25519")
    monkeypatch.setattr(settings, "ALLOW_FAKE_SSO", False)
    monkeypatch.setattr(settings, "EXPOSE_API_DOCS", False)
    monkeypatch.setattr(settings, "IMAP_USER", "")

    # 开启手机验证但使用 fake 短信提供商
    monkeypatch.setattr(settings, "PHONE_VERIFICATION_REQUIRED", True)
    monkeypatch.setattr(settings, "SMS_PROVIDER", "fake")

    with pytest.raises(RuntimeError, match="PHONE_VERIFICATION_REQUIRED=true 但 SMS_PROVIDER 为 fake"):
        settings.validate_production_secrets()

    # 改为真实提供商如 aliyun 则通过
    monkeypatch.setattr(settings, "SMS_PROVIDER", "aliyun")
    settings.validate_production_secrets()


# ===== 2. GET /auth/registration-config 只读接口 =====

@pytest.mark.asyncio
async def test_get_registration_config(client: AsyncClient, monkeypatch):
    """GET /auth/registration-config 匿名只读接口返回 mode 与 phone_required"""
    res = await client.get("/api/v1/auth/registration-config")
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert data["mode"] == "open"
    assert data["phone_required"] is False

    monkeypatch.setattr(settings, "REGISTRATION_MODE", "invite_only")
    monkeypatch.setattr(settings, "PHONE_VERIFICATION_REQUIRED", True)
    res2 = await client.get("/api/v1/auth/registration-config")
    assert res2.status_code == 200
    data2 = res2.json()["data"]
    assert data2["mode"] == "invite_only"
    assert data2["phone_required"] is True


# ===== 3. get_collaboration_user 依赖与协作权限 =====

@pytest.mark.asyncio
async def test_collaboration_user_dependency(monkeypatch):
    """依赖层检查：默认只验邮箱即可；PHONE_VERIFICATION_REQUIRED=true 时未验手机被 403"""
    now = datetime.utcnow()
    email_only_user = User(
        id=101,
        username="emailonly",
        email="emailonly@example.com",
        email_verified_at=now,
        phone_verified_at=None,
    )
    unverified_user = User(
        id=102,
        username="unverified",
        email="unverified@example.com",
        email_verified_at=None,
        phone_verified_at=None,
    )
    full_user = User(
        id=103,
        username="fulluser",
        email="full@example.com",
        phone="13800000001",
        email_verified_at=now,
        phone_verified_at=now,
    )

    # 默认配置下：只验邮箱的用户通过协作门槛
    monkeypatch.setattr(settings, "PHONE_VERIFICATION_REQUIRED", False)
    u = await get_collaboration_user(email_only_user)
    assert u.id == email_only_user.id

    # 未验邮箱：提示先完成邮箱验证
    with pytest.raises(HTTPException) as exc_info:
        await get_collaboration_user(unverified_user)
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["message"] == "请先完成邮箱验证"

    # PHONE_VERIFICATION_REQUIRED=True 时：未验手机被 403
    monkeypatch.setattr(settings, "PHONE_VERIFICATION_REQUIRED", True)
    with pytest.raises(HTTPException) as exc_info2:
        await get_collaboration_user(email_only_user)
    assert exc_info2.value.status_code == 403
    assert exc_info2.value.detail["message"] == "协作功能需要完成手机验证"

    # 双验证均完成的用户通过
    u_full = await get_collaboration_user(full_user)
    assert u_full.id == full_user.id


# ===== 4. 协作建项目与接受邀请 API 行为 =====

@pytest.mark.asyncio
async def test_collaboration_endpoints_phone_verification_switch(
    client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    """默认配置下：只验邮箱的用户能建项目、能接受邀请；PHONE_VERIFICATION_REQUIRED=true 时被 403"""
    now = datetime.utcnow()
    # 邮箱验证、手机未验证的用户
    user1 = User(
        username="collabuser1",
        email="collabuser1@example.com",
        password_hash=get_password_hash("pass123"),
        email_verified_at=now,
        phone_verified_at=None,
    )
    user2 = User(
        username="collabuser2",
        email="collabuser2@example.com",
        password_hash=get_password_hash("pass123"),
        email_verified_at=now,
        phone_verified_at=None,
    )
    db_session.add_all([user1, user2])
    await db_session.commit()
    await db_session.refresh(user1)
    await db_session.refresh(user2)

    company = await _create_test_company(db_session, user1, slug="collab-co")
    project = await _create_test_project(db_session, company, user1)

    # user1 产生一个针对 user2 邮箱的邀请
    inv = ProjectInvitation(
        project_id=project.id,
        invitee_email="collabuser2@example.com",
        token="inv-token-for-user2",
        status="pending",
        expires_at=datetime.now(timezone.utc) + timedelta(days=3),
    )
    db_session.add(inv)
    await db_session.commit()

    # 4.1 默认配置下：user1 可以建项目（POST /api/v1/projects）
    monkeypatch.setattr(settings, "PHONE_VERIFICATION_REQUIRED", False)
    res_create = await client.post(
        "/api/v1/projects",
        json={"company_id": company.id, "name": "新项目A"},
        headers=_headers(user1.id),
    )
    assert res_create.status_code == 200, res_create.text

    # 4.2 默认配置下：user2 可以接受邀请（POST /api/v1/projects/invitations/{token}/accept）
    res_accept = await client.post(
        f"/api/v1/projects/invitations/{inv.token}/accept",
        headers=_headers(user2.id),
    )
    assert res_accept.status_code == 200, res_accept.text
    assert res_accept.json()["data"]["project_id"] == project.id

    # 4.2b 默认配置下：只验邮箱的用户能建带公司/项目的协作任务（点测 B-02 回归）
    monkeypatch.setattr(settings, "REGISTER_VERIFICATION_REQUIRED", True)
    cat = Category(user_id=user1.id, name="默认", is_default=True)
    db_session.add(cat)
    await db_session.commit()
    await db_session.refresh(cat)
    res_task = await client.post(
        "/api/v1/tasks",
        json={"title": "协作任务A", "company_id": company.id, "category_id": cat.id},
        headers=_headers(user1.id),
    )
    assert res_task.status_code in (200, 201), res_task.text

    monkeypatch.setattr(settings, "PHONE_VERIFICATION_REQUIRED", True)
    res_task_fail = await client.post(
        "/api/v1/tasks",
        json={"title": "协作任务B", "company_id": company.id, "category_id": cat.id},
        headers=_headers(user1.id),
    )
    assert res_task_fail.status_code == 403
    assert res_task_fail.json()["detail"]["message"] == "协作任务需要完成手机验证"
    monkeypatch.setattr(settings, "PHONE_VERIFICATION_REQUIRED", False)

    # 4.3 PHONE_VERIFICATION_REQUIRED=True 时：被 403 拦截
    monkeypatch.setattr(settings, "PHONE_VERIFICATION_REQUIRED", True)

    res_create_fail = await client.post(
        "/api/v1/projects",
        json={"company_id": company.id, "name": "新项目B"},
        headers=_headers(user1.id),
    )
    assert res_create_fail.status_code == 403
    assert res_create_fail.json()["detail"]["message"] == "协作功能需要完成手机验证"

    inv2 = ProjectInvitation(
        project_id=project.id,
        invitee_email="collabuser2@example.com",
        token="inv-token-2",
        status="pending",
        expires_at=datetime.now(timezone.utc) + timedelta(days=3),
    )
    db_session.add(inv2)
    await db_session.commit()

    res_accept_fail = await client.post(
        f"/api/v1/projects/invitations/{inv2.token}/accept",
        headers=_headers(user2.id),
    )
    assert res_accept_fail.status_code == 403
    assert res_accept_fail.json()["detail"]["message"] == "协作功能需要完成手机验证"


# ===== 5. invite_only 模式测试 =====

@pytest.mark.asyncio
async def test_invite_only_send_code_and_register(
    client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    """invite_only 测试全覆盖：
    - send-code 无邀请被拒
    - 无邀请注册 403
    - 邀请邮箱不一致 403
    - 邀请过期 403
    - 有效邀请注册成功并成为项目成员且返回 project_id
    """
    monkeypatch.setattr(settings, "DEBUG", True)
    monkeypatch.setattr(settings, "REGISTRATION_MODE", "invite_only")

    # 创建测试公司与项目
    admin = User(
        username="admininvite",
        email="admininvite@example.com",
        password_hash=get_password_hash("pass123"),
        email_verified_at=datetime.utcnow(),
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)

    company = await _create_test_company(db_session, admin, slug="invite-only-co")
    project = await _create_test_project(db_session, company, admin)

    # 创建过期邀请
    expired_inv = ProjectInvitation(
        project_id=project.id,
        invitee_email="expired@example.com",
        token="expired-token-123",
        status="pending",
        expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    # 创建有效邀请（指定邮箱）
    valid_inv = ProjectInvitation(
        project_id=project.id,
        invitee_email="inviteduser@example.com",
        token="valid-token-123",
        status="pending",
        expires_at=datetime.now(timezone.utc) + timedelta(days=2),
    )
    db_session.add_all([expired_inv, valid_inv])
    await db_session.commit()

    # 5.1 send-code 无邀请被拒
    res_code_no_inv = await client.post(
        "/api/v1/auth/send-code",
        json={"channel": "email", "target": "inviteduser@example.com", "purpose": "register"},
    )
    assert res_code_no_inv.status_code == 403
    assert "当前仅支持受邀注册" in res_code_no_inv.json()["detail"]

    # 5.2 send-code 邀请邮箱不一致被拒
    res_code_mismatch = await client.post(
        "/api/v1/auth/send-code",
        json={
            "channel": "email",
            "target": "other@example.com",
            "purpose": "register",
            "invite_token": "valid-token-123",
        },
    )
    assert res_code_mismatch.status_code == 403
    assert "当前仅支持受邀注册" in res_code_mismatch.json()["detail"]

    # 5.3 send-code 有效邀请发码成功
    res_code_ok = await client.post(
        "/api/v1/auth/send-code",
        json={
            "channel": "email",
            "target": "inviteduser@example.com",
            "purpose": "register",
            "invite_token": "valid-token-123",
        },
    )
    assert res_code_ok.status_code == 200, res_code_ok.text
    email_code = res_code_ok.json()["data"]["debug_code"]

    # 5.4 注册：无邀请注册 403
    res_reg_no_inv = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "user_no_inv",
            "password": "password123",
            "email": "inviteduser@example.com",
            "email_code": email_code,
        },
    )
    assert res_reg_no_inv.status_code == 403
    assert "当前仅支持受邀注册" in res_reg_no_inv.json()["detail"]

    # 5.5 注册：邀请邮箱不一致 403
    res_reg_mismatch = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "user_mismatch",
            "password": "password123",
            "email": "mismatch@example.com",
            "email_code": email_code,
            "invite_token": "valid-token-123",
        },
    )
    assert res_reg_mismatch.status_code == 403
    assert "当前仅支持受邀注册" in res_reg_mismatch.json()["detail"]

    # 5.6 注册：邀请过期 403
    res_reg_expired = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "user_expired",
            "password": "password123",
            "email": "expired@example.com",
            "email_code": "123456",
            "invite_token": "expired-token-123",
        },
    )
    assert res_reg_expired.status_code == 403
    assert "当前仅支持受邀注册" in res_reg_expired.json()["detail"]

    # 5.7 注册：有效邀请注册成功并成为项目成员且返回 project_id
    res_reg_ok = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "inviteduser",
            "password": "password123",
            "email": "inviteduser@example.com",
            "email_code": email_code,
            "invite_token": "valid-token-123",
        },
    )
    assert res_reg_ok.status_code == 201, res_reg_ok.text
    reg_data = res_reg_ok.json()["data"]
    assert reg_data["project_id"] == project.id
    new_user_id = reg_data["user"]["id"]

    # 验证数据库中成员关系与邀请状态
    m_res = await db_session.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == new_user_id,
        )
    )
    pmember = m_res.scalar_one_or_none()
    assert pmember is not None
    assert pmember.role == "member"

    # 邀请状态已置为 accepted
    await db_session.refresh(valid_inv)
    assert valid_inv.status == "accepted"


# ===== 6. open 模式注册不受影响 =====

@pytest.mark.asyncio
async def test_open_mode_register_unaffected(
    client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    """open 模式下原注册流程不受影响；若带了有效邀请也能接受邀请"""
    monkeypatch.setattr(settings, "DEBUG", True)
    monkeypatch.setattr(settings, "REGISTRATION_MODE", "open")

    r_code = await client.post(
        "/api/v1/auth/send-code",
        json={"channel": "email", "target": "openuser@example.com", "purpose": "register"},
    )
    assert r_code.status_code == 200, r_code.text
    email_code = r_code.json()["data"]["debug_code"]

    res_reg = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "openuser",
            "password": "password123",
            "email": "openuser@example.com",
            "email_code": email_code,
        },
    )
    assert res_reg.status_code in (200, 201), res_reg.text
    data = res_reg.json()["data"]
    assert data["user"]["username"] == "openuser"
    assert data["user"]["email_verified"] is True
    assert data["user"]["phone_verified"] is False
    assert "project_id" not in data or data.get("project_id") is None

    # open 模式下带有效邀请注册
    admin = User(
        username="openadmin",
        email="openadmin@example.com",
        password_hash=get_password_hash("pass123"),
        email_verified_at=datetime.utcnow(),
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)

    company = await _create_test_company(db_session, admin, slug="open-co")
    project = await _create_test_project(db_session, company, admin)
    open_inv = ProjectInvitation(
        project_id=project.id,
        invitee_email="openinvited@example.com",
        token="open-valid-token",
        status="pending",
        expires_at=datetime.now(timezone.utc) + timedelta(days=2),
    )
    db_session.add(open_inv)
    await db_session.commit()

    r_code2 = await client.post(
        "/api/v1/auth/send-code",
        json={"channel": "email", "target": "openinvited@example.com", "purpose": "register"},
    )
    assert r_code2.status_code == 200
    email_code2 = r_code2.json()["data"]["debug_code"]

    res_reg2 = await client.post(
        "/api/v1/auth/register",
        json={
            "username": "openinvited",
            "password": "password123",
            "email": "openinvited@example.com",
            "email_code": email_code2,
            "invite_token": "open-valid-token",
        },
    )
    assert res_reg2.status_code == 201
    assert res_reg2.json()["data"]["project_id"] == project.id
