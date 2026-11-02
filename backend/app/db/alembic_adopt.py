"""把 create_all 建出来的存量库安全纳管进 Alembic。

背景：开发/存量部署的库通常由 init_db 的 create_all 建表，没有
alembic_version 表，健康检查因此报 migration=not_managed。此模块在
启动时检测「业务表已存在但无 alembic_version」：

- DEBUG=true：视为 schema 已与迁移头对齐（create_all 用的是同一份
  metadata），直接写入 alembic_version=head（等价 `alembic stamp head`）。
- DEBUG=false：绝不自动动库，只在日志给出手工纳管指引。

不影响的两条既有路径：
- 全新空库启动：create_all 先建表，随后 stamp，得到干净的受管库；
- CI 空库 `alembic upgrade head`：迁移链自身建出 alembic_version，
  这里检测到已存在就什么都不做。
"""
import logging
from pathlib import Path

from sqlalchemy import Column, inspect, text
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import settings

logger = logging.getLogger(__name__)

# 判定「业务表已存在」的锚点表：初始迁移就有、任何可用部署必然存在
_ANCHOR_TABLE = "users"


def get_alembic_head() -> str:
    """读取迁移脚本目录的唯一 head revision。"""
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    backend_dir = Path(__file__).resolve().parents[2]
    cfg = Config(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    return ScriptDirectory.from_config(cfg).get_current_head()


def _missing_columns(sync_conn) -> list[tuple[str, Column]]:
    """比较 Base.metadata.sorted_tables 中库里已存在的表的列与实际列，返回缺失列列表 (table_name, Column)。"""
    import app.models  # noqa: F401
    from app.db.base import Base

    inspector = inspect(sync_conn)
    existing_tables = set(inspector.get_table_names())
    missing: list[tuple[str, Column]] = []

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        actual_cols = {col["name"] for col in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name not in actual_cols:
                missing.append((table.name, column))
    return missing


def _add_missing_columns(
    sync_conn, missing: list[tuple[str, Column]]
) -> tuple[list[str], list[str]]:
    """为已存在的表补齐缺失列。

    对可空（nullable=True）或带有 server_default 的列执行 ALTER TABLE ADD COLUMN；
    对 NOT NULL 且无默认值的列不予自动添加，收集至 unsupported 中。
    """
    unsupported: list[str] = []
    supported: list[tuple[str, Column]] = []

    for table_name, column in missing:
        if column.nullable or column.server_default is not None:
            supported.append((table_name, column))
        else:
            unsupported.append(f"{table_name}.{column.name}")

    if unsupported:
        return [], unsupported

    added: list[str] = []
    quote = sync_conn.dialect.identifier_preparer.quote
    for table_name, column in supported:
        table_q = quote(table_name)
        col_q = quote(column.name)
        col_type = column.type.compile(dialect=sync_conn.dialect)
        sql = f"ALTER TABLE {table_q} ADD COLUMN {col_q} {col_type}"
        if column.server_default is not None:
            arg = column.server_default.arg
            if hasattr(arg, "text"):
                default_val = arg.text
            elif isinstance(arg, str):
                default_val = (
                    f"'{arg}'"
                    if not (arg.startswith("'") and arg.endswith("'"))
                    else arg
                )
            else:
                default_val = str(arg)
            sql += f" DEFAULT {default_val}"
        sync_conn.execute(text(sql))
        added.append(f"{table_name}.{column.name}")

    return added, []


async def adopt_alembic_if_needed(engine: AsyncEngine | None = None) -> str:
    """启动期 Alembic 纳管检查，返回处理结果（用于测试与日志）。

    返回值：
    - "already_managed"：已有 alembic_version 且已在迁移头，不动；
    - "restamped"：DEBUG 下版本落后于头（schema 已被 create_all 推进）已补齐缺列并重新 stamp；
    - "version_behind_production"：生产库版本落后，仅日志指引；
    - "no_tables"：空库（连业务表都没有），交给 create_all / alembic；
    - "stamped"：DEBUG 下已自动补齐缺失列并 stamp head；
    - "schema_drift"：DEBUG 下检测到存在无法自动补齐的缺失列（NOT NULL 且无默认值），未盖章；
    - "unmanaged_production"：生产库未纳管，仅日志指引；
    - "error"：检查/写入失败（不阻断启动）。
    """
    if engine is None:
        from app.db.session import engine as default_engine

        engine = default_engine

    try:
        async with engine.connect() as conn:
            def _table_names(sync_conn):
                return set(inspect(sync_conn).get_table_names())

            tables = await conn.run_sync(_table_names)

        if "alembic_version" in tables:
            # 已 stamp 但落后于头的库：开发下 create_all 会直接把新表建出来，
            # 版本号却停在旧头——之后跑 alembic upgrade head 会撞已存在的表。
            # DEBUG 下把版本重新钉到头（schema 与 metadata 同源，安全）；
            # 生产绝不自动动，只给指引。
            async with engine.connect() as conn:
                current = (
                    await conn.execute(text("SELECT version_num FROM alembic_version"))
                ).scalar_one_or_none()
            head = get_alembic_head()
            if current == head:
                return "already_managed"
            if not settings.DEBUG:
                logger.warning(
                    "alembic_version=%s 落后于迁移头 %s。生产环境不会自动修改，"
                    "请人工确认 schema 状态后执行 alembic upgrade head（或确认表已由"
                    " create_all 建出后 alembic stamp head）。",
                    current,
                    head,
                )
                return "version_behind_production"
            async with engine.begin() as conn:
                def _sync_upgrade(sync_conn):
                    missing = _missing_columns(sync_conn)
                    return _add_missing_columns(sync_conn, missing)

                added, unsupported = await conn.run_sync(_sync_upgrade)
                if unsupported:
                    logger.error(
                        "[AlembicAdopt] 检测到无法自动补齐的缺失列（NOT NULL 且无默认值）：%s。请执行 alembic upgrade head 或重建开发库。",
                        ", ".join(unsupported),
                    )
                    return "schema_drift"
                if added:
                    logger.info("[AlembicAdopt] 已补齐 %d 个缺失列：%s", len(added), ", ".join(added))

                await conn.execute(text("DELETE FROM alembic_version"))
                await conn.execute(
                    text("INSERT INTO alembic_version (version_num) VALUES (:v)"),
                    {"v": head},
                )
            logger.info(
                "[AlembicAdopt] 版本 %s 落后于头，已重新 stamp head=%s（DEBUG）",
                current,
                head,
            )
            return "restamped"
        if _ANCHOR_TABLE not in tables:
            return "no_tables"

        if not settings.DEBUG:
            logger.warning(
                "数据库已有业务表但未被 Alembic 纳管（缺 alembic_version）。"
                "生产环境不会自动修改，请人工确认 schema 与迁移头一致后执行："
                "cd backend && alembic stamp head；之后的升级用 alembic upgrade head。"
            )
            return "unmanaged_production"

        head = get_alembic_head()
        async with engine.begin() as conn:
            def _sync_upgrade(sync_conn):
                missing = _missing_columns(sync_conn)
                return _add_missing_columns(sync_conn, missing)

            added, unsupported = await conn.run_sync(_sync_upgrade)
            if unsupported:
                logger.error(
                    "[AlembicAdopt] 检测到无法自动补齐的缺失列（NOT NULL 且无默认值）：%s。请执行 alembic upgrade head 或重建开发库。",
                    ", ".join(unsupported),
                )
                return "schema_drift"
            if added:
                logger.info("[AlembicAdopt] 已补齐 %d 个缺失列：%s", len(added), ", ".join(added))

            await conn.execute(
                text(
                    "CREATE TABLE alembic_version ("
                    "version_num VARCHAR(32) NOT NULL, "
                    "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
                )
            )
            await conn.execute(
                text("INSERT INTO alembic_version (version_num) VALUES (:v)"),
                {"v": head},
            )
        logger.info("[AlembicAdopt] 已自动 stamp head=%s（DEBUG 存量库纳管）", head)
        return "stamped"
    except Exception:
        logger.exception("[AlembicAdopt] 纳管检查失败（不阻断启动）")
        return "error"
