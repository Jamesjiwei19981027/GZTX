"""树 path 物化 / move / 软删"""
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.tree import NodeAssignment, NodeType, TreeNode, default_progress_json
from app.models.user import User


BUILTIN_TYPES = {
    "person": ("人", "person"),
    "scope": ("范围", "scope"),
    "work_item": ("工作项", "work_item"),
    "milestone": ("里程碑", "milestone"),
}


class TreeService:
    async def ensure_builtin_types(self, db: AsyncSession, company_id: int | None = None) -> None:
        for key, (name, tmpl) in BUILTIN_TYPES.items():
            q = await db.execute(
                select(NodeType).where(
                    NodeType.key == key,
                    NodeType.company_id.is_(None),
                    NodeType.project_id.is_(None),
                )
            )
            if q.scalar_one_or_none() is None:
                db.add(
                    NodeType(
                        company_id=None,
                        project_id=None,
                        key=key,
                        name=name,
                        behavior_template=tmpl,
                    )
                )
        await db.flush()

    async def resolve_type(self, db: AsyncSession, node_type_key: str) -> NodeType:
        await self.ensure_builtin_types(db)
        q = await db.execute(
            select(NodeType).where(NodeType.key == node_type_key).limit(1)
        )
        nt = q.scalar_one_or_none()
        if not nt:
            raise ValueError(f"未知节点类型: {node_type_key}")
        return nt

    async def create_node(
        self,
        db: AsyncSession,
        project: Project,
        *,
        parent_id: int | None,
        node_type_key: str,
        title: str,
        description: str | None = None,
        sort_order: int = 0,
        start_at=None,
        due_at=None,
        milestone_at=None,
        allow_clear_text_progress: bool = False,
        created_by: int | None = None,
        assignees: list[dict] | None = None,
    ) -> TreeNode:
        nt = await self.resolve_type(db, node_type_key)
        parent = None
        depth = 0
        if parent_id is not None:
            parent = await db.get(TreeNode, parent_id)
            if not parent or parent.project_id != project.id or parent.is_deleted:
                raise ValueError("父节点不存在")
            depth = parent.depth + 1

        node = TreeNode(
            company_id=project.company_id,
            project_id=project.id,
            parent_id=parent_id,
            node_type_id=nt.id,
            title=title,
            description=description,
            sort_order=sort_order,
            path="/",  # temp
            depth=depth,
            start_at=start_at,
            due_at=due_at,
            milestone_at=milestone_at,
            allow_clear_text_progress=allow_clear_text_progress,
            progress_json=default_progress_json(nt.behavior_template),
            created_by=created_by,
        )
        db.add(node)
        await db.flush()
        if parent:
            node.path = f"{parent.path}{node.id}/"
        else:
            node.path = f"/{node.id}/"
        await db.flush()

        if assignees:
            for a in assignees:
                db.add(
                    NodeAssignment(
                        node_id=node.id,
                        user_id=int(a["user_id"]),
                        role_key=a.get("role_key") or "primary",
                    )
                )
            await db.flush()
        return node

    async def move_node(
        self,
        db: AsyncSession,
        node_id: int,
        new_parent_id: int | None,
        sort_order: int = 0,
    ) -> TreeNode:
        node = await db.get(TreeNode, node_id)
        if not node or node.is_deleted:
            raise ValueError("节点不存在")

        if new_parent_id is not None:
            if new_parent_id == node.id:
                raise ValueError("树操作成环")
            parent = await db.get(TreeNode, new_parent_id)
            if not parent or parent.project_id != node.project_id or parent.is_deleted:
                raise ValueError("父节点不存在")
            if parent.path.startswith(node.path):
                raise ValueError("树操作成环")
            new_path_prefix = f"{parent.path}{node.id}/"
            new_depth = parent.depth + 1
        else:
            parent = None
            new_path_prefix = f"/{node.id}/"
            new_depth = 0

        old_path = node.path
        old_depth = node.depth
        depth_delta = new_depth - old_depth

        # rewrite descendants
        q = await db.execute(
            select(TreeNode).where(
                TreeNode.project_id == node.project_id,
                TreeNode.path.like(f"{old_path}%"),
                TreeNode.is_deleted.is_(False),
            )
        )
        for n in q.scalars().all():
            suffix = n.path[len(old_path) :]
            n.path = new_path_prefix + suffix
            n.depth = n.depth + depth_delta

        node.parent_id = new_parent_id
        node.sort_order = sort_order
        node.path = new_path_prefix
        node.depth = new_depth
        await db.flush()
        return node

    async def soft_delete_node(self, db: AsyncSession, node_id: int) -> TreeNode:
        node = await db.get(TreeNode, node_id)
        if not node:
            raise ValueError("节点不存在")
        q = await db.execute(
            select(TreeNode).where(
                TreeNode.project_id == node.project_id,
                TreeNode.path.like(f"{node.path}%"),
            )
        )
        for n in q.scalars().all():
            n.is_deleted = True
        await db.flush()
        return node

    async def set_assignees(
        self, db: AsyncSession, node_id: int, assignees: list[dict]
    ) -> list[dict]:
        q = await db.execute(select(NodeAssignment).where(NodeAssignment.node_id == node_id))
        for row in q.scalars().all():
            await db.delete(row)
        for a in assignees:
            asg = NodeAssignment(
                node_id=node_id,
                user_id=int(a["user_id"]),
                role_key=a.get("role_key") or "primary",
            )
            db.add(asg)
        await db.flush()
        return await self.list_assignees(db, node_id)

    async def list_assignees(self, db: AsyncSession, node_id: int) -> list[dict]:
        rows = (
            await db.execute(
                select(NodeAssignment, User)
                .join(User, User.id == NodeAssignment.user_id)
                .where(NodeAssignment.node_id == node_id)
            )
        ).all()
        out = []
        for a, u in rows:
            display = (u.nickname or u.username or f"用户{u.id}").strip()
            out.append(
                {
                    "user_id": a.user_id,
                    "role_key": a.role_key,
                    "display_name": display,
                    "avatar_url": u.avatar_url,
                }
            )
        return out

    async def get_type_key(self, db: AsyncSession, node: TreeNode) -> tuple[str, str]:
        nt = await db.get(NodeType, node.node_type_id)
        if not nt:
            return ("work_item", "work_item")
        return (nt.key, nt.behavior_template)
