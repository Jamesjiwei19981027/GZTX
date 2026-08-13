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

from sqlalchemy import inspect, text
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


async def adopt_alembic_if_needed(engine: AsyncEngine | None = None) -> str:
    """启动期 Alembic 纳管检查，返回处理结果（用于测试与日志）。

    返回值：
    - "already_managed"：已有 alembic_version 表，不动；
    - "no_tables"：空库（连业务表都没有），交给 create_all / alembic；
    - "stamped"：DEBUG 下已自动 stamp head；
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
            return "already_managed"
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
