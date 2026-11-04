"""测试联调种子脚本单根化及二次运行幂等性 (B2)"""
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db.base import Base
import app.models  # noqa: F401
from app.models.project import Project
from app.models.tree import NodeAssignment, TreeNode
from scripts.seed_people_axis_joint import seed


@pytest.mark.asyncio
async def test_seed_people_axis_joint_single_root_and_idempotent(tmp_path, monkeypatch):
    # 构造含 axis_joint_debug_ 的临时 SQLite 数据库
    db_file = tmp_path / "axis_joint_debug_test.db"
    db_url = f"sqlite+aiosqlite:///{db_file.as_posix()}"

    monkeypatch.setattr(settings, "DATABASE_URL", db_url)
    monkeypatch.setattr(settings, "DEBUG", True)

    engine = create_async_engine(
        db_url,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    # 1. 跑第一遍脚本
    res1 = await seed(session_factory=session_factory)
    assert res1["project_id"]
    assert res1["role_project_id"]
    assert not res1.get("existing")

    async with session_factory() as db:
        # 验证两个项目各只有一个根，且根的 primary 是项目 PM
        for proj_id in [res1["project_id"], res1["role_project_id"]]:
            proj = await db.get(Project, proj_id)
            assert proj is not None
            assert proj.pm_user_id is not None

            # 查询该项目下的根节点 (parent_id is None)
            roots = (
                await db.execute(
                    select(TreeNode).where(
                        TreeNode.project_id == proj_id,
                        TreeNode.parent_id.is_(None),
                        TreeNode.is_deleted.is_(False),
                    )
                )
            ).scalars().all()

            # 断言各只有一个根
            assert len(roots) == 1, (
                f"Project {proj.name} should have exactly 1 root, got {len(roots)}"
            )
            root = roots[0]

            # 查询根节点的 primary assignee
            assignments = (
                await db.execute(
                    select(NodeAssignment).where(
                        NodeAssignment.node_id == root.id,
                        NodeAssignment.role_key == "primary",
                    )
                )
            ).scalars().all()
            primary_user_ids = [a.user_id for a in assignments]
            assert proj.pm_user_id in primary_user_ids, (
                f"Project {proj.name} PM ({proj.pm_user_id}) should be primary assignee of root, "
                f"got {primary_user_ids}"
            )

    # 2. 跑第二遍脚本，断言不报错且 existing 为 True
    res2 = await seed(session_factory=session_factory)
    assert res2.get("existing") is True
    assert res2["project_id"] == res1["project_id"]
    assert res2["role_project_id"] == res1["role_project_id"]

    # 验证二次运行后根节点数量依然为 1
    async with session_factory() as db:
        for proj_id in [res1["project_id"], res1["role_project_id"]]:
            roots = (
                await db.execute(
                    select(TreeNode).where(
                        TreeNode.project_id == proj_id,
                        TreeNode.parent_id.is_(None),
                        TreeNode.is_deleted.is_(False),
                    )
                )
            ).scalars().all()
            assert len(roots) == 1

    await engine.dispose()


@pytest.mark.asyncio
async def test_seed_requires_axis_joint_debug_in_url(monkeypatch):
    monkeypatch.setattr(settings, "DATABASE_URL", "sqlite+aiosqlite:///production.db")
    monkeypatch.setattr(settings, "DEBUG", True)
    with pytest.raises(AssertionError):
        await seed()
