"""Project-scoped LLM Wiki: read, propose, then publish through existing ACL."""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps_collab import assert_company_write
from app.core.dependencies import CurrentUser, DbSession
from app.models.evidence import EvidencePackage
from app.models.project import Project
from app.models.wiki import ProjectWikiEntry
from app.schemas.common import ResponseData
from app.services.acl import AclService
from app.services.project_wiki import DRAFT, entry_dto, generate_draft, published_pages, publish_draft
from app.services.project_wiki_engine import inspect_wiki
from app.services.responsibility_access import get_responsibility_access

router = APIRouter(tags=["项目 AI 知识库"])
acl = AclService()


class DraftRequest(BaseModel):
    package_id: int = Field(gt=0)


async def project_access(db, project_id, user, *, write=False):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    if not await acl.can(db, user.id, project.company_id, "evidence.read", project_id=project.id):
        raise HTTPException(403, "无权查看该项目知识")
    if write:
        await assert_company_write(db, project.company_id, feature="project_tree")
    return project


@router.get("/projects/{project_id}/llm-wiki")
async def catalog(project_id: int, db: DbSession, user: CurrentUser, q: str = Query("", max_length=200)):
    """获取项目 AI 知识库目录"""
    project = await project_access(db, project_id, user)
    can_publish = await acl.can(db, user.id, project.company_id, "wiki.manual_write", project_id=project.id)
    pages = await published_pages(db, project)
    try:
        engine = await inspect_wiki([entry_dto(row) for row in pages], query=q.strip())
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from None
    matched = {row["id"] for row in engine["matches"]}
    draft_query = select(ProjectWikiEntry).where(ProjectWikiEntry.company_id == project.company_id,
        ProjectWikiEntry.project_id == project.id, ProjectWikiEntry.source == DRAFT)
    if not can_publish:
        draft_query = draft_query.where(ProjectWikiEntry.created_by == user.id)
    drafts = list((await db.execute(draft_query.order_by(ProjectWikiEntry.id.desc()))).scalars().all())
    packages = list((await db.execute(select(EvidencePackage).where(
        EvidencePackage.company_id == project.company_id, EvidencePackage.project_id == project.id,
        EvidencePackage.status.notin_(["superseded", "rejected"])).order_by(EvidencePackage.id.desc()))).scalars().all())
    access = await get_responsibility_access(db, project, user.id)
    return ResponseData(data={"engine": engine["engine"], "can_publish": can_publish,
        "pages": [entry_dto(row) for row in pages if not q.strip() or row.id in matched],
        "drafts": [entry_dto(row) for row in drafts], "lint": engine["lint"],
        "materials": [{"id": row.id, "node_id": row.node_id, "status": row.status,
                       "title": (row.summary_text or f"材料 #{row.id}").splitlines()[0][:120],
                       "can_generate": can_publish or bool(access.for_node(row.node_id).get("can_submit_evidence"))}
                      for row in packages]})


@router.post("/projects/{project_id}/llm-wiki/drafts")
async def draft(project_id: int, body: DraftRequest, db: DbSession, user: CurrentUser):
    """生成项目 AI 知识库草稿"""
    project = await project_access(db, project_id, user, write=True)
    await assert_company_write(db, project.company_id, feature="agents")
    package = (await db.execute(select(EvidencePackage).where(EvidencePackage.id == body.package_id,
        EvidencePackage.project_id == project.id, EvidencePackage.company_id == project.company_id))).scalar_one_or_none()
    if not package:
        raise HTTPException(404, "材料不存在于当前项目")
    can_publish = await acl.can(db, user.id, project.company_id, "wiki.manual_write", project_id=project.id)
    access = await get_responsibility_access(db, project, user.id)
    if not can_publish and not access.for_node(package.node_id).get("can_submit_evidence"):
        raise HTTPException(403, "无权整理该事项材料")
    result = await generate_draft(db, project, package, user)
    await db.commit()
    return ResponseData(data=result)


@router.post("/projects/{project_id}/llm-wiki/drafts/{draft_id}/publish")
async def publish(project_id: int, draft_id: int, db: DbSession, user: CurrentUser):
    """发布项目 AI 知识库草稿"""
    project = await project_access(db, project_id, user, write=True)
    if not await acl.can(db, user.id, project.company_id, "wiki.manual_write", project_id=project.id):
        raise HTTPException(403, "仅有项目 Wiki 管理权限的人员可以发布")
    row = (await db.execute(select(ProjectWikiEntry).where(ProjectWikiEntry.id == draft_id,
        ProjectWikiEntry.project_id == project.id, ProjectWikiEntry.company_id == project.company_id,
        ProjectWikiEntry.source.in_([DRAFT, "llm_wiki_review"])))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "草稿不存在于当前项目")
    try:
        result = await publish_draft(db, project, row, user)
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return ResponseData(data=result)
