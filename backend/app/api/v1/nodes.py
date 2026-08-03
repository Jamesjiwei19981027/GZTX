"""节点详情 / 移动 / 指派 / 材料 / 进度"""
from math import ceil

from fastapi import APIRouter, File, Form, Query, UploadFile
from sqlalchemy import func, select

from app.api.deps_collab import assert_company_write, get_client_channel
from app.core.collab_errors import CollabError, fail
from app.core.dependencies import CurrentUser, DbSession, VerifiedUser
from app.models.evidence import AsyncJob, EvidenceFile, EvidencePackage
from app.models.progress import ProgressRecord
from app.models.project import Project
from app.models.tree import TreeNode
from app.models.wiki import ProjectWikiEntry
from app.schemas.common import ResponseData
from app.schemas.evidence import EvidenceSubmit, ReviewConfirmBody, ReviewRequestBody, WikiCreate, WikiPatch
from app.schemas.tree import AssigneesPut, NodeMove, NodePatch
from app.services.acl import AclService
from app.services.evidence_service import run_evidence_judge, save_upload_file, submit_evidence
from app.services.tree_service import TreeService
from fastapi import Depends

router = APIRouter(tags=["nodes"])
tsvc = TreeService()
acl = AclService()


async def _node_dto(db, node: TreeNode) -> dict:
    key, tmpl = await tsvc.get_type_key(db, node)
    return {
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
        "assignees": await tsvc.list_assignees(db, node.id),
        "ui_offset": (node.progress_json or {}).get("ui_offset")
        if isinstance(node.progress_json, dict)
        else None,
    }


@router.get("/nodes/{node_id}")
async def get_node(node_id: int, db: DbSession, user: CurrentUser):
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
    node = await db.get(TreeNode, node_id)
    if not node or node.is_deleted:
        return fail(404, 40400, "节点不存在")
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
            node.node_type_id = nt.id
            # 切换类型时重置进度模板，避免旧 template 残留
            from app.models.tree import default_progress_json

            node.progress_json = default_progress_json(nt.behavior_template)
    for k, v in data.items():
        setattr(node, k, v)
    await db.commit()
    await db.refresh(node)
    return ResponseData(data=await _node_dto(db, node))


@router.post("/nodes/{node_id}/move")
async def move_node(node_id: int, body: NodeMove, db: DbSession, user: CurrentUser):
    node = await db.get(TreeNode, node_id)
    if not node or node.is_deleted:
        return fail(404, 40400, "节点不存在")
    if not await acl.can(
        db, user.id, node.company_id, "tree.edit_any", project_id=node.project_id
    ):
        return fail(403, 40305, "需要 PM")
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


@router.delete("/nodes/{node_id}")
async def delete_node(node_id: int, db: DbSession, user: CurrentUser):
    node = await db.get(TreeNode, node_id)
    if not node:
        return fail(404, 40400, "节点不存在")
    if not await acl.can(
        db, user.id, node.company_id, "tree.edit_any", project_id=node.project_id
    ):
        return fail(403, 40305, "需要 PM")
    await assert_company_write(db, node.company_id, feature="project_tree")
    await tsvc.soft_delete_node(db, node_id)
    await db.commit()
    return ResponseData(data={"id": node_id, "is_deleted": True})


@router.put("/nodes/{node_id}/assignees")
async def put_assignees(
    node_id: int, body: AssigneesPut, db: DbSession, user: CurrentUser
):
    node = await db.get(TreeNode, node_id)
    if not node or node.is_deleted:
        return fail(404, 40400, "节点不存在")
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
    if channel == "wechat":
        return fail(403, 40320, "微信通道禁止上传材料文件")
    if project_id is None:
        return fail(422, 42200, "必须指定 project_id")
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
    user: VerifiedUser,
    channel: str = Depends(get_client_channel),
):
    if channel == "wechat":
        return fail(403, 40320, "微信通道禁止提交材料")
    node = await db.get(TreeNode, node_id)
    if not node or node.is_deleted:
        return fail(404, 40400, "节点不存在")
    try:
        await assert_company_write(db, node.company_id, feature="project_tree")
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    if not await acl.can(
        db, user.id, node.company_id, "evidence.submit", project_id=node.project_id
    ):
        return fail(403, 40301, "非项目成员，无法提交材料")
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
    # P0: run judge inline for deterministic tests
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


def _pkg_dto(pkg: EvidencePackage, files: list[EvidenceFile] | None = None) -> dict:
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
        "submitted_at": pkg.submitted_at.isoformat() if pkg.submitted_at else None,
        "judged_at": pkg.judged_at.isoformat() if pkg.judged_at else None,
        "created_at": pkg.created_at.isoformat() if pkg.created_at else None,
    }


@router.get("/evidence/{package_id}")
async def get_evidence(package_id: int, db: DbSession, user: CurrentUser):
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
    return ResponseData(data=_pkg_dto(pkg, list(files)))


@router.get("/nodes/{node_id}/evidence")
async def list_evidence(
    node_id: int,
    db: DbSession,
    user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
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
    return ResponseData(
        data={
            "items": [_pkg_dto(p) for p in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": ceil(total / page_size) if page_size else 0,
        }
    )


@router.get("/jobs/{job_id}")
async def get_job(job_id: int, db: DbSession, user: CurrentUser):
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
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "progress.read", project_id=p.id):
        return fail(403, 40301, "非项目成员")
    rows = (
        await db.execute(
            select(ProjectWikiEntry)
            .where(ProjectWikiEntry.project_id == project_id)
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
    w = await db.get(ProjectWikiEntry, wiki_id)
    if not w:
        return fail(404, 40400, "wiki 不存在")
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
