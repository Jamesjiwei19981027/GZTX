"""项目 · 成员 · 邀请 · 树 · 导入 API"""
from math import ceil
from typing import Optional

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.api.deps_collab import assert_company_write
from app.core.collab_errors import fail
from app.core.dependencies import CurrentUser, DbSession, CollaborationUser
from app.models.company import Company, CompanyMembership
from app.models.project import Project, ProjectMember
from app.models.tree import NodeAssignment, TreeNode
from app.models.user import User
from app.schemas.common import ResponseData
from app.schemas.project import (
    AssignPmBody,
    FinalOwnerPositionBody,
    ImportConfirmBody,
    ImportPreviewBody,
    InviteBody,
    ProjectCreate,
    PullMemberBody,
)
from app.schemas.tree import NodeCreate
from app.services.acl import AclService
from app.services.entitlement import EntitlementService
from app.services.import_token_store import import_token_store
from app.services.org_roles import is_org_leader
from app.services.project_service import ProjectService
from app.services.tree_service import TreeService
from app.services.responsibility_access import get_responsibility_access

router = APIRouter(tags=["项目"])
psvc = ProjectService()
tsvc = TreeService()
acl = AclService()


def _project_dto(p: Project, my_role: str | None = None, member_count: int | None = None) -> dict:
    d = {
        "id": p.id,
        "company_id": p.company_id,
        "name": p.name,
        "status": p.status,
        "pm_user_id": p.pm_user_id,
        # 产品口径：项目最终负责人 = PM（指定为准；主干顶宜对齐此人）
        "final_owner_user_id": p.pm_user_id,
        # 终责卡片沿主干的偏移，服务端持久化 → 跨端、跨设备一致
        "final_owner_along_delta": p.final_owner_along_delta or 0,
        "created_by": p.created_by,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "archived_at": p.archived_at.isoformat() if p.archived_at else None,
        "my_role": my_role,
    }
    if member_count is not None:
        d["member_count"] = member_count
    return d


async def _attach_final_owner(db, data: dict, viewer_id: int) -> dict:
    uid = data.get("final_owner_user_id") or data.get("pm_user_id")
    if not uid:
        data["final_owner"] = None
        return data
    u = await db.get(User, uid)
    if not u:
        data["final_owner"] = {
            "user_id": uid,
            "username": None,
            "nickname": None,
            "avatar_url": None,
            "is_me": False,
        }
        return data
    data["final_owner"] = {
        "user_id": u.id,
        "username": u.username,
        "nickname": u.nickname,
        "avatar_url": u.avatar_url,
        "is_me": u.id == viewer_id,
    }
    return data


async def _active_membership(db, company_id: int, user_id: int) -> CompanyMembership | None:
    q = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company_id,
            CompanyMembership.user_id == user_id,
            CompanyMembership.status == "active",
        )
    )
    return q.scalar_one_or_none()


async def _get_project(db, project_id: int) -> Project | None:
    return await db.get(Project, project_id)


@router.post("/projects")
async def create_project(body: ProjectCreate, db: DbSession, user: CollaborationUser):
    """创建项目"""
    company = await db.get(Company, body.company_id)
    if not company:
        return fail(404, 40400, "公司不存在")
    if not await is_org_leader(db, user.id, company.id):
        return fail(403, 40304, "需要组织负责人")
    ent = EntitlementService()
    if company.status == "pending_license" or not ent.is_company_unlocked(company):
        return fail(403, 40310, "需要有效 License 后方可使用")
    if not ent.has_feature(company, "project_tree"):
        return fail(403, 40312, "功能未开通: project_tree")
    try:
        p = await psvc.create_project(
            db, company=company, name=body.name, creator_user_id=user.id
        )
    except PermissionError as e:
        msg = str(e)
        if msg == "license_required":
            return fail(403, 40310, "需要有效 License 后方可使用")
        if msg == "feature_off":
            return fail(403, 40312, "功能未开通: project_tree")
        if msg.startswith("quota:"):
            return fail(409, 40901, "项目配额已满")
        return fail(403, 40300, msg)
    await db.commit()
    await db.refresh(p)
    return ResponseData(data=_project_dto(p))


@router.get("/projects")
async def list_projects(
    db: DbSession,
    user: CurrentUser,
    company_id: int = Query(...),
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    as_admin: bool = False,
):
    """列出我可见的项目"""
    m = await _active_membership(db, company_id, user.id)
    if not m:
        return fail(403, 40302, "非本公司成员")

    if as_admin and (m.is_super_admin or m.is_org_leader):
        filters = [Project.company_id == company_id]
        if status:
            filters.append(Project.status == status)
        total = (
            await db.execute(select(func.count()).select_from(Project).where(*filters))
        ).scalar() or 0
        rows = (
            await db.execute(
                select(Project)
                .where(*filters)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).scalars().all()
        items = [_project_dto(p) for p in rows]
    else:
        q = (
            select(Project, ProjectMember)
            .join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(
                Project.company_id == company_id,
                ProjectMember.user_id == user.id,
                ProjectMember.left_at.is_(None),
            )
        )
        if status:
            q = q.where(Project.status == status)
        all_rows = (await db.execute(q)).all()
        total = len(all_rows)
        page_rows = all_rows[(page - 1) * page_size : page * page_size]
        items = [_project_dto(p, my_role=pm.role) for p, pm in page_rows]

    return ResponseData(
        data={
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": ceil(total / page_size) if page_size else 0,
        }
    )


@router.get("/projects/{project_id}")
async def get_project(project_id: int, db: DbSession, user: CurrentUser):
    """获取项目详情"""
    p = await _get_project(db, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    m = await _active_membership(db, p.company_id, user.id)
    if not m:
        return fail(403, 40302, "非本公司成员")
    pm = (
        await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == p.id,
                ProjectMember.user_id == user.id,
                ProjectMember.left_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not pm and not m.is_super_admin:
        return fail(403, 40301, "非项目成员")
    cnt = (
        await db.execute(
            select(func.count())
            .select_from(ProjectMember)
            .where(ProjectMember.project_id == p.id, ProjectMember.left_at.is_(None))
        )
    ).scalar() or 0
    return ResponseData(
        data=await _attach_final_owner(
            db,
            _project_dto(p, my_role=pm.role if pm else None, member_count=cnt),
            user.id,
        )
    )


@router.get("/projects/{project_id}/my-permissions")
async def get_my_permissions(project_id: int, db: DbSession, user: CurrentUser):
    """当前用户在该项目内的权限快照（只读）。

    供前端做按钮显隐：客户端此前只能靠 pm_user_id / 成员角色 / 指派推断，
    看不见「委托授权」和「非成员超管」两条路径。最终强制方仍是 ACL/TreeService，
    本接口只是把服务端口径原样暴露出来。

    字段口径：
    - can_edit_all：不带 node_id 调 acl.can("tree.edit_subtree")——PM/超管/有效委托
      三条路都会命中，且沿用 acl 的归档项目、在职状态等写门禁。委托授权是
      项目/公司粒度（DelegationGrant 无节点列），命中即等价于全树可编辑，
      所以委托映射到 can_edit_all 而非 owned_node_ids。
    - owned_node_ids：primary/collaborator 指派的锚点节点 id，向下子树传递由
      前端沿树展开（与 acl._owns_path 的祖先前缀匹配同口径）。
    - can_move / can_delete：move/delete 接口只认 tree.edit_any（委托白名单里
      没有它），故委托用户拿不到这两项。
    """
    p = await _get_project(db, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "progress.read", project_id=p.id):
        return fail(403, 40301, "非项目成员")

    m = await _active_membership(db, p.company_id, user.id)
    is_superadmin = bool(m and m.is_super_admin)
    pm_row = (
        await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == p.id,
                ProjectMember.user_id == user.id,
                ProjectMember.left_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    is_member = pm_row is not None
    is_pm = bool(pm_row and pm_row.role == "pm") or (
        p.pm_user_id is not None and p.pm_user_id == user.id
    )

    can_edit_all = await acl.can(
        db, user.id, p.company_id, "tree.edit_subtree", project_id=p.id
    )
    # 非 PM 非超管拿到 tree.edit_subtree（无 node_id）只可能走委托这一条路
    via_delegation = bool(can_edit_all and not is_pm and not is_superadmin)
    can_move_delete = await acl.can(
        db, user.id, p.company_id, "tree.edit_any", project_id=p.id
    )

    owned_node_ids = (
        await db.execute(
            select(NodeAssignment.node_id)
            .join(TreeNode, TreeNode.id == NodeAssignment.node_id)
            .where(
                NodeAssignment.user_id == user.id,
                NodeAssignment.role_key.in_(("primary", "collaborator")),
                TreeNode.project_id == p.id,
                TreeNode.is_deleted.is_(False),
            )
            .distinct()
        )
    ).scalars().all()

    role = (
        "pm"
        if is_pm
        else "superadmin"
        if is_superadmin
        else "member"
        if is_member
        else "outsider"
    )
    responsibility_access = await get_responsibility_access(db, p, user.id)
    return ResponseData(
        data={
            "role": role,
            "is_pm": is_pm,
            "is_superadmin": is_superadmin,
            "can_edit_all": can_edit_all,
            "owned_node_ids": sorted(owned_node_ids),
            "via_delegation": via_delegation,
            "can_move": can_move_delete,
            "can_delete": can_move_delete,
            "can_submit_evidence": responsibility_access.can_submit_evidence,
            "can_read_evidence": responsibility_access.can_read_evidence,
            "node_permissions": responsibility_access.node_permissions,
        }
    )


@router.put("/projects/{project_id}/final-owner-position")
async def set_final_owner_position(
    project_id: int, body: FinalOwnerPositionBody, db: DbSession, user: CurrentUser
):
    """已停用：人轴改为单根树后客户端不再使用，仅为旧客户端兼容保留。
    保存终责卡片沿主干的偏移量。

    产品规则：**仅项目 PM 或项目创建者可拖**。此前这条规则只在两端客户端里判断，
    偏移量也只存在本机（localStorage / SharedPreferences），既不跨端同步，
    也没有任何服务端承载——换个客户端直接调接口就能改别人看到的布局。
    """
    p = await _get_project(db, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if user.id not in (p.pm_user_id, p.created_by):
        return fail(403, 40305, "仅项目负责人或创建者可调整终责位置")
    await assert_company_write(db, p.company_id, feature="project_tree")

    p.final_owner_along_delta = max(0, int(body.along_delta))
    await db.commit()
    return ResponseData(
        data={
            "project_id": p.id,
            "final_owner_along_delta": p.final_owner_along_delta,
        }
    )


@router.post("/projects/{project_id}/pm")
async def assign_pm(
    project_id: int, body: AssignPmBody, db: DbSession, user: CurrentUser
):
    """指定项目经理"""
    p = await _get_project(db, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(
        db, user.id, p.company_id, "project.assign_pm", project_id=p.id
    ):
        return fail(403, 40300, "无权指定 PM")
    await assert_company_write(db, p.company_id, feature="project_tree")
    try:
        await psvc.assign_pm(db, p, body.user_id)
    except ValueError as e:
        return fail(422, 42200, str(e))
    await db.commit()
    return ResponseData(data={"project_id": p.id, "pm_user_id": p.pm_user_id})


@router.post("/projects/{project_id}/members")
async def pull_member(
    project_id: int, body: PullMemberBody, db: DbSession, user: CurrentUser
):
    """把企业成员拉入项目"""
    p = await _get_project(db, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "member.pull", project_id=p.id):
        return fail(403, 40305, "需要 PM")
    await assert_company_write(db, p.company_id, feature="project_tree")
    try:
        row = await psvc.pull_member(db, p, body.user_id)
    except PermissionError as e:
        code_map = {
            "not_company_member": (403, 40302, "对方非本公司成员"),
            "employment_inactive": (403, 40314, "对方在职状态无效"),
            "already_member": (409, 40903, "成员已存在"),
        }
        http, code, msg = code_map.get(str(e), (403, 40300, str(e)))
        return fail(http, code, msg)
    await db.commit()
    return ResponseData(
        data={
            "project_id": p.id,
            "user_id": row.user_id,
            "role": row.role,
            "joined_at": row.joined_at.isoformat() if row.joined_at else None,
        }
    )


@router.post("/projects/{project_id}/invitations")
async def create_invitation(
    project_id: int, body: InviteBody, db: DbSession, user: CurrentUser
):
    """创建项目邀请链接"""
    p = await _get_project(db, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "member.pull", project_id=p.id):
        return fail(403, 40305, "需要 PM")
    if not body.user_id and not body.email:
        return fail(422, 42200, "user_id 与 email 二选一")
    inv = await psvc.create_invitation(
        db, p, invitee_user_id=body.user_id, invitee_email=body.email
    )
    await db.commit()
    return ResponseData(
        data={
            "id": inv.id,
            "token": inv.token,
            "status": inv.status,
            "expires_at": inv.expires_at.isoformat() if inv.expires_at else None,
        }
    )


@router.post("/projects/invitations/{token}/accept")
async def accept_invitation(token: str, db: DbSession, user: CollaborationUser):
    """接受项目邀请"""
    try:
        member = await psvc.accept_invitation(db, token, user.id)
    except PermissionError as e:
        if str(e) == "membership_inactive":
            return fail(403, 40314, "当前公司成员状态无效，请联系管理员恢复")
        return fail(403, 40300, "邀请不匹配当前用户")
    except ValueError as e:
        return fail(422, 42200, str(e))
    await db.commit()
    return ResponseData(data={"project_id": member.project_id, "role": member.role})


@router.post("/projects/{project_id}/leave")
async def leave_project(project_id: int, db: DbSession, user: CurrentUser):
    """退出项目"""
    p = await _get_project(db, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    try:
        left_at = await psvc.leave(db, p, user.id)
    except ValueError as e:
        return fail(422, 42200, str(e))
    await db.commit()
    return ResponseData(data={"left_at": left_at.isoformat()})


@router.post("/projects/{project_id}/archive")
async def archive_project(project_id: int, db: DbSession, user: CurrentUser):
    """归档项目"""
    p = await _get_project(db, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "tree.edit_any", project_id=p.id):
        m = await _active_membership(db, p.company_id, user.id)
        if not m or not m.is_super_admin:
            return fail(403, 40305, "需要 PM 或超管")
    await psvc.archive(db, p)
    await db.commit()
    return ResponseData(
        data={
            "status": p.status,
            "archived_at": p.archived_at.isoformat() if p.archived_at else None,
        }
    )


@router.get("/projects/{project_id}/members")
async def list_project_members(project_id: int, db: DbSession, user: CurrentUser):
    """列出项目成员"""
    p = await _get_project(db, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "evidence.read", project_id=p.id):
        return fail(403, 40301, "非项目成员")
    rows = (
        await db.execute(
            select(ProjectMember, User)
            .join(User, User.id == ProjectMember.user_id)
            .where(ProjectMember.project_id == p.id)
        )
    ).all()
    items = [
        {
            "user_id": pm.user_id,
            "nickname": u.nickname,
            "username": u.username,
            "display_name": (u.nickname or u.username or f"用户{u.id}").strip(),
            "avatar_url": u.avatar_url,
            "role": pm.role,
            "joined_at": pm.joined_at.isoformat() if pm.joined_at else None,
            "left_at": pm.left_at.isoformat() if pm.left_at else None,
        }
        for pm, u in rows
    ]
    return ResponseData(data={"items": items})


async def _node_dto(db, node: TreeNode, with_children: bool = False) -> dict:
    key, tmpl = await tsvc.get_type_key(db, node)
    assignees = await tsvc.list_assignees(db, node.id)
    d = {
        "id": node.id,
        "parent_id": node.parent_id,
        "node_type_key": key,
        "behavior_template": tmpl,
        "title": node.title,
        "description": node.description,
        "node_origin": node.node_origin,
        "responsibility_permissions": node.responsibility_permissions or {},
        "sort_order": node.sort_order,
        "path": node.path,
        "depth": node.depth,
        "start_at": node.start_at.isoformat() if node.start_at else None,
        "due_at": node.due_at.isoformat() if node.due_at else None,
        "milestone_at": node.milestone_at.isoformat() if node.milestone_at else None,
        "allow_clear_text_progress": node.allow_clear_text_progress,
        "progress_json": node.progress_json,
        "assignees": assignees,
        "ui_offset": (node.progress_json or {}).get("ui_offset")
        if isinstance(node.progress_json, dict)
        else None,
    }
    return d


async def _node_dtos_batched(db, nodes: list[TreeNode]) -> list[dict]:
    """批量序列化人轴节点，避免每个节点各查一次类型和 assignees（2N+1）。"""
    if not nodes:
        return []

    from app.models.tree import NodeAssignment, NodeType

    type_ids = {node.node_type_id for node in nodes}
    type_rows = (
        await db.execute(select(NodeType).where(NodeType.id.in_(type_ids)))
    ).scalars().all()
    types_by_id = {row.id: row for row in type_rows}

    node_ids = [node.id for node in nodes]
    assignment_rows = (
        await db.execute(
            select(NodeAssignment, User)
            .join(User, User.id == NodeAssignment.user_id)
            .where(NodeAssignment.node_id.in_(node_ids))
            .order_by(NodeAssignment.id)
        )
    ).all()
    assignees_by_node: dict[int, list[dict]] = {node_id: [] for node_id in node_ids}
    for assignment, assignee in assignment_rows:
        assignees_by_node[assignment.node_id].append(
            {
                "user_id": assignment.user_id,
                "role_key": assignment.role_key,
                "display_name": (assignee.nickname or assignee.username or f"用户{assignee.id}").strip(),
                "avatar_url": assignee.avatar_url,
            }
        )

    dtos = []
    for node in nodes:
        node_type = types_by_id.get(node.node_type_id)
        key = node_type.key if node_type else "work_item"
        tmpl = node_type.behavior_template if node_type else "work_item"
        progress = node.progress_json or {}
        dtos.append(
            {
                "id": node.id,
                "parent_id": node.parent_id,
                "node_type_key": key,
                "behavior_template": tmpl,
                "title": node.title,
                "description": node.description,
                "node_origin": node.node_origin,
                "responsibility_permissions": node.responsibility_permissions or {},
                "sort_order": node.sort_order,
                "path": node.path,
                "depth": node.depth,
                "start_at": node.start_at.isoformat() if node.start_at else None,
                "due_at": node.due_at.isoformat() if node.due_at else None,
                "milestone_at": node.milestone_at.isoformat() if node.milestone_at else None,
                "allow_clear_text_progress": node.allow_clear_text_progress,
                "progress_json": node.progress_json,
                "assignees": assignees_by_node[node.id],
                "ui_offset": progress.get("ui_offset") if isinstance(progress, dict) else None,
            }
        )
    return dtos


@router.get("/projects/{project_id}/tree")
async def get_tree(
    project_id: int,
    db: DbSession,
    user: CurrentUser,
    format: str = Query("nested"),
):
    """获取项目人轴工作树"""
    p = await _get_project(db, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "progress.read", project_id=p.id):
        return fail(403, 40301, "非项目成员")
    rows = (
        await db.execute(
            select(TreeNode)
            .where(TreeNode.project_id == p.id, TreeNode.is_deleted.is_(False))
            .order_by(TreeNode.sort_order, TreeNode.id)
        )
    ).scalars().all()
    dtos = await _node_dtos_batched(db, list(rows))
    if format == "flat":
        return ResponseData(data={"project_id": p.id, "nodes": dtos})

    by_id = {d["id"]: {**d, "children": []} for d in dtos}
    roots = []
    for d in by_id.values():
        pid = d["parent_id"]
        if pid and pid in by_id:
            by_id[pid]["children"].append(d)
        else:
            roots.append(d)
    return ResponseData(data={"project_id": p.id, "nodes": roots})


@router.post("/projects/{project_id}/nodes")
async def create_node(
    project_id: int, body: NodeCreate, db: DbSession, user: CurrentUser
):
    """在人轴工作树中新建节点"""
    p = await _get_project(db, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    access = await get_responsibility_access(db, p, user.id)
    can = await acl.can(
        db, user.id, p.company_id, "tree.edit_any", project_id=p.id
    ) or (
        body.parent_id is not None
        and await acl.can(
            db,
            user.id,
            p.company_id,
            "tree.edit_subtree",
            project_id=p.id,
            node_id=body.parent_id,
        )
    )
    if not can:
        return fail(403, 40300, "无权编辑树")
    if body.parent_id is not None:
        capability = 'can_add_subordinate' if body.node_type_key == 'person' else 'can_add_work_item'
        if not access.for_node(body.parent_id).get(capability):
            return fail(403, 40300, '上级节点未开放此项新增权限')
    parent = access.nodes.get(body.parent_id)
    origin = body.node_origin or ('project' if access.can_edit_any and (not parent or parent.node_origin == 'project') else 'subordinate')
    if body.node_type_key == 'person' and origin == 'project' and not access.can_edit_any:
        return fail(403, 40300, '仅项目管理人员可定义项目骨架')
    await assert_company_write(db, p.company_id, feature="project_tree")
    try:
        node = await tsvc.create_node(
            db,
            p,
            parent_id=body.parent_id,
            node_type_key=body.node_type_key,
            title=body.title,
            description=body.description,
            sort_order=body.sort_order,
            start_at=body.start_at,
            due_at=body.due_at,
            milestone_at=body.milestone_at,
            allow_clear_text_progress=body.allow_clear_text_progress,
            created_by=user.id,
            assignees=[a.model_dump() for a in body.assignees],
            node_origin=origin,
            responsibility_permissions=body.responsibility_permissions.model_dump(),
        )
    except ValueError as e:
        msg = str(e)
        if "环" in msg:
            return fail(422, 42204, msg)
        return fail(422, 42200, msg)
    await db.commit()
    await db.refresh(node)
    return ResponseData(data=await _node_dto(db, node))


@router.get('/projects/{project_id}/tasks')
async def list_project_tasks(project_id: int, db: DbSession, user: CurrentUser,
    page: int = Query(1, ge=1), page_size: int = Query(100, ge=1, le=500)):
    """列出项目下的任务"""
    from sqlalchemy.orm import selectinload
    from app.models.task import Task
    from app.models.task_assignment import TaskAssignment
    from app.api.v1.tasks import _serialize_task

    project = await _get_project(db, project_id)
    if not project:
        return fail(404, 40400, '项目不存在')
    if not await acl.can(db, user.id, project.company_id, 'project.read', project_id=project.id):
        return fail(403, 40301, '非项目成员')
    filters = (Task.project_id == project.id, Task.company_id == project.company_id,
        Task.origin == 'project_link', Task.is_deleted.is_(False))
    total = (await db.execute(select(func.count()).select_from(Task).where(*filters))).scalar() or 0
    rows = (await db.execute(select(Task).where(*filters).options(
        selectinload(Task.category), selectinload(Task.tags), selectinload(Task.reminders),
        selectinload(Task.assignees).selectinload(TaskAssignment.user),
    ).order_by(Task.created_at.desc(), Task.id.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    return ResponseData(data={'items': [_serialize_task(task) for task in rows], 'total': total,
        'page': page, 'page_size': page_size, 'total_pages': ceil(total / page_size)})


@router.post("/projects/{project_id}/import/preview")
async def import_preview(
    project_id: int, body: ImportPreviewBody, db: DbSession, user: CurrentUser
):
    """预览批量导入结果"""
    import secrets
    from app.models.task import Task

    p = await _get_project(db, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "tree.edit_any", project_id=p.id):
        return fail(403, 40305, "需要 PM")
    tasks = (
        await db.execute(
            select(Task).where(
                Task.id.in_(body.task_ids),
                Task.user_id == user.id,
                Task.is_deleted.is_(False),
            )
        )
    ).scalars().all()
    preview = [
        {"task_id": t.id, "title": t.title, "status": t.status, "origin": getattr(t, "origin", "personal")}
        for t in tasks
    ]
    token = secrets.token_urlsafe(24)
    import_token_store.set(
        token,
        {
            "project_id": project_id,
            "user_id": user.id,
            "task_ids": [t.id for t in tasks],
            "parent_node_id": body.parent_node_id,
        },
        ttl_sec=600,
    )
    return ResponseData(
        data={"confirm_token": token, "items": preview, "count": len(preview)}
    )


@router.post("/projects/{project_id}/import/confirm")
async def import_confirm(
    project_id: int, body: ImportConfirmBody, db: DbSession, user: CurrentUser
):
    """确认执行批量导入"""
    from app.models.task import Task

    payload = import_token_store.get(body.confirm_token)
    if not payload or payload.get("project_id") != project_id or payload.get("user_id") != user.id:
        return fail(422, 42203, "确认令牌无效或已过期")
    p = await _get_project(db, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "tree.edit_any", project_id=p.id):
        return fail(403, 40305, "需要 PM")
    await assert_company_write(db, p.company_id, feature="project_tree")

    # 导入的任务一律建成 work_item，按人轴规则必须落在某个「人」下面；
    # parent_node_id 为空会建出 work_item 根节点，违反「主干只排人」。
    parent_node_id = payload.get("parent_node_id")
    if parent_node_id is None:
        return fail(422, 42200, "导入需要指定挂载的「人」节点")

    created = []
    for tid in payload.get("task_ids") or []:
        t = await db.get(Task, tid)
        if not t or t.user_id != user.id:
            continue
        try:
            node = await tsvc.create_node(
                db,
                p,
                parent_id=parent_node_id,
                node_type_key="work_item",
                title=t.title,
                description=t.description,
                created_by=user.id,
            )
        except ValueError as e:
            return fail(422, 42200, str(e))
        t.origin = "project_link"
        t.company_id = p.company_id
        t.project_id = p.id
        t.project_node_id = node.id
        t.linked_readonly = True
        created.append({"task_id": t.id, "node_id": node.id})
    import_token_store.delete(body.confirm_token)
    await db.commit()
    return ResponseData(data={"imported": created})
