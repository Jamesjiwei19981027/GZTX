"""项目路径 ACL（含 P1 委托 grants）"""
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import CompanyMembership
from app.models.delegation import DelegationGrant
from app.models.project import Project, ProjectMember
from app.models.tree import NodeAssignment, TreeNode
from app.services.org_roles import is_org_leader


class AclService:
    async def _membership(
        self, db: AsyncSession, user_id: int, company_id: int
    ) -> CompanyMembership | None:
        q = await db.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == company_id,
                CompanyMembership.user_id == user_id,
                CompanyMembership.status == "active",
            )
        )
        return q.scalar_one_or_none()

    async def _project_member(
        self, db: AsyncSession, project_id: int, user_id: int
    ) -> ProjectMember | None:
        q = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user_id,
                ProjectMember.left_at.is_(None),
            )
        )
        return q.scalar_one_or_none()

    async def _has_delegation(
        self,
        db: AsyncSession,
        user_id: int,
        company_id: int,
        action: str,
        project_id: int | None,
    ) -> bool:
        """P1: 读 delegation_grants.actions_json"""
        now = datetime.now(timezone.utc)
        filters = [
            DelegationGrant.company_id == company_id,
            DelegationGrant.grantee_user_id == user_id,
            DelegationGrant.status == "active",
            or_(
                DelegationGrant.valid_to.is_(None),
                DelegationGrant.valid_to > now,
            ),
        ]
        if project_id is not None:
            filters.append(
                or_(
                    DelegationGrant.project_id.is_(None),
                    DelegationGrant.project_id == project_id,
                )
            )
        else:
            filters.append(DelegationGrant.project_id.is_(None))

        q = await db.execute(select(DelegationGrant).where(*filters))
        for g in q.scalars().all():
            actions = list(g.actions_json or [])
            # 禁止历史 "*" 超级委托在运行时生效
            if action in actions:
                return True
        return False

    async def can(
        self,
        db: AsyncSession,
        user_id: int,
        company_id: int,
        action: str,
        *,
        project_id: int | None = None,
        node_id: int | None = None,
    ) -> bool:
        m = await self._membership(db, user_id, company_id)
        if not m:
            return False

        write_actions = {
            "project.create_empty",
            "project.assign_pm",
            "tree.edit_any",
            "tree.edit_subtree",
            "member.pull",
            "evidence.submit",
            "progress.write_formal",
            "wiki.manual_write",
            "review.confirm",
        }
        if action in write_actions and m.employment_status != "active":
            return False

        if m.is_super_admin and project_id is not None and action in write_actions:
            # 归档项目对所有人只读，超管也不例外（要改先取消归档）
            archived_project = await db.get(Project, project_id)
            if (
                archived_project is not None
                and archived_project.company_id == company_id
                and archived_project.status == "archived"
            ):
                return False

        if m.is_super_admin:
            if action in (
                "project.assign_pm",
                "audit.read",
                "project.create_empty",
                "tree.edit_any",
                "member.pull",
                "evidence.read",
                "progress.read",
                "review.confirm",
                "wiki.manual_write",
                "project.read",
                "progress.nudge",
                "review.read",
            ):
                return True

        if action == "project.create_empty":
            return await is_org_leader(db, user_id, company_id)

        # 公司级委托（无 project 时）
        if project_id is None:
            if await self._has_delegation(db, user_id, company_id, action, None):
                return True
            return False

        project = await db.get(Project, project_id)
        if not project or project.company_id != company_id:
            return False

        if project.status == "archived" and action in write_actions:
            return False

        # 委托优先于「非成员」拒绝：被授权人可无 project_members 仍能执行 actions
        if await self._has_delegation(db, user_id, company_id, action, project_id):
            return True

        pm = await self._project_member(db, project_id, user_id)
        is_pm = bool(pm and pm.role == "pm") or (
            project.pm_user_id is not None and project.pm_user_id == user_id
        )
        is_member = pm is not None

        if action in ("project.read", "progress.nudge", "review.read"):
            return is_member or m.is_super_admin

        if action == "project.assign_pm":
            return m.is_super_admin or project.created_by == user_id or is_pm

        if action in ("tree.edit_any", "member.pull", "review.confirm", "wiki.manual_write"):
            return is_pm or m.is_super_admin

        if action in ("evidence.read", "progress.read", "audit.read"):
            return is_member or m.is_super_admin

        if action == "evidence.submit":
            return is_member

        if action == "progress.write_formal":
            return is_pm or m.is_super_admin

        if action == "tree.edit_subtree":
            if is_pm or m.is_super_admin:
                return True
            if not is_member or node_id is None:
                return False
            return await self._owns_path(db, user_id, node_id)

        return False

    async def _owns_path(self, db: AsyncSession, user_id: int, node_id: int) -> bool:
        node = await db.get(TreeNode, node_id)
        if not node or node.is_deleted:
            return False
        # direct assignment on node or ancestor
        q = await db.execute(
            select(NodeAssignment, TreeNode)
            .join(TreeNode, TreeNode.id == NodeAssignment.node_id)
            .where(
                NodeAssignment.user_id == user_id,
                NodeAssignment.role_key.in_(("primary", "collaborator")),
                TreeNode.project_id == node.project_id,
                TreeNode.is_deleted.is_(False),
            )
        )
        for _asg, owned in q.all():
            if node.path.startswith(owned.path):
                return True
        return False
