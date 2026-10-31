"""项目知识检索 API（阶段 3）

权限：progress.read（公司 + 项目双重隔离由检索层强制，ACL 在本层做）。
错误语义与 nodes.py 的 wiki 接口一致：404 项目不存在 / 403 非项目成员。
"""
from fastapi import APIRouter, Query

from app.core.collab_errors import fail
from app.core.dependencies import CurrentUser, DbSession
from app.models.project import Project
from app.schemas.common import ResponseData
from app.services.acl import AclService
from app.services.knowledge.search import search_chunks

router = APIRouter(tags=["知识检索"])
acl = AclService()

# top_k 请求上限（超出按 20 截断）
MAX_TOP_K = 20


@router.get("/projects/{project_id}/knowledge/search")
async def knowledge_search(
    project_id: int,
    db: DbSession,
    user: CurrentUser,
    q: str = Query(default=""),
    top_k: int | None = Query(default=None, ge=1),
):
    """在项目知识中检索"""
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "progress.read", project_id=p.id):
        return fail(403, 40301, "非项目成员")
    query = (q or "").strip()
    if not query:
        return ResponseData(data={"items": []})
    k = min(top_k, MAX_TOP_K) if top_k is not None else None
    items = await search_chunks(
        db, company_id=p.company_id, project_id=p.id, query=query, top_k=k
    )
    return ResponseData(data={"items": items})
