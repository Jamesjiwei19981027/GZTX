import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config


def test_channels_unique_idx_migration():
    # 验证 alembic 历史能够读取到新迁移，并且配置语法正常
    config = Config("alembic.ini")
    config.set_main_option("script_location", "alembic")
    # 只要能解析迁移脚本无语法错误
    from alembic.script import ScriptDirectory
    script = ScriptDirectory.from_config(config)
    head = script.get_current_head()
    assert head == "fo3c4d5e6f7a"


def test_channels_unique_idx_migration_merges_duplicates_and_enforces_null_project():
    """真正执行迁移：合并 project_id 为空与不为空两类重复频道，消息保留，之后重复插入被拒。"""
    import importlib.util
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy.exc import IntegrityError

    engine = sa.create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(sa.text("CREATE TABLE team_channels (id INTEGER PRIMARY KEY, company_id INTEGER NOT NULL, project_id INTEGER, key VARCHAR(32) NOT NULL, name VARCHAR(120) NOT NULL)"))
        conn.execute(sa.text("CREATE TABLE team_channel_messages (id INTEGER PRIMARY KEY, channel_id INTEGER NOT NULL, body TEXT NOT NULL)"))
        conn.execute(sa.text("CREATE TABLE pinned_links (id INTEGER PRIMARY KEY, channel_id INTEGER)"))
        # 公司级（project_id 为空）重复 3 条，项目级重复 2 条，另有一条不重复
        for i, (pid, key) in enumerate([(None, "general"), (None, "general"), (None, "general"), (7, "project"), (7, "project"), (8, "project")], start=1):
            conn.execute(sa.text("INSERT INTO team_channels (id, company_id, project_id, key, name) VALUES (:i, 1, :p, :k, 'n')"), {"i": i, "p": pid, "k": key})
        conn.execute(sa.text("INSERT INTO team_channel_messages (channel_id, body) VALUES (2, 'a'), (3, 'b'), (5, 'c'), (1, 'd')"))
        conn.execute(sa.text("INSERT INTO pinned_links (channel_id) VALUES (3)"))

        path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "fn2b3c4d5e6f_team_channels_unique_idx.py"
        spec = importlib.util.spec_from_file_location("mig_fn2b", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        with Operations.context(MigrationContext.configure(conn)):
            mod.upgrade()

        ids = [r[0] for r in conn.execute(sa.text("SELECT id FROM team_channels ORDER BY id"))]
        assert ids == [1, 4, 6]
        msgs = sorted(tuple(r) for r in conn.execute(sa.text("SELECT channel_id, body FROM team_channel_messages")))
        assert msgs == [(1, "a"), (1, "b"), (1, "d"), (4, "c")]
        assert conn.execute(sa.text("SELECT channel_id FROM pinned_links")).scalar() == 1

    for pid in (None, 7):
        with pytest.raises(IntegrityError):
            with engine.begin() as conn:
                conn.execute(sa.text("INSERT INTO team_channels (company_id, project_id, key, name) VALUES (1, :p, :k, 'x')"), {"p": pid, "k": "general" if pid is None else "project"})
