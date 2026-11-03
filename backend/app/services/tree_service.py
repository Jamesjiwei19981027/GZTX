"""树 path 物化 / move / 软删"""
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project, ProjectMember
from app.models.tree import NodeAssignment, NodeType, TreeNode, default_progress_json
from app.models.user import User


BUILTIN_TYPES = {
    "person": ("人", "person"),
    "scope": ("范围", "scope"),
    "work_item": ("工作项", "work_item"),
    "milestone": ("里程碑", "milestone"),
}

PERSON_TYPE_KEY = "person"
# 事项类型：工作项 / 里程碑 / 范围，只能挂在人下面
MATTER_TYPE_KEYS = frozenset({"work_item", "milestone", "scope"})
MAX_PERSON_LEVELS = 4


class TreeShapeError(ValueError):
    """违反人轴形态规则。message 可直接展示给用户。"""


def dedupe_assignees(assignees: list[dict]) -> list[tuple[int, str]]:
    """把入参归一成 (user_id, role_key) 并按首次出现顺序去重。

    node_assignments 上有 (node_id, user_id, role_key) 唯一约束，重复入参会直接
    抛 IntegrityError；同一个人重复指派本身就没有语义，这里静默折叠。
    """
    seen: set[tuple[int, str]] = set()
    result: list[tuple[int, str]] = []
    for a in assignees or []:
        pair = (int(a["user_id"]), a.get("role_key") or "primary")
        if pair in seen:
            continue
        seen.add(pair)
        result.append(pair)
    return result


class TreeService:
    async def ensure_person_members(self, db, node, user_ids):
        """Assigning responsibility admits an active company person to this project."""
        if await self.type_key_of(db, node) != PERSON_TYPE_KEY:
            return
        for user_id in set(user_ids):
            membership = (await db.execute(select(ProjectMember).where(
                ProjectMember.project_id == node.project_id, ProjectMember.user_id == user_id,
            ))).scalar_one_or_none()
            if membership is None:
                db.add(ProjectMember(project_id=node.project_id, user_id=user_id, role='member'))
            elif membership.left_at is not None:
                membership.left_at = None
                membership.role = 'member'
        await db.flush()

    async def assert_person_limit(self, db, *, parent, subtree=None):
        """Count person nodes, independently of item depth, including moved descendants."""
        from app.core.config import settings
        if not settings.ENFORCE_WORK_TREE_SHAPE:
            return
        ancestors = 0
        current, seen = parent, set()
        while current and current.id not in seen:
            seen.add(current.id)
            ancestors += int(await self.type_key_of(db, current) == PERSON_TYPE_KEY)
            current = await db.get(TreeNode, current.parent_id) if current.parent_id else None
        height = 1
        if subtree:
            rows = (await db.execute(select(TreeNode).where(TreeNode.project_id == subtree.project_id,
                TreeNode.path.like(f'{subtree.path}%'), TreeNode.is_deleted.is_(False)))).scalars().all()
            person_paths = [n.path for n in rows if await self.type_key_of(db, n) == PERSON_TYPE_KEY]
            height = max((sum(path.startswith(ancestor) for ancestor in person_paths) for path in person_paths), default=1)
        if ancestors + height > MAX_PERSON_LEVELS:
            raise TreeShapeError("人员最多四层（终责人 + 三层下属）")

    async def assert_distinct_supervisor(self, db, node_type_key, parent, assignees):
        from app.core.config import settings
        if not settings.ENFORCE_WORK_TREE_SHAPE:
            return
        if node_type_key != PERSON_TYPE_KEY or not parent:
            return
        parent_owners = set((await db.execute(select(NodeAssignment.user_id).where(
            NodeAssignment.node_id == parent.id, NodeAssignment.role_key == 'primary',
        ))).scalars().all())
        owners = {int(a['user_id']) for a in assignees or [] if a.get('role_key', 'primary') == 'primary'}
        if parent_owners & owners:
            raise TreeShapeError('人员不能担任自己的直属上级')

    @staticmethod
    def assert_origin_attachment(origin: str, parent: TreeNode | None) -> None:
        if origin == 'subordinate' and parent is None:
            raise TreeShapeError('下辖分支必须通过人员节点的下辖挂载点连接')
        if origin == 'project' and parent and parent.node_origin == 'subordinate':
            raise TreeShapeError('项目定义节点不能挂入下辖分支，请选择项目定义的上级')

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

    async def type_key_of(self, db: AsyncSession, node: TreeNode) -> str:
        nt = await db.get(NodeType, node.node_type_id)
        return nt.key if nt else ""

    async def project_root(self, db: AsyncSession, project_id: int) -> TreeNode | None:
        return (await db.execute(select(TreeNode).where(
            TreeNode.project_id == project_id, TreeNode.parent_id.is_(None), TreeNode.is_deleted.is_(False)
        ).order_by(TreeNode.sort_order, TreeNode.id).limit(1))).scalar_one_or_none()

    async def assert_shape(
        self, db: AsyncSession, *, node_type_key: str, parent: TreeNode | None,
        project_id: int, exclude_node_id: int | None = None
    ) -> None:
        """强制人轴形态规则（产品已锁定）：

        - 主干只排人：根节点（parent_id=None）必须是 person；
        - 单根：每个项目只能有一个终责根节点；
        - 事项只能落到人身上：work_item / milestone / scope 的父节点必须是 person；
        - 人挂人 = 下级人员，允许。

        这些规则此前只在 Web 的 dropRules.ts 与 APP 画布里拦，后端 create/move/patch
        零校验：任何成员直接调 API 就能造出 work_item 当根、person 挂在 milestone 下
        的树，而三端共享同一份数据，人轴布局的前提被打破（不挂人下的事项在画布上
        直接消失）。

        ENFORCE_WORK_TREE_SHAPE=false 可临时关闭，仅供存量非人轴数据的过渡期使用。
        """
        from app.core.config import settings

        if not settings.ENFORCE_WORK_TREE_SHAPE:
            return

        if parent is None:
            if node_type_key != PERSON_TYPE_KEY:
                raise TreeShapeError("主干只能排人：根节点必须是「人」")
            q = select(TreeNode.id).where(
                TreeNode.project_id == project_id,
                TreeNode.parent_id.is_(None),
                TreeNode.is_deleted.is_(False),
            )
            if exclude_node_id is not None:
                q = q.where(TreeNode.id != exclude_node_id)
            if (await db.execute(q.limit(1))).scalar_one_or_none() is not None:
                raise TreeShapeError("每个项目只能有一个终责根节点，请把此人挂到终责人或其下属下面")
            return

        parent_key = await self.type_key_of(db, parent)
        if parent_key != PERSON_TYPE_KEY:
            raise TreeShapeError("事项只能挂在「人」下面，不能挂到其它事项上")

    async def assert_root_owner(self, db: AsyncSession, project: Project, assignees: list[dict] | None) -> None:
        from app.core.config import settings
        if not settings.ENFORCE_WORK_TREE_SHAPE:
            return
        if project.pm_user_id is None:
            return
        owners = [
            int(a["user_id"])
            for a in (assignees or [])
            if a.get("role_key", "primary") == "primary" and a.get("user_id") is not None
        ]
        if project.pm_user_id not in owners:
            raise TreeShapeError("终责根节点必须是项目负责人")

    async def assert_type_change_allowed(
        self, db: AsyncSession, node: TreeNode, new_type_key: str
    ) -> None:
        """改类型同样要守住人轴形态。

        两个方向都要看：
        - 新类型放在当前父节点下合不合法（根必须是人 / 事项必须挂人下）；
        - 改完之后自己的子节点还合不合法：只有人能当父，所以一个有子节点的 person
          不能被改成事项，否则整棵子树在画布上失去挂载点。
        """
        from app.core.config import settings

        if not settings.ENFORCE_WORK_TREE_SHAPE:
            return
        if new_type_key == await self.type_key_of(db, node):
            return

        parent = await db.get(TreeNode, node.parent_id) if node.parent_id else None
        await self.assert_shape(db, node_type_key=new_type_key, parent=parent, project_id=node.project_id, exclude_node_id=node.id)
        if new_type_key == PERSON_TYPE_KEY:
            await self.assert_person_limit(db, parent=parent, subtree=node)

        if new_type_key != PERSON_TYPE_KEY:
            child = (
                await db.execute(
                    select(TreeNode.id)
                    .where(
                        TreeNode.parent_id == node.id,
                        TreeNode.is_deleted.is_(False),
                    )
                    .limit(1)
                )
            ).scalar_one_or_none()
            if child is not None:
                raise TreeShapeError(
                    "该节点下还挂着内容，改成事项后它们将失去挂载点；"
                    "请先移走子节点再改类型"
                )

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
        node_origin: str = "project",
        responsibility_permissions: dict | None = None,
    ) -> TreeNode:
        nt = await self.resolve_type(db, node_type_key)
        parent = None
        depth = 0
        if parent_id is not None:
            parent = await db.get(TreeNode, parent_id)
            if not parent or parent.project_id != project.id or parent.is_deleted:
                raise ValueError("父节点不存在")
            depth = parent.depth + 1
        await self.assert_shape(db, node_type_key=node_type_key, parent=parent, project_id=project.id)
        if parent is None:
            await self.assert_root_owner(db, project, assignees)
        await self.assert_distinct_supervisor(db, node_type_key, parent, assignees)
        if node_type_key == PERSON_TYPE_KEY:
            from app.core.config import settings
            if settings.ENFORCE_WORK_TREE_SHAPE:
                self.assert_origin_attachment(node_origin, parent)
            await self.assert_person_limit(db, parent=parent)
        elif parent:
            node_origin = parent.node_origin

        node = TreeNode(
            company_id=project.company_id,
            project_id=project.id,
            parent_id=parent_id,
            node_type_id=nt.id,
            title=title,
            description=description,
            node_origin=node_origin,
            responsibility_permissions=responsibility_permissions or {},
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
            pairs = dedupe_assignees(assignees)
            await self.assert_assignable(db, project.company_id, [uid for uid, _ in pairs])
            for user_id, role_key in pairs:
                db.add(
                    NodeAssignment(node_id=node.id, user_id=user_id, role_key=role_key)
                )
            await db.flush()
            await self.ensure_person_members(db, node, [uid for uid, _ in pairs])
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

        from app.core.config import settings
        if settings.ENFORCE_WORK_TREE_SHAPE and node.parent_id is None and new_parent_id is not None:
            raise TreeShapeError("终责根节点不能挂到别人下面")

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

        await self.assert_shape(db, node_type_key=await self.type_key_of(db, node), parent=parent,
            project_id=node.project_id, exclude_node_id=node.id if parent is None else None)
        await self.assert_distinct_supervisor(db, await self.type_key_of(db, node), parent,
            await self.list_assignees(db, node.id))
        if await self.type_key_of(db, node) == PERSON_TYPE_KEY:
            if settings.ENFORCE_WORK_TREE_SHAPE:
                self.assert_origin_attachment(node.node_origin, parent)
            await self.assert_person_limit(db, parent=parent, subtree=node)
        elif parent and node.node_origin != 'subordinate':
            node.node_origin = parent.node_origin

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

    async def assert_assignable(
        self, db: AsyncSession, company_id: int, user_ids: list[int]
    ) -> None:
        """指派对象必须是本公司在职成员。

        此前完全不校验：任意 user_id 都能写进 node_assignments，而
        list_assignees 会 join users 回读昵称和头像 —— 等于给了一个
        按 id 遍历全系统用户身份信息的接口。
        """
        wanted = {int(u) for u in user_ids}
        if not wanted:
            return
        from app.models.company import CompanyMembership

        rows = (
            await db.execute(
                select(CompanyMembership.user_id).where(
                    CompanyMembership.company_id == company_id,
                    CompanyMembership.user_id.in_(wanted),
                    CompanyMembership.status == "active",
                    CompanyMembership.employment_status == "active",
                )
            )
        ).scalars().all()
        missing = wanted - set(rows)
        if missing:
            raise ValueError("指派对象非本公司在职成员")

    async def set_assignees(
        self, db: AsyncSession, node_id: int, assignees: list[dict]
    ) -> list[dict]:
        node = await db.get(TreeNode, node_id)
        if node is None:
            raise ValueError("节点不存在")
        pairs = dedupe_assignees(assignees)
        await self.assert_assignable(db, node.company_id, [uid for uid, _ in pairs])
        parent = await db.get(TreeNode, node.parent_id) if node.parent_id else None
        await self.assert_distinct_supervisor(db, await self.type_key_of(db, node), parent, assignees)
        # Changing a manager's assignment must not make an existing child its own manager.
        proposed_owners = {uid for uid, role in pairs if role == 'primary'}
        if proposed_owners and await self.type_key_of(db, node) == PERSON_TYPE_KEY:
            duplicate_child = (await db.execute(select(NodeAssignment.user_id).join(
                TreeNode, TreeNode.id == NodeAssignment.node_id,
            ).where(TreeNode.parent_id == node.id, TreeNode.is_deleted.is_(False),
                NodeAssignment.role_key == 'primary', NodeAssignment.user_id.in_(proposed_owners),
            ).limit(1))).scalar_one_or_none()
            if duplicate_child is not None:
                raise TreeShapeError('人员不能担任自己的直属上级')

        q = await db.execute(select(NodeAssignment).where(NodeAssignment.node_id == node_id))
        for row in q.scalars().all():
            await db.delete(row)
        # 先把删除落库，避免与下面的重新插入在同一 flush 里撞唯一约束
        await db.flush()
        for user_id, role_key in pairs:
            db.add(NodeAssignment(node_id=node_id, user_id=user_id, role_key=role_key))
        await db.flush()
        await self.ensure_person_members(db, node, [uid for uid, _ in pairs])
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
