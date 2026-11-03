"""只读盘点脚本测试 (B3)"""
import sqlalchemy as sa

from scripts.axis_root_inventory import inventory


def test_axis_root_inventory_reports_issues(tmp_path):
    db_file = tmp_path / "test_inventory.db"
    url = f"sqlite:///{db_file.as_posix()}"
    engine = sa.create_engine(url)

    with engine.begin() as conn:
        conn.execute(sa.text("""
            CREATE TABLE projects (
                id INTEGER PRIMARY KEY,
                name VARCHAR,
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

        conn.execute(sa.text("INSERT INTO node_types (id, key) VALUES (1, 'person'), (2, 'work_item')"))

        # 项目 1：正常单根项目（1 个 person 根）
        conn.execute(sa.text("INSERT INTO projects (id, name, pm_user_id) VALUES (1, '正常项目', 10)"))
        conn.execute(sa.text("INSERT INTO tree_nodes (id, project_id, parent_id, node_type_id, sort_order, path, depth, is_deleted) VALUES (1, 1, NULL, 1, 0, '/1/', 0, 0)"))
        conn.execute(sa.text("INSERT INTO node_assignments (node_id, user_id, role_key) VALUES (1, 10, 'primary')"))

        # 项目 2：存在多根问题（2 个根）
        conn.execute(sa.text("INSERT INTO projects (id, name, pm_user_id) VALUES (2, '多根项目', 20)"))
        conn.execute(sa.text("INSERT INTO tree_nodes (id, project_id, parent_id, node_type_id, sort_order, path, depth, is_deleted) VALUES (2, 2, NULL, 1, 0, '/2/', 0, 0)"))
        conn.execute(sa.text("INSERT INTO tree_nodes (id, project_id, parent_id, node_type_id, sort_order, path, depth, is_deleted) VALUES (3, 2, NULL, 1, 1, '/3/', 0, 0)"))

        # 项目 3：存在非人根（work_item 为根）且非人根下挂事项
        conn.execute(sa.text("INSERT INTO projects (id, name, pm_user_id) VALUES (3, '非人根项目', 30)"))
        conn.execute(sa.text("INSERT INTO tree_nodes (id, project_id, parent_id, node_type_id, sort_order, path, depth, is_deleted) VALUES (4, 3, NULL, 2, 0, '/4/', 0, 0)"))
        conn.execute(sa.text("INSERT INTO tree_nodes (id, project_id, parent_id, node_type_id, sort_order, path, depth, is_deleted) VALUES (5, 3, 4, 2, 0, '/4/5/', 1, 0)"))

        # 项目 4：存在人员超过四层（5 层人）
        conn.execute(sa.text("INSERT INTO projects (id, name, pm_user_id) VALUES (4, '超深人员项目', 40)"))
        conn.execute(sa.text("INSERT INTO tree_nodes (id, project_id, parent_id, node_type_id, sort_order, path, depth, is_deleted) VALUES (10, 4, NULL, 1, 0, '/10/', 0, 0)"))
        conn.execute(sa.text("INSERT INTO tree_nodes (id, project_id, parent_id, node_type_id, sort_order, path, depth, is_deleted) VALUES (11, 4, 10, 1, 0, '/10/11/', 1, 0)"))
        conn.execute(sa.text("INSERT INTO tree_nodes (id, project_id, parent_id, node_type_id, sort_order, path, depth, is_deleted) VALUES (12, 4, 11, 1, 0, '/10/11/12/', 2, 0)"))
        conn.execute(sa.text("INSERT INTO tree_nodes (id, project_id, parent_id, node_type_id, sort_order, path, depth, is_deleted) VALUES (13, 4, 12, 1, 0, '/10/11/12/13/', 3, 0)"))
        conn.execute(sa.text("INSERT INTO tree_nodes (id, project_id, parent_id, node_type_id, sort_order, path, depth, is_deleted) VALUES (14, 4, 13, 1, 0, '/10/11/12/13/14/', 4, 0)"))

    engine.dispose()

    # 运行盘点
    output = inventory(url)

    assert "项目 1：根节点数=1" in output
    assert "项目 2：根节点数=2" in output
    assert "项目 3：" in output and "非人根=是" in output
    assert "项目 4：" in output and "超过四层节点=14" in output
    # 项目 2、3、4 各自存在问题，需要处理的项目数应为 3
    assert "需要处理的项目数 = 3" in output
