"""项目服务"""
import secrets
from datetime import datetime, timezone, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company, CompanyMembership
from app.models.project import Project, ProjectInvitation, ProjectMember
from app.services.entitlement import EntitlementService, QuotaExceeded
from app.services.tree_service import TreeService


class ProjectService:
    async def create_project(
        self, db: AsyncSession, *, company: Company, name: str, creator_user_id: int
    ) -> Project:
        ent = EntitlementService()
        if not ent.is_company_unlocked(company):
            raise PermissionError("license_required")
        if not ent.has_feature(company, "project_tree"):
            raise PermissionError("feature_off")
        count = (
            await db.execute(
                select(func.count())
                .select_from(Project)
                .where(Project.company_id == company.id)
            )
        ).scalar() or 0
        try:
            ent.check_quota(company, "max_projects", int(count))
        except QuotaExceeded as e:
            raise PermissionError(f"quota:{e.metric}") from e

        p = Project(
            company_id=company.id,
            name=name,
            status="draft",
            created_by=creator_user_id,
            pm_user_id=creator_user_id,
        )
        db.add(p)
        await db.flush()
        # 创建者自动成为项目成员（PM），避免项目列表为空、无法进入协作
        db.add(
            ProjectMember(
                project_id=p.id,
                user_id=creator_user_id,
                role="pm",
            )
        )
        await db.flush()
        await TreeService().ensure_builtin_types(db)
        return p

    async def assign_pm(
        self, db: AsyncSession, project: Project, user_id: int
    ) -> Project:
        mq = await db.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == project.company_id,
                CompanyMembership.user_id == user_id,
                CompanyMembership.status == "active",
                CompanyMembership.employment_status == "active",
            )
        )
        if not mq.scalar_one_or_none():
            raise ValueError("指定用户非本公司在职成员")

        old_pm = project.pm_user_id
        if old_pm and old_pm != user_id:
            oq = await db.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == project.id,
                    ProjectMember.user_id == old_pm,
                    ProjectMember.left_at.is_(None),
                )
            )
            old = oq.scalar_one_or_none()
            if old:
                old.role = "member"

        project.pm_user_id = user_id
        if project.status == "draft":
            project.status = "active"

        pq = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project.id,
                ProjectMember.user_id == user_id,
                ProjectMember.left_at.is_(None),
            )
        )
        pm = pq.scalar_one_or_none()
        if pm:
            pm.role = "pm"
        else:
            db.add(
                ProjectMember(project_id=project.id, user_id=user_id, role="pm")
            )
        await db.flush()
        return project

    async def pull_member(
        self, db: AsyncSession, project: Project, user_id: int
    ) -> ProjectMember:
        mq = await db.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == project.company_id,
                CompanyMembership.user_id == user_id,
                CompanyMembership.status == "active",
            )
        )
        m = mq.scalar_one_or_none()
        if not m:
            raise PermissionError("not_company_member")
        if m.employment_status != "active":
            raise PermissionError("employment_inactive")

        pq = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project.id,
                ProjectMember.user_id == user_id,
                ProjectMember.left_at.is_(None),
            )
        )
        if pq.scalar_one_or_none():
            raise PermissionError("already_member")

        # rejoin if left
        left_q = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project.id,
                ProjectMember.user_id == user_id,
            )
        )
        existing = left_q.scalar_one_or_none()
        if existing and existing.left_at is not None:
            existing.left_at = None
            existing.role = "member"
            existing.joined_at = datetime.now(timezone.utc)
            await db.flush()
            return existing

        row = ProjectMember(project_id=project.id, user_id=user_id, role="member")
        db.add(row)
        await db.flush()
        return row

    async def create_invitation(
        self,
        db: AsyncSession,
        project: Project,
        *,
        invitee_user_id: int | None = None,
        invitee_email: str | None = None,
    ) -> ProjectInvitation:
        from app.api.deps_collab import assert_collaboration_write
        await assert_collaboration_write(db, project.company_id, project_id=project.id)
        token = secrets.token_urlsafe(32)
        inv = ProjectInvitation(
            project_id=project.id,
            invitee_user_id=invitee_user_id,
            invitee_email=invitee_email,
            token=token,
            status="pending",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db.add(inv)
        await db.flush()
        return inv

    async def accept_invitation(
        self, db: AsyncSession, token: str, user_id: int
    ) -> ProjectMember:
        q = await db.execute(
            select(ProjectInvitation).where(ProjectInvitation.token == token)
        )
        inv = q.scalar_one_or_none()
        if not inv or inv.status != "pending":
            raise ValueError("邀请无效")
        # SQLite 读回的 expires_at 是 naive，直接与 aware 的 now 比较会抛 TypeError
        # （默认 SQLite 部署下本接口曾必然 500）；先归一化再比。
        from app.utils.datetime import as_utc

        if inv.expires_at and as_utc(inv.expires_at) < datetime.now(timezone.utc):
            raise ValueError("邀请已过期")
        if inv.invitee_user_id and inv.invitee_user_id != user_id:
            raise PermissionError("邀请不匹配")
        if inv.invitee_email and not inv.invitee_user_id:
            # 邮箱邀请：必须由该邮箱的所有者接受，否则拿到链接的任何人都能入项目
            from app.models.user import User

            u = await db.get(User, user_id)
            invited = (inv.invitee_email or "").strip().lower()
            actual = ((u.email if u else None) or "").strip().lower()
            if not actual or actual != invited:
                raise PermissionError("邀请不匹配")
        project = await db.get(Project, inv.project_id)
        if not project:
            raise ValueError("项目不存在")
        from app.api.deps_collab import assert_collaboration_write
        await assert_collaboration_write(db, project.company_id, project_id=project.id)
        # 接受一封有效的项目邀请就是加入该公司的授权依据。首次受邀者此前
        # 不会有 CompanyMembership，若仍要求先由管理员手工加入公司，会让
        # 「邀请链接 → 加入项目」的标准协作链断在半路。已有但已停用/离职的
        # 成员不自动复活，仍由管理员按离职流程恢复，避免邀请绕过收权。
        membership_q = await db.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == project.company_id,
                CompanyMembership.user_id == user_id,
            )
        )
        membership = membership_q.scalar_one_or_none()
        if membership is None:
            db.add(
                CompanyMembership(
                    company_id=project.company_id,
                    user_id=user_id,
                    status="active",
                    employment_status="active",
                    is_super_admin=False,
                    is_org_leader=False,
                )
            )
            await db.flush()
        elif membership.status != "active" or membership.employment_status != "active":
            raise PermissionError("membership_inactive")

        # 有效的待处理邀请即使对应用户已经是项目成员，也应完成当前邀请的状态收口，
        # 返回现有成员记录；但已接受的邀请仍保持一次性，入口处会拒绝重复使用。
        existing_q = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project.id,
                ProjectMember.user_id == user_id,
                ProjectMember.left_at.is_(None),
            )
        )
        member = existing_q.scalar_one_or_none()
        if member is None:
            member = await self.pull_member(db, project, user_id)
        inv.status = "accepted"
        await db.flush()
        return member

    async def leave(self, db: AsyncSession, project: Project, user_id: int) -> datetime:
        if project.pm_user_id == user_id:
            # check if only pm
            raise ValueError("PM 离开前须先转让 PM")
        q = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project.id,
                ProjectMember.user_id == user_id,
                ProjectMember.left_at.is_(None),
            )
        )
        pm = q.scalar_one_or_none()
        if not pm:
            raise ValueError("非项目成员")
        now = datetime.now(timezone.utc)
        pm.left_at = now
        await db.flush()
        return now

    async def archive(self, db: AsyncSession, project: Project) -> Project:
        project.status = "archived"
        project.archived_at = datetime.now(timezone.utc)
        await db.flush()
        return project

    async def unarchive(self, db: AsyncSession, project: Project) -> Project:
        """取消归档：恢复为进行中，清除归档时间。"""
        project.status = "active"
        project.archived_at = None
        await db.flush()
        return project
