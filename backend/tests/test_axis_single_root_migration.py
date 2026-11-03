"""单根数据迁移测试 (B2)"""
import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def _load_migration():
    path = Path(__file__).resolve().parents[1] / "alembic/versions/fm1a2b3c4d5e_axis_single_root.py"
    spec = importlib.util.spec_from_file_location("axis_single_root_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    return migration


def test_axis_single_root_migration(monkeypatch):
    migration = _load_migration()
    engine = sa.create_engine("sqlite:///:memory:")

    with engine.begin() as conn:
        # 建立迁移所依赖的表结构
        conn.execute(sa.text("""
            CREATE TABLE projects (
                id INTEGER PRIMARY KEY,
                pm_user_id INTEGER
            )
        """))
        conn.execute(sa.text("""
            CREATE TABLE node_types (
                id INTEGER PRIMARY KEY,
                key VARCHAR NOT NULL
            )
        """))
        conn.execute(sa.text("""
            CREATE TABLE node_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                node_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                role_key VARCHAR NOT NULL
            )
        """))
        conn.execute(sa.text("""
            CREATE TABLE tree_nodes (
                id INTEGER PRIMARY KEY,
                project_id INTEGER NOT NULL,
                parent_id INTEGER,
                node_type_id INTEGER NOT NULL,
                sort_order INTEGER NOT NULL,
                path VARCHAR NOT NULL,
                depth INTEGER NOT NULL,
                is_deleted BOOLEAN NOT NULL DEFAULT 0
            )
        """))

        # 预置 node_types
        conn.execute(sa.text("INSERT INTO node_types (id, key) VALUES (1, 'person'), (2, 'work_item')"))

        # 1. 项目 1：三个根，其中一个根的 primary 指派人是 PM（user_id=100），且一个根下有两层子孙
        conn.execute(sa.text("INSERT INTO projects (id, pm_user_id) VALUES (1, 100)"))
        # 根 1 (id=1, person, 非 pm): 带两层子孙 (id=4 -> id=5)
        conn.execute(sa.text("INSERT INTO tree_nodes (id, project_id, parent_id, node_type_id, sort_order, path, depth, is_deleted) VALUES (1, 1, NULL, 1, 0, '/1/', 0, 0)"))
        conn.execute(sa.text("INSERT INTO node_assignments (node_id, user_id, role_key) VALUES (1, 101, 'primary')"))

        # 两层子孙
        conn.execute(sa.text("INSERT INTO tree_nodes (id, project_id, parent_id, node_type_id, sort_order, path, depth, is_deleted) VALUES (4, 1, 1, 1, 0, '/1/4/', 1, 0)"))
        conn.execute(sa.text("INSERT INTO tree_nodes (id, project_id, parent_id, node_type_id, sort_order, path, depth, is_deleted) VALUES (5, 1, 4, 2, 0, '/1/4/5/', 2, 0)"))

        # 根 2 (id=2, person, primary=pm=100) -> 终责根
        conn.execute(sa.text("INSERT INTO tree_nodes (id, project_id, parent_id, node_type_id, sort_order, path, depth, is_deleted) VALUES (2, 1, NULL, 1, 1, '/2/', 0, 0)"))
        conn.execute(sa.text("INSERT INTO node_assignments (node_id, user_id, role_key) VALUES (2, 100, 'primary')"))

        # 根 3 (id=3, person, 非 pm)
        conn.execute(sa.text("INSERT INTO tree_nodes (id, project_id, parent_id, node_type_id, sort_order, path, depth, is_deleted) VALUES (3, 1, NULL, 1, 2, '/3/', 0, 0)"))
        conn.execute(sa.text("INSERT INTO node_assignments (node_id, user_id, role_key) VALUES (3, 102, 'primary')"))

        # 2. 项目 2：无 PM 的项目（pm_user_id is NULL），两个 person 根
        conn.execute(sa.text("INSERT INTO projects (id, pm_user_id) VALUES (2, NULL)"))
        conn.execute(sa.text("INSERT INTO tree_nodes (id, project_id, parent_id, node_type_id, sort_order, path, depth, is_deleted) VALUES (10, 2, NULL, 1, 0, '/10/', 0, 0)"))
        conn.execute(sa.text("INSERT INTO tree_nodes (id, project_id, parent_id, node_type_id, sort_order, path, depth, is_deleted) VALUES (11, 2, NULL, 1, 1, '/11/', 0, 0)"))

        # 3. 项目 3：根全是非人（work_item），应被跳过
        conn.execute(sa.text("INSERT INTO projects (id, pm_user_id) VALUES (3, 100)"))
        conn.execute(sa.text("INSERT INTO tree_nodes (id, project_id, parent_id, node_type_id, sort_order, path, depth, is_deleted) VALUES (20, 3, NULL, 2, 0, '/20/', 0, 0)"))
        conn.execute(sa.text("INSERT INTO tree_nodes (id, project_id, parent_id, node_type_id, sort_order, path, depth, is_deleted) VALUES (21, 3, NULL, 2, 1, '/21/', 0, 0)"))

        # 配置 alembic Operations 执行迁移
        monkeypatch.setattr(migration, "op", Operations(MigrationContext.configure(conn)))

        # 执行迁移
        migration.upgrade()

        # 断言项目 1：只剩一个根（id=2），其余挂到 id=2 下面
        p1_roots = conn.execute(sa.text("SELECT id FROM tree_nodes WHERE project_id = 1 AND parent_id IS NULL AND is_deleted = 0")).scalars().all()
        assert p1_roots == [2], f"项目1终责根应仅剩 id=2，实际为: {p1_roots}"

        nodes_by_id = {row.id: row for row in conn.execute(sa.text("SELECT id, parent_id, path, depth, sort_order FROM tree_nodes WHERE project_id = 1")).all()}
        # 节点 1 成为节点 2 的子节点
        assert nodes_by_id[1].parent_id == 2
        assert nodes_by_id[1].path == "/2/1/"
        assert nodes_by_id[1].depth == 1

        # 节点 1 的后代节点 4 和 5 path/depth 同步更新
        assert nodes_by_id[4].parent_id == 1
        assert nodes_by_id[4].path == "/2/1/4/"
        assert nodes_by_id[4].depth == 2

        assert nodes_by_id[5].parent_id == 4
        assert nodes_by_id[5].path == "/2/1/4/5/"
        assert nodes_by_id[5].depth == 3

        # 节点 3 成为节点 2 的子节点
        assert nodes_by_id[3].parent_id == 2
        assert nodes_by_id[3].path == "/2/3/"
        assert nodes_by_id[3].depth == 1

        # 断言项目 2（无 PM）：按 sort_order, id 选排第一的 person 根（id=10），id=11 挂到它下面
        p2_roots = conn.execute(sa.text("SELECT id FROM tree_nodes WHERE project_id = 2 AND parent_id IS NULL AND is_deleted = 0")).scalars().all()
        assert p2_roots == [10]
        n11 = conn.execute(sa.text("SELECT parent_id, path, depth FROM tree_nodes WHERE id = 11")).one()
        assert n11.parent_id == 10
        assert n11.path == "/10/11/"
        assert n11.depth == 1

        # 断言项目 3（根全是非人）：跳过，仍保持两个根
        p3_roots = conn.execute(sa.text("SELECT id FROM tree_nodes WHERE project_id = 3 AND parent_id IS NULL AND is_deleted = 0")).scalars().all()
        assert set(p3_roots) == {20, 21}

        # 幂等性断言：再执行一次结果不变
        migration.upgrade()

        p1_roots_after = conn.execute(sa.text("SELECT id FROM tree_nodes WHERE project_id = 1 AND parent_id IS NULL AND is_deleted = 0")).scalars().all()
        assert p1_roots_after == [2]
        nodes_by_id_after = {row.id: row for row in conn.execute(sa.text("SELECT id, parent_id, path, depth, sort_order FROM tree_nodes WHERE project_id = 1")).all()}
        assert nodes_by_id_after[1].path == "/2/1/"
        assert nodes_by_id_after[5].path == "/2/1/4/5/"
        assert nodes_by_id_after[5].depth == 3

        # downgrade 应为 no-op
        migration.downgrade()
    engine.dispose()
