"""汇报策略与手工运行 §13"""
from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.collab_errors import fail
from app.core.dependencies import CurrentUser, DbSession
from app.models.project import Project
from app.models.report import ReportPolicy
from app.schemas.common import ResponseData
from app.services.acl import AclService
from app.services.report_runner import ensure_default_policy, run_manual_report

router = APIRouter(tags=["reports"])
acl = AclService()


class ReportRunBody(BaseModel):
    policy_id: int | None = None
    trigger: str = Field(default="manual_confirm")


@router.get("/projects/{project_id}/report-policies")
async def list_report_policies(project_id: int, db: DbSession, user: CurrentUser):
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "progress.read", project_id=p.id):
        return fail(403, 40300, "无权查看汇报策略")

    await ensure_default_policy(db, company_id=p.company_id, project_id=p.id)
    await db.commit()

    rows = (
        await db.execute(
            select(ReportPolicy).where(ReportPolicy.project_id == project_id)
        )
    ).scalars().all()
    return ResponseData(
        data={
            "items": [
                {
                    "id": r.id,
                    "name": r.name,
                    "trigger": r.trigger,
                    "template_key": r.template_key,
                    "enabled": r.enabled,
                }
                for r in rows
            ]
        }
    )


@router.post("/projects/{project_id}/reports/run")
async def run_report(
    project_id: int,
    body: ReportRunBody,
    db: DbSession,
    user: CurrentUser,
):
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    from app.api.deps_collab import assert_company_write
    from app.core.collab_errors import CollabError

    try:
        await assert_company_write(db, p.company_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    # PM or super via progress.write_formal / tree.edit_any
    if not await acl.can(
        db, user.id, p.company_id, "progress.write_formal", project_id=p.id
    ):
        return fail(403, 40300, "无权运行汇报（需 PM）")

    try:
        run = await run_manual_report(
            db,
            project=p,
            actor_user_id=user.id,
            policy_id=body.policy_id,
            trigger=body.trigger or "manual_confirm",
        )
    except ValueError as e:
        if str(e) == "policy_not_found":
            return fail(404, 40400, "汇报策略不存在")
        return fail(422, 42200, str(e))

    await db.commit()
    return ResponseData(
        data={
            "run_id": run.id,
            "status": run.status,
            "summary_text": run.summary_text,
        }
    )
