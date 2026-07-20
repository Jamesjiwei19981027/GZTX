"""项目 · 成员 · 邀请 · 树 · 导入 API"""
from math import ceil
from typing import Optional

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.core.collab_errors import fail
from app.core.dependencies import CurrentUser, DbSession
from app.models.company import Company, CompanyMembership
from app.models.project import Project, ProjectMember
from app.models.tree import TreeNode
from app.models.user import User
from app.schemas.common import ResponseData
from app.schemas.project import (
    AssignPmBody,
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

router = APIRouter(tags=["projects"])
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
        "created_by": p.created_by,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "archived_at": p.archived_at.isoformat() if p.archived_at else None,
        "my_role": my_role,
    }
    if member_count is not None:
        d["member_count"] = member_count
    return d


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
async def create_project(body: ProjectCreate, db: DbSession, user: CurrentUser):
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
        data=_project_dto(p, my_role=pm.role if pm else None, member_count=cnt)
    )


@router.post("/projects/{project_id}/pm")
async def assign_pm(
    project_id: int, body: AssignPmBody, db: DbSession, user: CurrentUser
):
    p = await _get_project(db, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(
        db, user.id, p.company_id, "project.assign_pm", project_id=p.id
    ):
        return fail(403, 40300, "无权指定 PM")
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
    p = await _get_project(db, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "member.pull", project_id=p.id):
        return fail(403, 40305, "需要 PM")
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
async def accept_invitation(token: str, db: DbSession, user: CurrentUser):
    try:
        member = await psvc.accept_invitation(db, token, user.id)
    except PermissionError:
        return fail(403, 40300, "邀请不匹配当前用户")
    except ValueError as e:
        return fail(422, 42200, str(e))
    await db.commit()
    return ResponseData(data={"project_id": member.project_id, "role": member.role})


@router.post("/projects/{project_id}/leave")
async def leave_project(project_id: int, db: DbSession, user: CurrentUser):
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
        "sort_order": node.sort_order,
        "path": node.path,
        "depth": node.depth,
        "start_at": node.start_at.isoformat() if node.start_at else None,
        "due_at": node.due_at.isoformat() if node.due_at else None,
        "milestone_at": node.milestone_at.isoformat() if node.milestone_at else None,
        "allow_clear_text_progress": node.allow_clear_text_progress,
        "progress_json": node.progress_json,
        "assignees": assignees,
    }
    return d


@router.get("/projects/{project_id}/tree")
async def get_tree(
    project_id: int,
    db: DbSession,
    user: CurrentUser,
    format: str = Query("nested"),
):
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
    dtos = [await _node_dto(db, n) for n in rows]
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
    p = await _get_project(db, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    target_node = body.parent_id
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
        )
    except ValueError as e:
        msg = str(e)
        if "环" in msg:
            return fail(422, 42204, msg)
        return fail(422, 42200, msg)
    await db.commit()
    await db.refresh(node)
    return ResponseData(data=await _node_dto(db, node))


@router.post("/projects/{project_id}/import/preview")
async def import_preview(
    project_id: int, body: ImportPreviewBody, db: DbSession, user: CurrentUser
):
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
    from app.models.task import Task

    payload = import_token_store.get(body.confirm_token)
    if not payload or payload.get("project_id") != project_id or payload.get("user_id") != user.id:
        return fail(422, 42203, "确认令牌无效或已过期")
    p = await _get_project(db, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "tree.edit_any", project_id=p.id):
        return fail(403, 40305, "需要 PM")

    created = []
    for tid in payload.get("task_ids") or []:
        t = await db.get(Task, tid)
        if not t or t.user_id != user.id:
            continue
        node = await tsvc.create_node(
            db,
            p,
            parent_id=payload.get("parent_node_id"),
            node_type_key="work_item",
            title=t.title,
            description=t.description,
            created_by=user.id,
        )
        t.origin = "project_link"
        t.company_id = p.company_id
        t.project_id = p.id
        t.project_node_id = node.id
        t.linked_readonly = True
        created.append({"task_id": t.id, "node_id": node.id})
    import_token_store.delete(body.confirm_token)
    await db.commit()
    return ResponseData(data={"imported": created})
