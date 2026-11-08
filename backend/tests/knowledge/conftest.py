"""知识检索层测试床（async SQLite 内存库，直插模型行，不走 API/ACL）

阶段 3 起补充 API 客户端与轻量种子（公司/项目/成员，直插模型行；
知识检索 API 无 entitlement 门禁，无需 license）。
"""
from sqlalchemy import text as _sa_text
import os
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.dependencies import get_db
from app.core.security import create_access_token, get_password_hash
from app.db.base import Base

import app.models  # noqa: F401 — 注册全部表

test_db_url = os.environ.get("TEST_DATABASE_URL")
if test_db_url:
    settings.DATABASE_URL = test_db_url


@pytest_asyncio.fixture
async def async_engine():
    test_db_url = os.environ.get("TEST_DATABASE_URL")
    if test_db_url:
        engine = create_async_engine(test_db_url)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            # create_all 不管的 alembic_version（health/adopt 用例会建）也要清掉，保证用例间隔离
            await conn.execute(_sa_text("DROP TABLE IF EXISTS alembic_version"))
            await conn.run_sync(Base.metadata.create_all)
        yield engine
        await engine.dispose()
    else:
        engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
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
    from app.main import app

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


async def _make_user(db: AsyncSession, username: str):
    from datetime import datetime as _dt

    from app.models.user import User

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
async def seed_knowledge(db_session: AsyncSession):
    """轻量种子：member 是两个项目的成员；outsider 仅公司成员（非项目成员）。

    项目 1 已有一条 wiki 条目并完成切块索引；项目 2 无任何知识块（隔离对照）。
    """
    from app.models.company import Company, CompanyMembership
    from app.models.project import Project, ProjectMember
    from app.models.wiki import ProjectWikiEntry
    from app.services.knowledge.indexer import index_wiki_entry

    member = await _make_user(db_session, "kmember")
    outsider = await _make_user(db_session, "koutsider")

    company = Company(
        name="知识测试公司",
        slug="knowledge-co",
        status="active",
        policy_json={},
        entitlement_json={},
    )
    db_session.add(company)
    await db_session.flush()

    for u in (member, outsider):
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

    project = Project(company_id=company.id, name="知识项目", created_by=member.id)
    project2 = Project(company_id=company.id, name="隔离项目", created_by=member.id)
    db_session.add_all([project, project2])
    await db_session.flush()
    for p in (project, project2):
        db_session.add(ProjectMember(project_id=p.id, user_id=member.id, role="member"))
    await db_session.flush()

    entry = ProjectWikiEntry(
        company_id=company.id,
        project_id=project.id,
        title="部署验收标准",
        body_text="上线前必须完成数据库迁移与冒烟测试。",
        source="manual",
    )
    db_session.add(entry)
    await db_session.flush()
    await index_wiki_entry(db_session, entry)
    await db_session.commit()

    return {
        "company_id": company.id,
        "project_id": project.id,
        "project2_id": project2.id,
        "wiki_id": entry.id,
        "member_user_id": member.id,
        "outsider_user_id": outsider.id,
        "member_headers": _headers(member.id),
        "outsider_headers": _headers(outsider.id),
    }
