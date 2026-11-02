"""启动期 Alembic 纳管：存量库 stamp head / 空库跳过 / 生产只给指引"""
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db.alembic_adopt import adopt_alembic_if_needed, get_alembic_head
from app.db.base import Base

import app.models  # noqa: F401 — register all tables


def _memory_engine():
    return create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


@pytest.mark.asyncio
async def test_adopt_stamps_head_on_debug_legacy_db(monkeypatch):
    """DEBUG=true 且业务表存在但无 alembic_version → 自动 stamp head"""
    monkeypatch.setattr(settings, "DEBUG", True)
    engine = _memory_engine()
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        result = await adopt_alembic_if_needed(engine)
        assert result == "stamped"

        async with engine.connect() as conn:
            version = (
                await conn.execute(text("SELECT version_num FROM alembic_version"))
            ).scalar_one()
        assert version == get_alembic_head()

        # 第二次启动：已纳管，不再动库
        assert await adopt_alembic_if_needed(engine) == "already_managed"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_adopt_restamps_stale_version_on_debug(monkeypatch):
    """DEBUG=true 且 alembic_version 落后于头（create_all 已推进 schema）→ 重新 stamp"""
    monkeypatch.setattr(settings, "DEBUG", True)
    engine = _memory_engine()
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.execute(
                text(
                    "CREATE TABLE alembic_version ("
                    "version_num VARCHAR(32) NOT NULL, "
                    "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
                )
            )
            await conn.execute(
                text("INSERT INTO alembic_version (version_num) VALUES ('stale_head')")
            )

        assert await adopt_alembic_if_needed(engine) == "restamped"

        async with engine.connect() as conn:
            version = (
                await conn.execute(text("SELECT version_num FROM alembic_version"))
            ).scalar_one()
        assert version == get_alembic_head()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_adopt_stale_version_untouched_in_production(monkeypatch):
    """DEBUG=false 且版本落后：只给指引，不改 alembic_version"""
    monkeypatch.setattr(settings, "DEBUG", False)
    engine = _memory_engine()
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.execute(
                text(
                    "CREATE TABLE alembic_version ("
                    "version_num VARCHAR(32) NOT NULL, "
                    "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
                )
            )
            await conn.execute(
                text("INSERT INTO alembic_version (version_num) VALUES ('stale_head')")
            )

        assert await adopt_alembic_if_needed(engine) == "version_behind_production"

        async with engine.connect() as conn:
            version = (
                await conn.execute(text("SELECT version_num FROM alembic_version"))
            ).scalar_one()
        assert version == "stale_head"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_adopt_skips_empty_database(monkeypatch):
    """全新空库：不 stamp（交给 create_all 或 CI 的 alembic upgrade head）"""
    monkeypatch.setattr(settings, "DEBUG", True)
    engine = _memory_engine()
    try:
        assert await adopt_alembic_if_needed(engine) == "no_tables"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_adopt_never_touches_production_db(monkeypatch):
    """DEBUG=false：只给日志指引，不写 alembic_version"""
    monkeypatch.setattr(settings, "DEBUG", False)
    engine = _memory_engine()
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        assert await adopt_alembic_if_needed(engine) == "unmanaged_production"

        async with engine.connect() as conn:
            def _has_alembic_version(sync_conn):
                from sqlalchemy import inspect

                return inspect(sync_conn).has_table("alembic_version")

            assert not (await conn.run_sync(_has_alembic_version))
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_adopt_adds_missing_nullable_columns_on_debug(monkeypatch):
    """DEBUG 下存量库缺失可空列：自动补齐列并 stamp head"""
    monkeypatch.setattr(settings, "DEBUG", True)
    engine = _memory_engine()
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # 手工删掉 tree_nodes 的可空列 description
            await conn.execute(text("ALTER TABLE tree_nodes DROP COLUMN description"))

        async with engine.connect() as conn:
            def _cols(sync_conn):
                from sqlalchemy import inspect
                return {c["name"] for c in inspect(sync_conn).get_columns("tree_nodes")}
            cols_before = await conn.run_sync(_cols)
            assert "description" not in cols_before

        result = await adopt_alembic_if_needed(engine)
        assert result == "stamped"

        async with engine.connect() as conn:
            cols_after = await conn.run_sync(_cols)
            assert "description" in cols_after
            version = (
                await conn.execute(text("SELECT version_num FROM alembic_version"))
            ).scalar_one()
            assert version == get_alembic_head()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_adopt_restamps_and_adds_missing_columns(monkeypatch):
    """已有 alembic_version 但落后于头、同样缺列：补列后返回 restamped"""
    monkeypatch.setattr(settings, "DEBUG", True)
    engine = _memory_engine()
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.execute(text("ALTER TABLE tree_nodes DROP COLUMN description"))
            await conn.execute(
                text(
                    "CREATE TABLE alembic_version ("
                    "version_num VARCHAR(32) NOT NULL, "
                    "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
                )
            )
            await conn.execute(
                text("INSERT INTO alembic_version (version_num) VALUES ('stale_head')")
            )

        assert await adopt_alembic_if_needed(engine) == "restamped"

        async with engine.connect() as conn:
            def _cols(sync_conn):
                from sqlalchemy import inspect
                return {c["name"] for c in inspect(sync_conn).get_columns("tree_nodes")}
            cols = await conn.run_sync(_cols)
            assert "description" in cols
            version = (
                await conn.execute(text("SELECT version_num FROM alembic_version"))
            ).scalar_one()
            assert version == get_alembic_head()
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_adopt_reports_schema_drift_on_non_nullable_missing_column(monkeypatch):
    """缺一个 NOT NULL 无默认值的列：返回 schema_drift 且不写入 alembic_version"""
    monkeypatch.setattr(settings, "DEBUG", True)
    engine = _memory_engine()
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # tree_nodes.title 是 NOT NULL 且无默认值的列，删掉它
            await conn.execute(text("ALTER TABLE tree_nodes DROP COLUMN title"))

        result = await adopt_alembic_if_needed(engine)
        assert result == "schema_drift"

        async with engine.connect() as conn:
            def _has_alembic_version(sync_conn):
                from sqlalchemy import inspect
                return inspect(sync_conn).has_table("alembic_version")
            assert not (await conn.run_sync(_has_alembic_version))
    finally:
        await engine.dispose()
