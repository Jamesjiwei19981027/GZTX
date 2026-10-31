"""Node capabilities: existing project ACL plus restrictive ancestor policies."""
from dataclasses import dataclass

from sqlalchemy import select

from app.models.project import Project
from app.models.tree import NodeAssignment, NodeType, TreeNode
from app.services.acl import AclService


@dataclass
class ResponsibilityAccess:
    nodes: dict[int, TreeNode]
    node_permissions: dict[str, dict[str, bool]]
    can_edit_any: bool
    can_submit_evidence: bool
    can_read_evidence: bool

    def for_node(self, node_id: int) -> dict[str, bool]:
        return self.node_permissions.get(str(node_id), {})


async def get_responsibility_access(db, project: Project, user_id: int) -> ResponsibilityAccess:
    acl = AclService()
    can_edit_all = await acl.can(db, user_id, project.company_id, 'tree.edit_subtree', project_id=project.id)
    can_edit_any = await acl.can(db, user_id, project.company_id, 'tree.edit_any', project_id=project.id)
    can_submit = await acl.can(db, user_id, project.company_id, 'evidence.submit', project_id=project.id)
    can_read = await acl.can(db, user_id, project.company_id, 'evidence.read', project_id=project.id)
    membership = await acl._membership(db, user_id, project.company_id)
    member = await acl._project_member(db, project.id, user_id)
    can_edit_owned = bool(membership and membership.employment_status == 'active' and member and project.status != 'archived')
    rows = (await db.execute(select(TreeNode).where(TreeNode.project_id == project.id, TreeNode.is_deleted.is_(False)))).scalars().all()
    nodes = {node.id: node for node in rows}
    owned_ids = set((await db.execute(select(NodeAssignment.node_id).where(
        NodeAssignment.user_id == user_id,
        NodeAssignment.node_id.in_(nodes),
        NodeAssignment.role_key.in_(('primary', 'collaborator')),
    ))).scalars().all())
    owned_paths = [nodes[node_id].path for node_id in owned_ids]
    managed_ids = set((await db.execute(select(NodeAssignment.node_id).where(
        NodeAssignment.user_id == user_id, NodeAssignment.node_id.in_(nodes),
        NodeAssignment.role_key == 'primary',
    ))).scalars().all())
    managed_paths = [nodes[node_id].path for node_id in managed_ids]
    person_types = set((await db.execute(select(NodeType.id).where(NodeType.key == 'person'))).scalars().all())
    output = {}
    for node in rows:
        owned = any(node.path.startswith(path) for path in owned_paths)
        can_edit = can_edit_all or (can_edit_owned and owned)
        # A new project-defined person starts a new ownership boundary. Owning
        # an earlier main person never takes over this main person's secondary staff.
        manages_descendant = False
        manager = nodes.get(node.parent_id)
        manager_seen = set()
        while manager and manager.id not in manager_seen:
            manager_seen.add(manager.id)
            if can_edit_owned and manager.id in managed_ids:
                manages_descendant = True
            if manager.node_origin == 'project' and manager.node_type_id in person_types:
                break
            manager = nodes.get(manager.parent_id)
        can_manage_structure = (can_edit_any if node.node_origin == 'project' else manages_descendant)
        chain, seen, current = [], set(), node
        while current and current.id not in seen:
            seen.add(current.id)
            chain.append(current.responsibility_permissions or {})
            current = nodes.get(current.parent_id)
        evidence_allowed = can_submit
        for policy in chain:
            scope = policy.get('evidence_submit', 'inherit')
            if scope == 'disabled' or scope == 'responsible' and not (owned or can_edit_any):
                evidence_allowed = False
        output[str(node.id)] = {
            'can_edit_person': can_edit,
            'can_delete_person': can_manage_structure,
            'can_move_person': can_manage_structure,
            'can_manage_assignees': can_manage_structure if node.node_origin == 'subordinate' or node.node_type_id in person_types else can_edit,
            'can_manage_channel_access': can_edit_all or manages_descendant,
            'can_manage_permissions': can_edit_all or (manages_descendant if node.node_origin == 'subordinate' else can_edit_owned and any(
                node.path != path and node.path.startswith(path) for path in owned_paths
            )),
            'can_add_subordinate': (can_edit_all or (can_edit_owned and any(node.path.startswith(path) for path in managed_paths)))
                and (can_edit_any or all(p.get('allow_add_subordinates', True) for p in chain)),
            'can_add_work_item': can_edit and (can_edit_any or all(p.get('allow_add_work_items', True) for p in chain)),
            'can_submit_evidence': evidence_allowed,
            'can_read_evidence': can_read,
        }
    return ResponsibilityAccess(nodes, output, can_edit_any, can_submit, can_read)


async def can_access_project_channels(db, project: Project, user_id: int) -> bool:
    """Secondary assignments alone grant tree access, never implicit channel access."""
    acl = AclService()
    if not await acl.can(db, user_id, project.company_id, 'project.read', project_id=project.id):
        return False
    if await acl.can(db, user_id, project.company_id, 'tree.edit_any', project_id=project.id):
        return True
    assigned = (await db.execute(select(TreeNode).join(
        NodeAssignment, NodeAssignment.node_id == TreeNode.id,
    ).join(NodeType, NodeType.id == TreeNode.node_type_id).where(
        TreeNode.project_id == project.id, TreeNode.is_deleted.is_(False),
        NodeAssignment.user_id == user_id, NodeType.key == 'person',
    ))).scalars().all()
    # Existing project members without a person assignment keep their prior access.
    return not assigned or any(n.node_origin == 'project' or (n.responsibility_permissions or {}).get('channel_access') is True for n in assigned)
