"""Preview and execute explicit person subtree deletion or content handover."""
import hashlib
import json
from datetime import datetime, timezone

from sqlalchemy import delete, select

from app.models.evidence import EvidencePackage
from app.models.project import Project, ProjectMember
from app.models.shell import DirectConversation, DirectConversationMember
from app.models.task import Task
from app.models.tree import NodeAssignment, NodeType, TreeNode
from app.services.tree_service import TreeService


async def deletion_preview(db, node, access):
    nodes = list(access.nodes.values())
    subtree = sorted((n for n in nodes if n.path.startswith(node.path)), key=lambda n: n.id)
    ids = [n.id for n in subtree]
    assignments = (await db.execute(select(NodeAssignment).where(NodeAssignment.node_id.in_(ids)))).scalars().all()
    type_keys = dict((await db.execute(select(NodeType.id, NodeType.key))).all())
    tasks = (await db.execute(select(Task).where(Task.project_id == node.project_id,
        Task.project_node_id.in_(ids), Task.is_deleted.is_(False)))).scalars().all()
    evidence_ids = list((await db.execute(select(EvidencePackage.id).where(EvidencePackage.node_id.in_(ids)))).scalars().all())
    users = sorted({a.user_id for a in assignments})
    candidates = [n for n in nodes if n.id not in ids and type_keys.get(n.node_type_id) == 'person'
        and access.for_node(n.id).get('can_add_work_item')
        and (n.node_origin == 'project' or access.for_node(n.id).get('can_delete_person'))]
    state = {'nodes': [(n.id, n.parent_id, n.title, n.node_type_id, n.node_origin, n.responsibility_permissions) for n in subtree],
        'assignments': sorted((a.node_id, a.user_id, a.role_key) for a in assignments),
        'tasks': sorted((t.id, t.project_node_id, t.updated_at.isoformat() if t.updated_at else None) for t in tasks),
        'evidence': sorted(evidence_ids)}
    token = hashlib.sha256(json.dumps(state, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return {
        'node_id': node.id,
        'descendants': [{'id': n.id, 'title': n.title, 'node_type_key': type_keys.get(n.node_type_id), 'node_origin': n.node_origin} for n in subtree if n.id != node.id],
        'descendant_count': len(subtree) - 1,
        'affected_user_ids': users,
        'affected_task_count': len(tasks),
        'affected_evidence_count': len(evidence_ids),
        'handover_candidates': [{'id': n.id, 'title': n.title} for n in candidates],
        'requires_confirmation': len(subtree) > 1 or bool(tasks),
        'warning': f'将影响 {len(subtree) - 1} 个下辖节点、{len(users)} 位责任人员、{len(tasks)} 个关联任务。级联删除会将关联任务移入回收站，并撤销无其他人员职责的成员在本项目的权限和群聊成员身份；历史消息与材料保留。也可先移交全部内容给仍在项目中的人员。',
        'preview_token': token,
    }


async def revoke_unassigned_project_members(db, project_id, user_ids):
    project = await db.get(Project, project_id)
    remaining = set((await db.execute(select(NodeAssignment.user_id).join(TreeNode, TreeNode.id == NodeAssignment.node_id)
        .join(NodeType, NodeType.id == TreeNode.node_type_id).where(TreeNode.project_id == project_id,
        TreeNode.is_deleted.is_(False), NodeType.key == 'person', NodeAssignment.user_id.in_(user_ids)))).scalars().all())
    revoked = set(user_ids) - remaining - {project.pm_user_id, project.created_by}
    memberships = (await db.execute(select(ProjectMember).where(ProjectMember.project_id == project_id,
        ProjectMember.user_id.in_(revoked), ProjectMember.left_at.is_(None)))).scalars().all()
    now = datetime.now(timezone.utc)
    for member in memberships:
        if member.role != 'pm':
            member.left_at = now
    await db.execute(delete(DirectConversationMember).where(DirectConversationMember.user_id.in_(revoked),
        DirectConversationMember.conversation_id.in_(select(DirectConversation.id).where(DirectConversation.project_id == project_id))))
    return sorted(revoked)


async def execute_deletion(db, node, preview, *, handover_to=None):
    service = TreeService()
    subtree_ids = [node.id, *[n['id'] for n in preview['descendants']]]
    tasks = (await db.execute(select(Task).where(Task.project_id == node.project_id,
        Task.project_node_id.in_(subtree_ids), Task.is_deleted.is_(False)))).scalars().all()
    if handover_to:
        # Validate all children before making any move: a later validation failure
        # must not partially hand over an earlier child.
        children = (await db.execute(select(TreeNode).where(TreeNode.parent_id == node.id, TreeNode.is_deleted.is_(False)))).scalars().all()
        target_type = await service.type_key_of(db, handover_to)
        if target_type != 'person':
            raise ValueError('移交目标必须是仍在项目中的人员')
        for child in children:
            key = await service.type_key_of(db, child)
            await service.assert_shape(db, node_type_key=key, parent=handover_to)
            if key == 'person':
                service.assert_origin_attachment(child.node_origin, handover_to)
                await service.assert_person_limit(db, parent=handover_to, subtree=child)
            await service.assert_distinct_supervisor(db, key, handover_to, await service.list_assignees(db, child.id))
        for child in children:
            await service.move_node(db, child.id, handover_to.id, child.sort_order)
        for task in tasks:
            if task.project_node_id == node.id:
                task.project_node_id = handover_to.id
        node.is_deleted = True
    else:
        await service.soft_delete_node(db, node.id)
        for task in tasks:
            task.is_deleted = True
            task.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return await revoke_unassigned_project_members(db, node.project_id, preview['affected_user_ids'])
