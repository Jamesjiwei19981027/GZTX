"""将存量项目人轴合并为单一终责根节点。"""
from alembic import op
import sqlalchemy as sa

revision = "fm1a2b3c4d5e"
down_revision = "fl0a1b2c3d4e"
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    nodes = sa.table("tree_nodes",
        sa.column("id", sa.Integer), sa.column("project_id", sa.Integer),
        sa.column("parent_id", sa.Integer), sa.column("node_type_id", sa.Integer),
        sa.column("sort_order", sa.Integer), sa.column("path", sa.String),
        sa.column("depth", sa.Integer), sa.column("is_deleted", sa.Boolean))
    projects = sa.table("projects", sa.column("id", sa.Integer), sa.column("pm_user_id", sa.Integer))
    types = sa.table("node_types", sa.column("id", sa.Integer), sa.column("key", sa.String))
    assignments = sa.table("node_assignments", sa.column("node_id", sa.Integer),
        sa.column("user_id", sa.Integer), sa.column("role_key", sa.String))
    project_ids = [r[0] for r in conn.execute(sa.select(projects.c.id)).all()]
    for project_id in project_ids:
        roots = conn.execute(sa.select(nodes).where(
            nodes.c.project_id == project_id, nodes.c.parent_id.is_(None), nodes.c.is_deleted.is_(False)
        ).order_by(nodes.c.sort_order, nodes.c.id)).mappings().all()
        if len(roots) <= 1:
            continue
        pm_id = conn.execute(sa.select(projects.c.pm_user_id).where(projects.c.id == project_id)).scalar_one_or_none()
        chosen = None
        if pm_id is not None:
            for root in roots:
                type_key = conn.execute(sa.select(types.c.key).where(types.c.id == root["node_type_id"])).scalar_one_or_none()
                if type_key == "person" and conn.execute(sa.select(assignments.c.node_id).where(
                    assignments.c.node_id == root["id"], assignments.c.user_id == pm_id,
                    assignments.c.role_key == "primary").limit(1)).first():
                    chosen = root; break
        if chosen is None:
            for root in roots:
                if conn.execute(sa.select(types.c.key).where(types.c.id == root["node_type_id"])).scalar_one_or_none() == "person":
                    chosen = root; break
        if chosen is None:
            print(f"axis_single_root: project {project_id} skipped (no person root)")
            continue
        next_sort = conn.execute(sa.select(sa.func.max(nodes.c.sort_order)).where(
            nodes.c.parent_id == chosen["id"], nodes.c.is_deleted.is_(False))).scalar_one()
        next_sort = (next_sort if next_sort is not None else -1) + 1
        for root in roots:
            if root["id"] == chosen["id"]:
                continue
            old_path = root["path"]
            new_prefix = f"{chosen['path']}{root['id']}/"
            depth_delta = chosen["depth"] + 1 - root["depth"]
            descendants = conn.execute(sa.select(nodes.c.id, nodes.c.path, nodes.c.depth).where(
                nodes.c.project_id == project_id, nodes.c.path.like(old_path + "%")
            )).all()
            for row in descendants:
                suffix = row.path[len(old_path):]
                conn.execute(sa.update(nodes).where(nodes.c.id == row.id).values(
                    path=new_prefix + suffix, depth=row.depth + depth_delta))
            conn.execute(sa.update(nodes).where(nodes.c.id == root["id"]).values(
                parent_id=chosen["id"], sort_order=next_sort))
            next_sort += 1


def downgrade():
    # 合并多个根节点后无法可靠还原原有数据结构。
    pass
