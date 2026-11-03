"""协作测试床 — handoff §6 seed_ids"""
import json
from datetime import datetime, timedelta, timezone
from copy import deepcopy

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.dependencies import get_db
from app.core.security import create_access_token, get_password_hash
from app.db.base import Base
from app.main import app
from app.models.user import User
from app.services.company_bootstrap import bootstrap_single_company
from app.services.license_verify import sign_license_dev
from app.services.policy_presets import DEFAULT_ENTITLEMENT
from app.services.project_service import ProjectService
from app.services.tree_service import TreeService

# force hmac key for tests
settings.LICENSE_PUBLIC_KEY = "dev-secret-key-for-tests-only"
settings.LICENSE_VERIFY_MODE = "hmac"
settings.DEPLOY_MODE = "single_company"


@pytest_asyncio.fixture
async def async_engine():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # import all models
    import app.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(async_engine):
    session_factory = async_sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def async_client(async_engine):
    session_factory = async_sessionmaker(
        async_engine, class_=AsyncSession, expire_on_commit=False
    )

    async def _override_get_db():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
    app.dependency_overrides.pop(get_db, None)


def _headers(user_id: int) -> dict:
    token = create_access_token(data={"sub": user_id})
    return {"Authorization": f"Bearer {token}"}


def make_dev_license(slug: str, **extra) -> tuple[str, str]:
    payload = {
        "company_slug": slug,
        "features": {"project_tree": True, "agents": True, "org_sync": True, "asr": True},
        "quotas": {"max_users": 50, "max_projects": 20},
        "valid_to": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
    }
    payload.update(extra)
    raw = json.dumps(payload, sort_keys=True)
    sig = sign_license_dev(raw, settings.LICENSE_PUBLIC_KEY)
    return raw, sig


async def _make_user(db: AsyncSession, username: str) -> User:
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


@pytest_asyncio.fixture
async def seed_ids(db_session: AsyncSession):
    """handoff §6 固定形状"""
    admin = await _make_user(db_session, "admin")
    pm = await _make_user(db_session, "pm_user")
    member = await _make_user(db_session, "member_user")
    outsider = await _make_user(db_session, "outsider")

    company = await bootstrap_single_company(
        db_session,
        name="测试公司",
        slug="acme",
        admin_user_id=admin.id,
        activate=False,
    )
    raw, sig = make_dev_license("acme")
    from app.services.company_bootstrap import apply_license_to_company

    await apply_license_to_company(db_session, company, raw, sig)

    # add pm/member as company members with org_leader for admin
    from app.models.company import CompanyMembership

    for u, is_leader in ((pm, False), (member, False)):
        db_session.add(
            CompanyMembership(
                company_id=company.id,
                user_id=u.id,
                status="active",
                is_super_admin=False,
                is_org_leader=False,
                employment_status="active",
            )
        )
    await db_session.flush()

    psvc = ProjectService()
    project = await psvc.create_project(
        db_session, company=company, name="演示项目", creator_user_id=admin.id
    )
    await psvc.assign_pm(db_session, project, pm.id)
    await psvc.pull_member(db_session, project, member.id)

    tsvc = TreeService()
    # 人轴形态：主干只排人，事项挂在人下面（后端已强制，见 TreeService.assert_shape）
    root = await tsvc.create_node(
        db_session,
        project,
        parent_id=None,
        node_type_key="person",
        title="负责人",
        assignees=[
            {"user_id": member.id, "role_key": "primary"},
            {"user_id": pm.id, "role_key": "primary"},
        ],
    )
    node = await tsvc.create_node(
        db_session,
        project,
        parent_id=root.id,
        node_type_key="work_item",
        title="工作项A",
        assignees=[{"user_id": member.id, "role_key": "primary"}],
    )
    await db_session.commit()

    return {
        "company_id": company.id,
        "project_id": project.id,
        "root_node_id": root.id,
        "node_id": node.id,
        "pm_user_id": pm.id,
        "member_user_id": member.id,
        "outsider_user_id": outsider.id,
        "admin_user_id": admin.id,
        "pm_headers": _headers(pm.id),
        "member_headers": _headers(member.id),
        "outsider_headers": _headers(outsider.id),
        "org_leader_headers": _headers(admin.id),
        "super_admin_headers": _headers(admin.id),
    }
