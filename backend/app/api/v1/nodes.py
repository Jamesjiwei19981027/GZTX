"""节点详情 / 移动 / 指派 / 材料 / 进度"""
from math import ceil

from fastapi import APIRouter, File, Form, Query, UploadFile
from sqlalchemy import func, select

from app.api.deps_collab import assert_company_write, assert_collaboration_write, get_client_channel
from app.core.collab_errors import CollabError, fail
from app.core.dependencies import CurrentUser, DbSession, CollaborationUser
from app.models.evidence import AsyncJob, EvidenceFile, EvidencePackage
from app.models.progress import AdoptionRecord, ProgressRecord
from app.models.project import Project
from app.models.tree import TreeNode
from app.models.wiki import ProjectWikiEntry
from app.schemas.common import ResponseData
from app.schemas.evidence import EvidenceReviewBody, EvidenceSubmit, ReviewConfirmBody, ReviewRequestBody, WikiCreate, WikiPatch
from app.schemas.tree import AssigneesPut, NodeMove, NodePatch
from app.services.acl import AclService
from app.services.evidence_service import (
    adopt_evidence_package,
    reject_evidence_package,
    run_evidence_judge,
    save_upload_file,
    submit_evidence,
)
from app.services.tree_service import TreeService
from app.services.responsibility_access import get_responsibility_access
from app.services.person_deletion import deletion_preview, execute_deletion
from fastapi import Depends

router = APIRouter(tags=["人轴节点与材料"])
tsvc = TreeService()
acl = AclService()


async def _reject_archived_project_write(db, project_id: int):
    project = await db.get(Project, project_id)
    if project and project.status == "archived":
        return fail(403, 40311, "归档项目不允许写入人轴或材料")
    return None


async def _node_dto(db, node: TreeNode) -> dict:
    key, tmpl = await tsvc.get_type_key(db, node)
    return {
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
        "assignees": await tsvc.list_assignees(db, node.id),
        "ui_offset": (node.progress_json or {}).get("ui_offset")
        if isinstance(node.progress_json, dict)
        else None,
        "ui_offsets": (node.progress_json or {}).get("ui_offsets") or {}
        if isinstance(node.progress_json, dict)
        else {},
    }


@router.get("/nodes/{node_id}")
async def get_node(node_id: int, db: DbSession, user: CurrentUser):
    """获取人轴节点详情"""
    node = await db.get(TreeNode, node_id)
    if not node or node.is_deleted:
        return fail(404, 40400, "节点不存在")
    if not await acl.can(
        db, user.id, node.company_id, "progress.read", project_id=node.project_id
    ):
        return fail(403, 40301, "非项目成员")
    return ResponseData(data=await _node_dto(db, node))


@router.patch("/nodes/{node_id}")
async def patch_node(node_id: int, body: NodePatch, db: DbSession, user: CurrentUser):
    """修改人轴节点"""
    node = await db.get(TreeNode, node_id)
    if not node or node.is_deleted:
        return fail(404, 40400, "节点不存在")
    archived = await _reject_archived_project_write(db, node.project_id)
    if archived:
        return archived
    try:
        await assert_company_write(db, node.company_id, feature="project_tree")
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    can = await acl.can(
        db, user.id, node.company_id, "tree.edit_any", project_id=node.project_id
    ) or await acl.can(
        db,
        user.id,
        node.company_id,
        "tree.edit_subtree",
        project_id=node.project_id,
        node_id=node.id,
    )
    if not can:
        return fail(403, 40300, "无权编辑节点")
    data = body.model_dump(exclude_unset=True)
    assignees = data.pop("assignees", None)
    responsibility_permissions = data.pop('responsibility_permissions', None)
    project = await db.get(Project, node.project_id)
    access = await get_responsibility_access(db, project, user.id)
    if assignees is not None and not access.for_node(node.id).get('can_manage_assignees'):
        return fail(403, 40300, '仅项目主责任人或其直属上级可调整人员指派')
    if responsibility_permissions and not access.for_node(node.id).get('can_manage_permissions'):
        return fail(403, 40300, "请由直属上级或项目管理人员配置节点权限")
    if responsibility_permissions and 'channel_access' in responsibility_permissions and not access.for_node(node.id).get('can_manage_channel_access'):
        return fail(403, 40300, '仅直属责任上级或项目管理人员可授权频道访问')
    if "progress_json" in data:
        return fail(422, 42200, "禁止直接修改 progress_json")
    type_key = data.pop("node_type_key", None)
    if type_key is not None:
        try:
            nt = await tsvc.resolve_type(db, type_key)
            # 属性面板的类型下拉是绕过拖拽规则的另一条路：
            # 把主干上的 person 改成 work_item，它名下的事项就会从人轴画布上消失。
            await tsvc.assert_type_change_allowed(db, node, type_key)
        except ValueError as e:
            return fail(422, 42200, str(e))
        if nt.id != node.node_type_id:
            parent = access.nodes.get(node.parent_id)
            capability = 'can_add_subordinate' if type_key == 'person' else 'can_add_work_item'
            if parent and not access.for_node(parent.id).get(capability):
                return fail(403, 40300, "上级节点不允许新增此类内容")
            origin = node.node_origin
            if type_key == 'person':
                if not access.can_edit_any:
                    origin = 'subordinate'
                try:
                    tsvc.assert_origin_attachment(origin, parent)
                except ValueError as e:
                    return fail(422, 42200, str(e))
            elif parent and origin != 'subordinate':
                origin = parent.node_origin
            node.node_origin = origin
            node.node_type_id = nt.id
            # 切换类型时重置进度模板，避免旧 template 残留
            from app.models.tree import default_progress_json

            node.progress_json = default_progress_json(nt.behavior_template)
    if assignees is not None:
        try:
            # Save the project role and its assignees in one transaction, even
            # when the editor hands their own responsibility to another person.
            await tsvc.set_assignees(db, node_id, assignees)
        except ValueError as e:
            await db.rollback()
            return fail(422, 42200, str(e))
    for k, v in data.items():
        setattr(node, k, v)
    if type_key == 'person' and assignees is None:
        await tsvc.ensure_person_members(db, node, [a['user_id'] for a in await tsvc.list_assignees(db, node.id)])
    if responsibility_permissions is not None:
        node.responsibility_permissions = {**(node.responsibility_permissions or {}), **responsibility_permissions}
    await db.commit()
    await db.refresh(node)
    return ResponseData(data=await _node_dto(db, node))


@router.post("/nodes/{node_id}/move")
async def move_node(node_id: int, body: NodeMove, db: DbSession, user: CurrentUser):
    """移动人轴节点"""
    node = await db.get(TreeNode, node_id)
    if not node or node.is_deleted:
        return fail(404, 40400, "节点不存在")
    archived = await _reject_archived_project_write(db, node.project_id)
    if archived:
        return archived
    project = await db.get(Project, node.project_id)
    access = await get_responsibility_access(db, project, user.id)
    if not access.for_node(node.id).get('can_move_person'):
        return fail(403, 40300, '仅主责任人或其上级可移动该人员分支')
    target = access.nodes.get(body.new_parent_id)
    if target and not access.for_node(target.id).get('can_add_subordinate' if await tsvc.type_key_of(db, node) == 'person' else 'can_add_work_item'):
        return fail(403, 40300, '无权移动到目标人员下')
    await assert_company_write(db, node.company_id, feature="project_tree")
    try:
        node = await tsvc.move_node(db, node_id, body.new_parent_id, body.sort_order)
    except ValueError as e:
        msg = str(e)
        if "环" in msg:
            return fail(422, 42204, msg)
        return fail(422, 42200, msg)
    await db.commit()
    await db.refresh(node)
    return ResponseData(data=await _node_dto(db, node))


@router.get('/nodes/{node_id}/deletion-preview')
async def preview_node_deletion(node_id: int, db: DbSession, user: CurrentUser):
    """预览删除节点的连锁影响"""
    node = await db.get(TreeNode, node_id)
    if not node or node.is_deleted:
        return fail(404, 40400, "节点不存在")
    project = await db.get(Project, node.project_id)
    access = await get_responsibility_access(db, project, user.id)
    if not access.for_node(node.id).get('can_delete_person'):
        return fail(403, 40300, '无权删除此人员，请由主责任人管理其下辖人员')
    return ResponseData(data=await deletion_preview(db, node, access))


@router.delete("/nodes/{node_id}")
async def delete_node(node_id: int, db: DbSession, user: CurrentUser,
    cascade: bool = False, preview_token: str | None = None, handover_to_node_id: int | None = None):
    """删除人轴节点"""
    node = await db.get(TreeNode, node_id)
    if not node or node.is_deleted:
        return fail(404, 40400, "节点不存在")
    if await tsvc.type_key_of(db, node) != 'person':
        # 工作项 / 里程碑 / 范围：轻量删除，可通过 POST /nodes/{id}/restore 撤销
        return await _delete_matter_node(db, node, user)
    project = await db.get(Project, node.project_id)
    access = await get_responsibility_access(db, project, user.id)
    if not access.for_node(node.id).get('can_delete_person'):
        return fail(403, 40300, '无权删除此人员，请由主责任人管理其下辖人员')
    await assert_company_write(db, node.company_id, feature="project_tree")
    preview = await deletion_preview(db, node, access)
    if cascade and handover_to_node_id is not None:
        return fail(422, 42200, '请选择级联删除或移交其中一种操作')
    if preview['requires_confirmation'] or cascade or handover_to_node_id is not None:
        if preview_token != preview['preview_token'] or not (cascade or handover_to_node_id is not None):
            return fail(409, 40900, '请先查看最新影响预览，再明确确认级联删除或选择移交人员')
    target = access.nodes.get(handover_to_node_id)
    if handover_to_node_id is not None and handover_to_node_id not in {n['id'] for n in preview['handover_candidates']}:
        return fail(422, 42200, '移交目标必须是本项目中有权管理的存续人员，不能是待删除分支')
    try:
        revoked = await execute_deletion(db, node, preview, handover_to=target)
    except ValueError as e:
        await db.rollback()
        return fail(422, 42200, str(e))
    await db.commit()
    return ResponseData(data={"id": node_id, "is_deleted": True, 'revoked_user_ids': revoked, 'handover_to_node_id': handover_to_node_id})


async def _can_edit_matter(db, user, node: TreeNode) -> bool:
    return await acl.can(
        db, user.id, node.company_id, "tree.edit_any", project_id=node.project_id
    ) or await acl.can(
        db,
        user.id,
        node.company_id,
        "tree.edit_subtree",
        project_id=node.project_id,
        node_id=node.id,
    )


async def _delete_matter_node(db, node: TreeNode, user):
    """删除事项节点（软删除）。不动成员关系，也不动关联任务，随时可撤销。"""
    if not await _can_edit_matter(db, user, node):
        return fail(403, 40300, "无权删除该事项")
    await assert_company_write(db, node.company_id, feature="project_tree")
    await tsvc.soft_delete_node(db, node.id)
    await db.commit()
    return ResponseData(
        data={"id": node.id, "is_deleted": True, "can_restore": True, "revoked_user_ids": []}
    )


@router.post("/nodes/{node_id}/restore")
async def restore_node(node_id: int, db: DbSession, user: CurrentUser):
    """撤销事项删除：把软删除的工作项 / 里程碑 / 范围恢复回人轴"""
    node = await db.get(TreeNode, node_id)
    if not node:
        return fail(404, 40400, "节点不存在")
    archived = await _reject_archived_project_write(db, node.project_id)
    if archived:
        return archived
    if not await _can_edit_matter(db, user, node):
        return fail(403, 40300, "无权恢复该事项")
    await assert_company_write(db, node.company_id, feature="project_tree")
    if not node.is_deleted:
        return ResponseData(data=await _node_dto(db, node))
    if await tsvc.type_key_of(db, node) == 'person':
        return fail(422, 42200, "人员节点不支持撤销删除")
    parent = await db.get(TreeNode, node.parent_id) if node.parent_id else None
    if not parent or parent.is_deleted:
        return fail(409, 40907, "所属人员已被移除，无法恢复该事项")
    node.is_deleted = False
    # 事项下的子节点（如范围）随事项一起恢复
    children = (
        await db.execute(
            select(TreeNode).where(
                TreeNode.project_id == node.project_id,
                TreeNode.path.like(f"{node.path}%"),
                TreeNode.id != node.id,
            )
        )
    ).scalars().all()
    for child in children:
        child.is_deleted = False
    await db.commit()
    await db.refresh(node)
    return ResponseData(data=await _node_dto(db, node))


@router.put("/nodes/{node_id}/assignees")
async def put_assignees(
    node_id: int, body: AssigneesPut, db: DbSession, user: CurrentUser
):
    """设置节点负责人"""
    node = await db.get(TreeNode, node_id)
    if not node or node.is_deleted:
        return fail(404, 40400, "节点不存在")
    archived = await _reject_archived_project_write(db, node.project_id)
    if archived:
        return archived
    can = await acl.can(
        db, user.id, node.company_id, "tree.edit_any", project_id=node.project_id
    ) or await acl.can(
        db,
        user.id,
        node.company_id,
        "tree.edit_subtree",
        project_id=node.project_id,
        node_id=node.id,
    )
    if not can:
        return fail(403, 40300, "无权指派")
    project = await db.get(Project, node.project_id)
    access = await get_responsibility_access(db, project, user.id)
    if not access.for_node(node.id).get('can_manage_assignees'):
        return fail(403, 40300, '无权更改下辖人员指派，请由直属上级管理')
    await assert_company_write(db, node.company_id, feature="project_tree")
    try:
        items = await tsvc.set_assignees(
            db, node_id, [a.model_dump() for a in body.assignees]
        )
    except ValueError as e:
        return fail(422, 42200, str(e))
    await db.commit()
    return ResponseData(data={"assignees": items})


@router.post("/evidence/files")
async def upload_evidence_file(
    db: DbSession,
    user: CurrentUser,
    file: UploadFile = File(...),
    company_id: int = Form(...),
    project_id: int | None = Form(None),
    channel: str = Depends(get_client_channel),
):
    """上传材料文件"""
    if project_id is None:
        return fail(422, 42200, "必须指定 project_id")
    archived = await _reject_archived_project_write(db, project_id)
    if archived:
        return archived
    try:
        await assert_company_write(db, company_id, feature="project_tree")
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    if not await acl.can(
        db, user.id, company_id, "evidence.submit", project_id=project_id
    ):
        return fail(403, 40301, "非项目成员，无法上传材料")
    p = await db.get(Project, project_id)
    if not p or p.company_id != company_id:
        return fail(422, 42200, "项目不属于该公司")

    content = await file.read()
    try:
        ef = await save_upload_file(
            db,
            user_id=user.id,
            filename=file.filename or "file.bin",
            content=content,
            mime_type=file.content_type,
            company_id=company_id,
            project_id=project_id,
        )
    except ValueError as e:
        if str(e) == "file_too_large":
            return fail(413, 41300, "文件超过大小限制")
        if str(e) == "file_empty":
            return fail(422, 42200, "空文件")
        return fail(422, 42200, str(e))
    await db.commit()
    return ResponseData(
        data={
            "file_id": ef.id,
            "original_name": ef.original_name,
            "mime_type": ef.mime_type,
            "size_bytes": ef.size_bytes,
            "sha256": ef.sha256,
            "company_id": company_id,
        }
    )


@router.post("/nodes/{node_id}/evidence")
async def post_evidence(
    node_id: int,
    body: EvidenceSubmit,
    db: DbSession,
    user: CollaborationUser,
    channel: str = Depends(get_client_channel),
):
    """为节点提交材料"""
    node = await db.get(TreeNode, node_id)
    if not node or node.is_deleted:
        return fail(404, 40400, "节点不存在")
    archived = await _reject_archived_project_write(db, node.project_id)
    if archived:
        return archived
    try:
        await assert_company_write(db, node.company_id, feature="project_tree")
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    if not await acl.can(
        db, user.id, node.company_id, "evidence.submit", project_id=node.project_id
    ):
        return fail(403, 40301, "非项目成员，无法提交材料")
    project = await db.get(Project, node.project_id)
    access = await get_responsibility_access(db, project, user.id)
    if not access.for_node(node.id).get('can_submit_evidence'):
        return fail(403, 40300, '此节点未开放材料提交权限')
    try:
        structured = dict(body.structured or {})
        if body.evidence_kind:
            structured["evidence_kind"] = body.evidence_kind
        links = list(body.links or [])
        if body.external_url:
            links.append({"url": body.external_url, "kind": body.evidence_kind or "link"})
            structured.setdefault("external_url", body.external_url)
        pkg, job = await submit_evidence(
            db,
            node=node,
            user_id=user.id,
            summary_text=body.summary_text,
            structured=structured or None,
            links=links or None,
            file_ids=body.file_ids,
            supersedes_package_id=body.supersedes_package_id,
        )
    except ValueError as e:
        if str(e) == "invalid_file_ids":
            return fail(422, 42200, "file_ids 无效或不属于当前用户/项目")
        raise
    # 抽取模式分流（EXTRACTION_MODE）：
    # off    → 内联判定（现状，测试默认确定性路径）
    # sync   → 请求内先轻量抽取（plain/markitdown 路径）再内联判定
    # worker → 不内联，extract/judge 均由 extractor worker 处理，
    #          job 保持 pending，客户端照旧轮询 /jobs/{job_id}
    from app.core.config import settings

    mode = (settings.EXTRACTION_MODE or "off").lower()
    if mode == "sync":
        from app.services.extraction.service import extract_package

        try:
            await extract_package(db, pkg.id)
        except Exception:
            # 抽取失败不阻断判定：判定器按无正文材料处理
            pass
    if mode != "worker":
        await run_evidence_judge(db, job.id)
    await db.commit()
    await db.refresh(pkg)
    await db.refresh(job)
    return ResponseData(
        data={
            "package_id": pkg.id,
            "status": pkg.status,
            "job_id": str(job.id),
        }
    )


def _pkg_dto(
    pkg: EvidencePackage,
    files: list[EvidenceFile] | None = None,
    can_review: bool = False,
    reject_reason: str | None = None,
) -> dict:
    structured = pkg.structured_json or {}
    links = pkg.links_json or []
    external_url = structured.get("external_url")
    if not external_url and isinstance(links, list) and links:
        first = links[0]
        if isinstance(first, dict):
            external_url = first.get("url")
    return {
        "id": pkg.id,
        "company_id": pkg.company_id,
        "project_id": pkg.project_id,
        "node_id": pkg.node_id,
        "submitter_user_id": pkg.submitter_user_id,
        "status": pkg.status,
        "reject_reason": reject_reason if pkg.status == "rejected" else None,
        "summary_text": pkg.summary_text,
        "structured": structured,
        "links": links,
        "evidence_kind": structured.get("evidence_kind"),
        "external_url": external_url,
        "files": [
            {
                "file_id": f.id,
                "original_name": f.original_name,
                "mime_type": f.mime_type,
                "size_bytes": f.size_bytes,
                "kind": f.kind,
            }
            for f in (files or [])
        ],
        "supersedes_package_id": pkg.supersedes_package_id,
        "precheck_errors": pkg.precheck_errors_json,
        "judge_result": pkg.judge_result_json,
        "suggestion": (pkg.judge_result_json or {}).get("decision"),
        "can_review": can_review,
        "submitted_at": pkg.submitted_at.isoformat() if pkg.submitted_at else None,
        "judged_at": pkg.judged_at.isoformat() if pkg.judged_at else None,
        "created_at": pkg.created_at.isoformat() if pkg.created_at else None,
    }


async def _rejection_reasons(db, packages) -> dict[int, str]:
    ids = [p.id for p in packages if p.status == "rejected"]
    if not ids:
        return {}
    records = (await db.execute(select(AdoptionRecord).where(
        AdoptionRecord.evidence_package_id.in_(ids), AdoptionRecord.decision == "rejected"
    ).order_by(AdoptionRecord.id.desc()))).scalars().all()
    reasons = {}
    for record in records:
        reasons.setdefault(record.evidence_package_id, record.reason or "负责人未采纳该材料")
    return reasons


async def _can_user_review_package(
    db, user_id: int, pkg: EvidencePackage
) -> tuple[bool, str | None]:
    if pkg.status != "pending_review":
        return False, "材料非待确认状态"
    if not await acl.can(
        db, user_id, pkg.company_id, "review.confirm", project_id=pkg.project_id, node_id=pkg.node_id
    ):
        return False, "无确认权限"
    if pkg.submitter_user_id == user_id:
        project = await db.get(Project, pkg.project_id)
        pm = await acl._project_member(db, pkg.project_id, user_id)
        is_pm = bool(pm and pm.role == "pm") or (project and project.pm_user_id == user_id)
        if not is_pm:
            return False, "提交人不能确认自己的材料"
    return True, None


@router.get("/evidence/{package_id}")
async def get_evidence(package_id: int, db: DbSession, user: CurrentUser):
    """获取材料包详情"""
    pkg = await db.get(EvidencePackage, package_id)
    if not pkg:
        return fail(404, 40400, "材料不存在")
    if not await acl.can(
        db, user.id, pkg.company_id, "evidence.read", project_id=pkg.project_id
    ):
        return fail(403, 40301, "非项目成员，无法查看材料")
    files = (
        await db.execute(select(EvidenceFile).where(EvidenceFile.package_id == pkg.id))
    ).scalars().all()
    can_review, _ = await _can_user_review_package(db, user.id, pkg)
    reasons = await _rejection_reasons(db, [pkg])
    return ResponseData(data=_pkg_dto(pkg, list(files), can_review=can_review, reject_reason=reasons.get(pkg.id)))


@router.post("/evidence/{package_id}/review")
async def review_evidence(
    package_id: int,
    body: EvidenceReviewBody,
    db: DbSession,
    user: CurrentUser,
):
    """人工确认材料（采纳或驳回）"""
    pkg = await db.get(EvidencePackage, package_id)
    if not pkg:
        return fail(404, 40400, "材料不存在")

    await assert_collaboration_write(db, pkg.company_id, project_id=pkg.project_id, user_id=user.id, feature="project_tree")

    if pkg.status != "pending_review":
        return fail(409, 40901, f"材料状态为 {pkg.status}，只有 pending_review 状态能确认")

    if not await acl.can(
        db, user.id, pkg.company_id, "review.confirm", project_id=pkg.project_id, node_id=pkg.node_id
    ):
        return fail(403, 40302, "无确认材料权限")

    if pkg.submitter_user_id == user.id:
        project = await db.get(Project, pkg.project_id)
        pm = await acl._project_member(db, pkg.project_id, user.id)
        is_pm = bool(pm and pm.role == "pm") or (project and project.pm_user_id == user.id)
        if not is_pm:
            return fail(403, 40303, "提交人不能确认自己的材料")

    if body.decision == "adopted":
        pkg = await adopt_evidence_package(
            db,
            package_id=pkg.id,
            reviewer_user_id=user.id,
            reason=body.reason,
        )
    elif body.decision == "rejected":
        pkg = await reject_evidence_package(
            db,
            package_id=pkg.id,
            reviewer_user_id=user.id,
            reason=body.reason,
        )
    else:
        return fail(400, 40001, "无效的确认决策")

    files = (
        await db.execute(select(EvidenceFile).where(EvidenceFile.package_id == pkg.id))
    ).scalars().all()
    can_rev, _ = await _can_user_review_package(db, user.id, pkg)
    reasons = await _rejection_reasons(db, [pkg])
    return ResponseData(data=_pkg_dto(pkg, list(files), can_review=can_rev, reject_reason=reasons.get(pkg.id)))


@router.get("/nodes/{node_id}/evidence")
async def list_evidence(
    node_id: int,
    db: DbSession,
    user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """列出节点的材料"""
    node = await db.get(TreeNode, node_id)
    if not node:
        return fail(404, 40400, "节点不存在")
    if not await acl.can(
        db, user.id, node.company_id, "evidence.read", project_id=node.project_id
    ):
        return fail(403, 40301, "非项目成员")
    total = (
        await db.execute(
            select(func.count())
            .select_from(EvidencePackage)
            .where(EvidencePackage.node_id == node_id)
        )
    ).scalar() or 0
    rows = (
        await db.execute(
            select(EvidencePackage)
            .where(EvidencePackage.node_id == node_id)
            .order_by(EvidencePackage.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    reasons = await _rejection_reasons(db, rows)
    items = []
    for p in rows:
        can_rev, _ = await _can_user_review_package(db, user.id, p)
        items.append(_pkg_dto(p, can_review=can_rev, reject_reason=reasons.get(p.id)))
    return ResponseData(
        data={
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": ceil(total / page_size) if page_size else 0,
        }
    )


@router.get("/jobs/{job_id}")
async def get_job(job_id: int, db: DbSession, user: CurrentUser):
    """查询后台任务状态"""
    job = await db.get(AsyncJob, job_id)
    if not job:
        return fail(404, 40400, "任务不存在")
    from app.models.company import CompanyMembership

    m = (
        await db.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == job.company_id,
                CompanyMembership.user_id == user.id,
                CompanyMembership.status == "active",
            )
        )
    ).scalar_one_or_none()
    if not m:
        return fail(403, 40302, "非本公司成员")
    return ResponseData(
        data={
            "job_id": str(job.id),
            "job_type": job.job_type,
            "status": job.status,
            "result": job.result_json,
            "error_message": job.error_message,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        }
    )


@router.get("/nodes/{node_id}/progress")
async def get_progress(node_id: int, db: DbSession, user: CurrentUser):
    """获取节点进度"""
    node = await db.get(TreeNode, node_id)
    if not node:
        return fail(404, 40400, "节点不存在")
    if not await acl.can(
        db, user.id, node.company_id, "progress.read", project_id=node.project_id
    ):
        return fail(403, 40301, "非项目成员")
    recs = (
        await db.execute(
            select(ProgressRecord)
            .where(ProgressRecord.node_id == node_id)
            .order_by(ProgressRecord.id.desc())
            .limit(10)
        )
    ).scalars().all()
    return ResponseData(
        data={
            "node_id": node_id,
            "progress_json": node.progress_json,
            "recent_records": [
                {
                    "id": r.id,
                    "event_type": r.event_type,
                    "source": r.source,
                    "actor_user_id": r.actor_user_id,
                    "evidence_package_id": r.evidence_package_id,
                    "review_case_id": r.review_case_id,
                    "before_json": r.before_json,
                    "after_json": r.after_json,
                    "reason": r.reason,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in recs
            ],
        }
    )


@router.get("/nodes/{node_id}/progress/records")
async def list_progress_records(
    node_id: int,
    db: DbSession,
    user: CurrentUser,
    limit: int = Query(50, ge=1, le=100),
):
    """列出节点进度记录"""
    node = await db.get(TreeNode, node_id)
    if not node:
        return fail(404, 40400, "节点不存在")
    if not await acl.can(
        db, user.id, node.company_id, "progress.read", project_id=node.project_id
    ):
        return fail(403, 40301, "非项目成员")
    recs = (
        await db.execute(
            select(ProgressRecord)
            .where(ProgressRecord.node_id == node_id)
            .order_by(ProgressRecord.id.desc())
            .limit(limit)
        )
    ).scalars().all()
    return ResponseData(
        data={
            "items": [
                {
                    "id": r.id,
                    "event_type": r.event_type,
                    "source": r.source,
                    "actor_user_id": r.actor_user_id,
                    "evidence_package_id": r.evidence_package_id,
                    "after_json": r.after_json,
                    "reason": r.reason,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in recs
            ]
        }
    )


@router.get("/projects/{project_id}/wiki")
async def list_wiki(project_id: int, db: DbSession, user: CurrentUser):
    """列出项目知识条目"""
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "progress.read", project_id=p.id):
        return fail(403, 40301, "非项目成员")
    rows = (
        await db.execute(
            select(ProjectWikiEntry)
            .where(ProjectWikiEntry.project_id == project_id,
                   ProjectWikiEntry.source.notin_(["llm_wiki_draft", "llm_wiki_review"]))
            .order_by(ProjectWikiEntry.id.desc())
        )
    ).scalars().all()
    return ResponseData(
        data={
            "items": [
                {
                    "id": w.id,
                    "title": w.title,
                    "body_text": w.body_text,
                    "source": w.source,
                    "node_id": w.node_id,
                    "created_at": w.created_at.isoformat() if w.created_at else None,
                }
                for w in rows
            ]
        }
    )


@router.get("/wiki/{wiki_id}")
async def get_wiki(wiki_id: int, db: DbSession, user: CurrentUser):
    """获取项目知识条目详情"""
    w = await db.get(ProjectWikiEntry, wiki_id)
    if not w:
        return fail(404, 40400, "wiki 不存在")
    if w.source in ("llm_wiki_draft", "llm_wiki_review") and w.created_by != user.id:
        if not await acl.can(db, user.id, w.company_id, "wiki.manual_write", project_id=w.project_id):
            return fail(403, 40300, "无权查看待确认知识草稿")
    if not await acl.can(
        db, user.id, w.company_id, "progress.read", project_id=w.project_id
    ):
        return fail(403, 40301, "非项目成员")
    return ResponseData(
        data={
            "id": w.id,
            "title": w.title,
            "body_text": w.body_text,
            "source": w.source,
            "node_id": w.node_id,
            "project_id": w.project_id,
        }
    )


@router.post("/projects/{project_id}/wiki")
async def create_wiki(
    project_id: int, body: WikiCreate, db: DbSession, user: CurrentUser
):
    """新建项目知识条目"""
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    try:
        await assert_company_write(db, p.company_id, feature="project_tree")
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    if not await acl.can(
        db, user.id, p.company_id, "wiki.manual_write", project_id=p.id
    ):
        return fail(403, 40300, "无权写 wiki")
    w = ProjectWikiEntry(
        company_id=p.company_id,
        project_id=p.id,
        node_id=body.node_id,
        title=body.title,
        body_text=body.body_text,
        source="manual",
        created_by=user.id,
    )
    db.add(w)
    await db.commit()
    await db.refresh(w)
    return ResponseData(data={"id": w.id, "title": w.title, "source": w.source})
