"""汇报策略与手工运行 §13"""
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.collab_errors import fail
from app.core.dependencies import CurrentUser, DbSession
from app.models.project import Project, ProjectMember
from app.models.report import ReportPolicy
from app.schemas.common import ResponseData
from app.services.acl import AclService
from app.services.report_runner import ensure_default_policy, run_manual_report
from app.models.report import AgentReport, AgentReportSource, ProjectAgentBinding, ProjectReportEnvelope
from app.services.hierarchical_reporting import (
    aggregate_leadership_report,
    aggregate_project_report,
    bind_project_agents,
    generate_member_report_draft,
    ReportGenerationUnavailable,
    rollup_member_reports,
    submit_member_report,
)

router = APIRouter(tags=["智能体汇报"])
acl = AclService()


class ReportRunBody(BaseModel):
    policy_id: int | None = None
    trigger: str = Field(default="manual_confirm")


class AgentReportSourceBody(BaseModel):
    source_type: str = Field(min_length=1, max_length=32)
    source_id: int | None = None
    excerpt: str | None = None
    metadata: dict = Field(default_factory=dict)


class AgentReportSubmitBody(BaseModel):
    binding_id: int
    summary: str = Field(min_length=1, max_length=20000)
    sources: list[AgentReportSourceBody] = Field(default_factory=list)
    payload: dict = Field(default_factory=dict)


class AgentReportGenerateBody(BaseModel):
    binding_id: int | None = None


class LeadershipReportAggregateBody(BaseModel):
    project_ids: list[int] | None = None


class LegacyReportGenerateBody(BaseModel):
    project_id: int | None = None


class LegacyReportSubmitBody(BaseModel):
    summary: str | None = None
    sources: list[AgentReportSourceBody] = Field(default_factory=list)


@router.get("/projects/{project_id}/report-policies")
async def list_report_policies(project_id: int, db: DbSession, user: CurrentUser):
    """列出项目汇报策略"""
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
    """立即执行一次汇报"""
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


@router.post("/projects/{project_id}/report-agents/bindings")
async def ensure_report_agent_bindings(project_id: int, db: DbSession, user: CurrentUser):
    """创建项目与成员汇报智能体

    Create project/member agents; the people axis remains the hierarchy source."""
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "progress.write_formal", project_id=p.id):
        return fail(403, 40300, "需要项目管理者")
    try:
        from app.api.deps_collab import assert_company_write
        await assert_company_write(db, p.company_id, feature="agents")
        rows = await bind_project_agents(db, project_id=p.id, company_id=p.company_id, actor_user_id=user.id)
    except ValueError as e:
        return fail(422, 42200, str(e))
    except Exception as e:
        from app.core.collab_errors import CollabError
        if isinstance(e, CollabError):
            return fail(e.http_status, e.code, e.message)
        raise
    await db.commit()
    return ResponseData(data={"items": [_binding_dto(r) for r in rows]})


@router.get("/projects/{project_id}/report-agents/bindings")
async def list_report_agent_bindings(project_id: int, db: DbSession, user: CurrentUser):
    """列出汇报智能体绑定"""
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "progress.read", project_id=p.id):
        return fail(403, 40300, "非项目成员")
    rows = (
        await db.execute(
            select(ProjectAgentBinding).where(
                ProjectAgentBinding.project_id == p.id,
                ProjectAgentBinding.is_active.is_(True),
            ).order_by(ProjectAgentBinding.role, ProjectAgentBinding.id)
        )
    ).scalars().all()
    return ResponseData(data={"items": [_binding_dto(r) for r in rows]})


def _binding_dto(binding: ProjectAgentBinding) -> dict:
    return {
        "id": binding.id,
        "company_id": binding.company_id,
        "project_id": binding.project_id,
        "user_id": binding.user_id,
        "agent_definition_id": binding.agent_definition_id,
        "role": binding.role,
        "is_active": binding.is_active,
        "context_scope": {"company_id": binding.company_id, "project_id": binding.project_id},
    }


@router.post("/projects/{project_id}/agent-reports")
async def submit_agent_report(
    project_id: int, body: AgentReportSubmitBody, db: DbSession, user: CurrentUser
):
    """提交智能体汇报"""
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "progress.read", project_id=p.id):
        return fail(403, 40300, "非项目成员")
    binding = await db.get(ProjectAgentBinding, body.binding_id)
    if not binding or binding.project_id != p.id:
        return fail(404, 40400, "个人汇报智能体不存在")
    try:
        report = await submit_member_report(
            db,
            binding_id=body.binding_id,
            author_user_id=user.id,
            summary=body.summary,
            sources=[s.model_dump() for s in body.sources],
            payload=body.payload,
        )
    except ValueError as e:
        return fail(422, 42200, str(e))
    await db.commit()
    return ResponseData(data={
        "id": report.id,
        "project_id": report.project_id,
        "parent_user_id": report.parent_user_id,
        "status": report.status,
        "summary_text": report.summary_text,
        "source_count": len(body.sources),
    })


@router.post("/projects/{project_id}/agent-reports/generate")
async def generate_agent_report(
    project_id: int, body: AgentReportGenerateBody, db: DbSession, user: CurrentUser
):
    """由智能体生成汇报"""
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "progress.read", project_id=p.id):
        return fail(403, 40300, "非项目成员")
    stmt = select(ProjectAgentBinding).where(
        ProjectAgentBinding.project_id == p.id,
        ProjectAgentBinding.user_id == user.id,
        ProjectAgentBinding.role == "member",
        ProjectAgentBinding.is_active.is_(True),
    )
    if body.binding_id is not None:
        stmt = stmt.where(ProjectAgentBinding.id == body.binding_id)
    binding = (await db.execute(stmt.limit(1))).scalar_one_or_none()
    if not binding:
        return fail(404, 40400, "个人汇报智能体不存在")
    try:
        report = await generate_member_report_draft(
            db, binding_id=binding.id, author_user_id=user.id
        )
    except ReportGenerationUnavailable:
        return fail(422, 42230, "未配置可用的 AI 模型，无法生成事实汇报")
    except ValueError as e:
        msg = str(e)
        if msg == "report_sources_empty":
            return fail(422, 42231, "暂无任务、进度、资料或 AI 输入，无法生成汇报")
        if msg.startswith("llm_generation_failed:"):
            return fail(502, 50230, msg)
        return fail(422, 42200, msg)
    await db.commit()
    return ResponseData(
        data={
            "id": report.id,
            "project_id": report.project_id,
            "status": report.status,
            "summary_text": report.summary_text,
            "payload_json": report.payload_json,
            "source_count": (report.payload_json or {}).get("source_count", 0),
            "requires_confirmation": True,
        }
    )


@router.get("/projects/{project_id}/agent-reports")
async def list_agent_reports(project_id: int, db: DbSession, user: CurrentUser):
    """列出智能体汇报"""
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "progress.read", project_id=p.id):
        return fail(403, 40300, "非项目成员")
    rows = (
        await db.execute(
            select(AgentReport).where(AgentReport.project_id == p.id).order_by(AgentReport.id.desc())
        )
    ).scalars().all()
    source_rows = []
    if rows:
        source_rows = (
            await db.execute(
                select(AgentReportSource).where(AgentReportSource.report_id.in_([r.id for r in rows])).order_by(AgentReportSource.id)
            )
        ).scalars().all()
    sources_by_report: dict[int, list[dict]] = {}
    for source in source_rows:
        sources_by_report.setdefault(source.report_id, []).append({
            "id": source.id,
            "source_type": source.source_type,
            "source_id": source.source_id,
            "excerpt": source.excerpt,
            "metadata": source.metadata_json,
        })
    return ResponseData(data={
        "items": [
            {
                "id": r.id,
                "binding_id": r.binding_id,
                "author_user_id": r.author_user_id,
                "parent_user_id": r.parent_user_id,
                "status": r.status,
                "summary_text": r.summary_text,
                "payload_json": r.payload_json,
                "source_count": len(sources_by_report.get(r.id, [])),
                "sources": sources_by_report.get(r.id, []),
                "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            }
            for r in rows
        ]
    })


@router.post("/projects/{project_id}/agent-reports/aggregate")
async def aggregate_agent_reports(project_id: int, db: DbSession, user: CurrentUser):
    """汇总下属智能体汇报"""
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "progress.write_formal", project_id=p.id):
        return fail(403, 40300, "需要项目管理者")
    try:
        envelope = await aggregate_project_report(db, project_id=p.id, actor_user_id=user.id)
    except ValueError as e:
        return fail(422, 42200, str(e))
    await db.commit()
    return ResponseData(data={
        "id": envelope.id,
        "project_id": envelope.project_id,
        "status": envelope.status,
        "summary_text": envelope.summary_text,
        "payload_json": envelope.payload_json,
        "report_ids": (envelope.payload_json or {}).get("report_ids", []),
        "source_count": (envelope.payload_json or {}).get("source_count", 0),
    })


@router.post("/projects/{project_id}/agent-reports/rollup")
async def rollup_agent_reports(project_id: int, db: DbSession, user: CurrentUser):
    """逐级上报智能体汇报"""
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "progress.write_formal", project_id=p.id):
        return fail(403, 40300, "需要项目管理者")
    totals = {"project_id": project_id, "created": 0, "skipped": 0, "failed": 0}
    # One pass handles one people-axis level. Repeat until no new parent
    # report is created, with a hard cap against malformed/cyclic trees.
    for _ in range(20):
        result = await rollup_member_reports(db, project_id=project_id, actor_user_id=user.id)
        for key in ("created", "skipped", "failed"):
            totals[key] += int(result.get(key, 0))
        if not result.get("created"):
            break
    await db.commit()
    return ResponseData(data=totals)


@router.post("/companies/{company_id}/leadership-reports/aggregate")
async def aggregate_leadership_reports(
    company_id: int,
    body: LeadershipReportAggregateBody,
    db: DbSession,
    user: CurrentUser,
):
    """汇总企业领导层汇报"""
    from app.api.deps_collab import get_membership_for

    membership = await get_membership_for(db, company_id, user.id)
    if not membership or not (membership.is_org_leader or membership.is_super_admin):
        return fail(403, 40304, "需要总领导权限")
    try:
        envelope = await aggregate_leadership_report(
            db,
            company_id=company_id,
            leader_user_id=user.id,
            project_ids=body.project_ids,
        )
    except ValueError as e:
        return fail(422, 42200, str(e))
    await db.commit()
    return ResponseData(
        data={
            "id": envelope.id,
            "company_id": envelope.company_id,
            "leader_user_id": envelope.leader_user_id,
            "status": envelope.status,
            "summary_text": envelope.summary_text,
            "payload_json": envelope.payload_json,
        }
    )


@router.get("/companies/{company_id}/leadership-reports/latest")
async def latest_leadership_report(company_id: int, db: DbSession, user: CurrentUser):
    """获取最新领导层汇报"""
    from app.api.deps_collab import get_membership_for
    from app.models.report import LeadershipReportEnvelope

    membership = await get_membership_for(db, company_id, user.id)
    if not membership or not (membership.is_org_leader or membership.is_super_admin):
        return fail(403, 40304, "需要总领导权限")
    envelope = (
        await db.execute(
            select(LeadershipReportEnvelope)
            .where(
                LeadershipReportEnvelope.company_id == company_id,
                LeadershipReportEnvelope.leader_user_id == user.id,
            )
            .order_by(LeadershipReportEnvelope.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if not envelope:
        return ResponseData(data=None)
    return ResponseData(
        data={
            "id": envelope.id,
            "company_id": envelope.company_id,
            "leader_user_id": envelope.leader_user_id,
            "status": envelope.status,
            "summary_text": envelope.summary_text,
            "payload_json": envelope.payload_json,
            "created_at": envelope.created_at.isoformat() if envelope.created_at else None,
        }
    )


# Compatibility aliases used by Flutter and WeChat clients.  They map to the
# same project-scoped agent report records as the explicit hierarchy routes.
async def _legacy_report_dto(db, report: AgentReport) -> dict:
    sources = (
        await db.execute(
            select(AgentReportSource).where(AgentReportSource.report_id == report.id).order_by(AgentReportSource.id)
        )
    ).scalars().all()
    return {
        "id": report.id,
        "report_id": report.id,
        "project_id": report.project_id,
        "status": report.status,
        "summary_text": report.summary_text,
        "summary": report.summary_text,
        "content": report.summary_text,
        "author_user_id": report.author_user_id,
        "parent_user_id": report.parent_user_id,
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "submitted_at": report.submitted_at.isoformat() if report.submitted_at else None,
        "read": report.read_at is not None,
        "read_at": report.read_at.isoformat() if report.read_at else None,
        "sources": [
            {"id": s.id, "source_type": s.source_type, "source_id": s.source_id, "excerpt": s.excerpt, "metadata": s.metadata_json}
            for s in sources
        ],
    }


@router.get("/reports/my")
async def legacy_my_reports(db: DbSession, user: CurrentUser, project_id: int | None = Query(None)):
    """旧版：我的汇报列表"""
    filters = [
        AgentReport.author_user_id == user.id,
        ProjectMember.user_id == user.id,
        ProjectMember.left_at.is_(None),
    ]
    if project_id is not None:
        filters.append(AgentReport.project_id == project_id)
    rows = (await db.execute(
        select(AgentReport)
        .join(ProjectMember, ProjectMember.project_id == AgentReport.project_id)
        .where(*filters)
        .order_by(AgentReport.id.desc())
    )).scalars().all()
    return ResponseData(data={"items": [await _legacy_report_dto(db, r) for r in rows]})


@router.get("/reports/inbox")
async def legacy_report_inbox(db: DbSession, user: CurrentUser):
    """旧版：汇报收件箱"""
    rows = (
        await db.execute(
            select(AgentReport)
            .join(ProjectMember, ProjectMember.project_id == AgentReport.project_id)
            .where(
                AgentReport.parent_user_id == user.id,
                AgentReport.status.in_(("submitted", "aggregated")),
                ProjectMember.user_id == user.id,
                ProjectMember.left_at.is_(None),
            )
            .order_by(AgentReport.id.desc())
        )
    ).scalars().all()
    return ResponseData(data={"items": [await _legacy_report_dto(db, r) for r in rows]})


@router.get("/reports/{report_id}")
async def legacy_get_report(report_id: int, db: DbSession, user: CurrentUser):
    """旧版：汇报详情"""
    report = await db.get(AgentReport, report_id)
    if not report:
        return fail(404, 40400, "汇报不存在")
    project = await db.get(Project, report.project_id)
    if not project or not await acl.can(db, user.id, report.company_id, "progress.read", project_id=report.project_id):
        return fail(403, 40300, "无权查看汇报")
    return ResponseData(data=await _legacy_report_dto(db, report))


@router.post("/reports/generate")
async def legacy_generate_report(body: LegacyReportGenerateBody, db: DbSession, user: CurrentUser):
    """旧版：生成汇报"""
    stmt = (
        select(ProjectAgentBinding)
        .join(ProjectMember, ProjectMember.project_id == ProjectAgentBinding.project_id)
        .where(
            ProjectAgentBinding.user_id == user.id,
            ProjectAgentBinding.role == "member",
            ProjectAgentBinding.is_active.is_(True),
            ProjectMember.user_id == user.id,
            ProjectMember.left_at.is_(None),
        )
    )
    if body.project_id is not None:
        stmt = stmt.where(ProjectAgentBinding.project_id == body.project_id)
    binding = (await db.execute(stmt.order_by(ProjectAgentBinding.id.desc()).limit(1))).scalar_one_or_none()
    if not binding:
        return fail(422, 42200, "尚未绑定项目汇报智能体，请先打开项目汇报页面")
    try:
        draft = await generate_member_report_draft(
            db, binding_id=binding.id, author_user_id=user.id
        )
    except ReportGenerationUnavailable:
        return fail(422, 42230, "未配置可用的 AI 模型，无法生成事实汇报")
    except ValueError as e:
        msg = str(e)
        if msg == "report_sources_empty":
            return fail(422, 42231, "暂无任务、进度、资料或 AI 输入，无法生成汇报")
        if msg.startswith("llm_generation_failed:"):
            return fail(502, 50230, msg)
        return fail(422, 42200, msg)
    await db.commit()
    return ResponseData(data=await _legacy_report_dto(db, draft))


@router.post("/reports/{report_id}/submit")
async def legacy_submit_report(report_id: int, body: LegacyReportSubmitBody, db: DbSession, user: CurrentUser):
    """旧版：提交汇报"""
    report = await db.get(AgentReport, report_id)
    if not report:
        return fail(404, 40400, "汇报不存在")
    if report.author_user_id != user.id:
        return fail(403, 40300, "只能提交自己的汇报")
    if not await acl.can(db, user.id, report.company_id, "progress.read", project_id=report.project_id):
        return fail(403, 40300, "已不具备该项目权限")
    if report.status == "submitted" and not body.summary and not body.sources:
        return ResponseData(data=await _legacy_report_dto(db, report))
    summary = (body.summary or report.summary_text or "").strip()
    if not summary:
        summary = "已提交当前项目智能体掌握的资料，待补充详细进展。"
    try:
        submitted = await submit_member_report(
            db,
            binding_id=report.binding_id,
            author_user_id=user.id,
            summary=summary,
            sources=[s.model_dump() for s in body.sources],
            payload=report.payload_json or {},
            report_id=report.id,
        )
    except ValueError as e:
        return fail(422, 42200, str(e))
    await db.commit()
    return ResponseData(data=await _legacy_report_dto(db, submitted))


@router.put("/reports/inbox/{report_id}/read")
async def legacy_mark_report_read(report_id: int, db: DbSession, user: CurrentUser):
    """旧版：标记汇报已读"""
    report = await db.get(AgentReport, report_id)
    if not report or report.parent_user_id != user.id:
        return fail(404, 40400, "收件箱汇报不存在")
    if not await acl.can(db, user.id, report.company_id, "progress.read", project_id=report.project_id):
        return fail(403, 40300, "已不具备该项目权限")
    from datetime import datetime, timezone
    report.read_at = datetime.now(timezone.utc)
    await db.commit()
    return ResponseData(data={"id": report.id, "read": True})
