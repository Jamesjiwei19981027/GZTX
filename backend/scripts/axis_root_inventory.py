"""只读盘点存量人轴根节点问题。"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sqlalchemy as sa


def inventory(database_url: str | None = None) -> str:
    url = database_url or os.environ.get("DATABASE_URL")
    if not url:
        from app.core.config import settings
        url = settings.DATABASE_URL
    url = url.replace("+asyncpg", "").replace("+aiosqlite", "")
    engine = sa.create_engine(url)
    lines, needs = [], 0
    with engine.connect() as conn:
        projects = conn.execute(sa.text("SELECT id, name, pm_user_id FROM projects ORDER BY id")).fetchall()
        types = dict(conn.execute(sa.text("SELECT id, key FROM node_types")).fetchall())
        for project in projects:
            p_id, p_name, p_pm = project[0], project[1], project[2]
            nodes = conn.execute(sa.text(
                "SELECT id, parent_id, node_type_id, sort_order FROM tree_nodes "
                "WHERE project_id = :p_id AND (is_deleted IS NULL OR is_deleted = 0 OR is_deleted = false) "
                "ORDER BY sort_order, id"
            ), {"p_id": p_id}).fetchall()
            node_ids = [n[0] for n in nodes]
            assignees: dict[int, list[tuple[int, str]]] = {}
            if node_ids:
                id_list = ",".join(str(nid) for nid in node_ids)
                rows = conn.execute(sa.text(f"SELECT node_id, user_id, role_key FROM node_assignments WHERE node_id IN ({id_list})")).fetchall()
                for nid, uid, rk in rows:
                    assignees.setdefault(nid, []).append((uid, rk))

            by_id = {n[0]: n for n in nodes}
            roots = [n for n in nodes if n[1] is None]
            roots = sorted(roots, key=lambda n: (n[3], n[0]))
            nonperson = [n for n in roots if types.get(n[2]) != "person"]
            nonperson_ids = {n[0] for n in nonperson}
            matter_under_nonperson = any(
                types.get(n[2]) in {"work_item", "milestone", "scope"} and n[1] in nonperson_ids
                for n in nodes
            )
            deep = []
            for n in nodes:
                depth = 0
                cur = n
                while cur:
                    if types.get(cur[2]) == "person":
                        depth += 1
                    cur = by_id.get(cur[1])
                if depth > 4:
                    deep.append(n[0])

            issue = len(roots) != 1 or bool(nonperson) or matter_under_nonperson or bool(deep)
            needs += int(issue)
            root_desc = []
            for root in roots:
                primary = [str(uid) for uid, rk in assignees.get(root[0], []) if rk == "primary"]
                root_desc.append(f"{root[0]}:{types.get(root[2])}:primary={','.join(primary) or '-'}")
            lines.append(
                f"项目 {p_id}：根节点数={len(roots)}；根={'、'.join(root_desc) or '-'}；非人根={'是' if nonperson else '否'}；"
                f"非人根下事项={'是' if matter_under_nonperson else '否'}；超过四层节点={','.join(map(str, deep)) or '-'}"
            )
    lines.append(f"需要处理的项目数 = {needs}")
    return "\n".join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="只读盘点存量人轴根节点问题")
    parser.add_argument("--database-url", dest="database_url", default=None, help="数据库连接串")
    args = parser.parse_args()
    print(inventory(args.database_url))
