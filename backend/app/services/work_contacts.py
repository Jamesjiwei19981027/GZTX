"""Private-chat initiation follows project responsibility relationships."""
from sqlalchemy import select
from app.models.company import CompanyMembership
from app.models.project import Project, ProjectMember
from app.models.tree import TreeNode, NodeAssignment, NodeType


async def allowed_work_contacts(db, company_id: int, user_id: int, project_id: int | None = None) -> set[int]:
    active_ids = set((await db.execute(select(CompanyMembership.user_id).where(
        CompanyMembership.company_id == company_id, CompanyMembership.status == 'active',
        CompanyMembership.employment_status == 'active',
    ))).scalars().all())
    memberships = (await db.execute(select(ProjectMember, Project).join(Project, Project.id == ProjectMember.project_id).where(
        Project.company_id == company_id, Project.status != 'archived', ProjectMember.left_at.is_(None),
    ))).all()
    by_project = {}
    projects = {}
    for member, project in memberships:
        if project_id is not None and project.id != project_id:
            continue
        by_project.setdefault(project.id, set()).add(member.user_id)
        projects[project.id] = project
    eligible = set()
    for pid, members in by_project.items():
        project = projects[pid]
        if user_id not in members:
            continue
        if project.pm_user_id == user_id:
            eligible.update(members)
            continue
        nodes = (await db.execute(select(TreeNode).join(NodeType, NodeType.id == TreeNode.node_type_id).where(
            TreeNode.project_id == pid, TreeNode.is_deleted.is_(False), NodeType.key == 'person',
        ))).scalars().all()
        owners = {}
        if nodes:
            for nid, uid in (await db.execute(select(NodeAssignment.node_id, NodeAssignment.user_id).where(
                NodeAssignment.node_id.in_([n.id for n in nodes]), NodeAssignment.role_key == 'primary',
            ))).all():
                owners.setdefault(nid, set()).add(uid)
        mine = [n for n in nodes if user_id in owners.get(n.id, set())]
        for own in mine:
            if own.parent_id is None and project.pm_user_id:
                eligible.add(project.pm_user_id)
            for node in nodes:
                if node.id == own.parent_id or node.parent_id == own.id or node.parent_id == own.parent_id:
                    eligible.update(owners.get(node.id, set()) & members)
    return (eligible & active_ids) - {user_id}
