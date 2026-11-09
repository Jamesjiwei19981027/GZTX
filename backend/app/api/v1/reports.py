"""汇报策略与手工运行 §13"""
from fastapi import APIRouter, Query
from typing import Literal
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select

from app.core.collab_errors import fail
from app.api.deps_collab import assert_collaboration_write
from app.core.dependencies import CurrentUser, DbSession
from app.models.project import Project, ProjectMember
from app.models.company import CompanyMembership
from app.models.report import ReportPolicy
from app.schemas.common import ResponseData
from app.services.acl import AclService
from app.services.report_runner import ensure_default_policy, run_manual_report
from app.models.report import AgentReport, AgentReportSource, ProjectAgentBinding, ProjectReportEnvelope
from app.services.hierarchical_reporting import (
    aggregate_leadership_report,
    aggregate_project_report,
    bind_project_agents,
    ensure_member_agent_binding,
    generate_member_report_draft,
    ReportGenerationUnavailable,
    rollup_member_reports,
    submit_member_report,
    review_member_report,
    is_member_report_reviewer,
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


class ReportReviewBody(BaseModel):
    decision: Literal["approved", "returned"]
    comment: str = Field(min_length=1, max_length=2000)


def _report_record_dto(report: AgentReport, *, viewer_user_id: int, sources: list[dict], can_review: bool = False) -> dict:
    payload = report.payload_json or {}
    if report.author_user_id != viewer_user_id:
        payload = {key: value for key, value in payload.items() if key in (
            "context_scope", "grounded", "model_provider", "node_status", "progress_status", "status_label", "conflicts", "conflict", "review",
        )}
    return {
        "id": report.id, "report_id": report.id, "project_id": report.project_id, "binding_id": report.binding_id,
        "status": report.status, "summary_text": report.summary_text, "summary": report.summary_text, "content": report.summary_text,
        "author_user_id": report.author_user_id, "parent_user_id": report.parent_user_id,
        "created_at": report.created_at.isoformat() if report.created_at else None,
        "submitted_at": report.submitted_at.isoformat() if report.submitted_at else None,
        "read": report.read_at is not None, "read_at": report.read_at.isoformat() if report.read_at else None,
        "payload_json": payload, "review": payload.get("review"), "can_review": can_review,
        "sources": sources, "source_count": len(sources),
    }


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
            "items": [_policy_dto(r) for r in rows]
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
    await assert_collaboration_write(db, p.company_id, project_id=p.id, user_id=user.id)
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
    await assert_collaboration_write(db, p.company_id, project_id=p.id, user_id=user.id)
    is_pm = await acl.can(db, user.id, p.company_id, "progress.write_formal", project_id=p.id)
    if is_pm:
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
    else:
        if not await acl.can(db, user.id, p.company_id, "progress.read", project_id=p.id):
            return fail(403, 40300, "非项目成员")
        try:
            binding = await ensure_member_agent_binding(db, project_id=p.id, user_id=user.id)
        except PermissionError:
            return fail(403, 40300, "非项目成员")
        except ValueError as e:
            return fail(422, 42200, str(e))
        await db.commit()
        return ResponseData(data={"items": [_binding_dto(binding)]})


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


async def _report_visibility(db, project: Project, user_id: int):
    """草稿始终归作者；项目读权限不能授予个人汇报读权限。"""
    membership = await acl._membership(db, user_id, project.company_id)
    member = await acl._project_member(db, project.id, user_id)
    manager = bool(membership and membership.is_super_admin) or bool(member and member.role == "pm") or project.pm_user_id == user_id
    submitted = AgentReport.status.in_(("submitted", "aggregated"))
    return or_(
        AgentReport.author_user_id == user_id,
        and_(submitted, True if manager else AgentReport.parent_user_id == user_id),
    )


@router.post("/projects/{project_id}/agent-reports")
async def submit_agent_report(
    project_id: int, body: AgentReportSubmitBody, db: DbSession, user: CurrentUser
):
    """提交智能体汇报"""
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    await assert_collaboration_write(db, p.company_id, project_id=p.id, user_id=user.id)
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
    await assert_collaboration_write(db, p.company_id, project_id=p.id, user_id=user.id)
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
        if body.binding_id is not None:
            return fail(404, 40400, "个人汇报智能体不存在")
        try:
            binding = await ensure_member_agent_binding(db, project_id=p.id, user_id=user.id)
            await db.flush()
        except PermissionError:
            return fail(403, 40300, "非项目成员")
        except ValueError as e:
            return fail(422, 42200, str(e))
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
            select(AgentReport).where(
                AgentReport.project_id == p.id,
                await _report_visibility(db, p, user.id),
            ).order_by(AgentReport.id.desc())
        )
    ).scalars().all()
    source_rows = []
    own_report_ids = [r.id for r in rows if r.author_user_id == user.id]
    if own_report_ids:
        source_rows = (
            await db.execute(
                select(AgentReportSource).where(AgentReportSource.report_id.in_(own_report_ids)).order_by(AgentReportSource.id)
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
            _report_record_dto(r, viewer_user_id=user.id, sources=sources_by_report.get(r.id, []),
                can_review=p.status != "archived" and r.status in ("submitted", "aggregated") and await is_member_report_reviewer(db, report=r, reviewer_user_id=user.id))
            for r in rows
        ]
    })


@router.post("/projects/{project_id}/agent-reports/aggregate")
async def aggregate_agent_reports(project_id: int, db: DbSession, user: CurrentUser):
    """汇总下属智能体汇报"""
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    await assert_collaboration_write(db, p.company_id, project_id=p.id, user_id=user.id)
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


@router.get("/projects/{project_id}/agent-reports/latest")
async def latest_project_agent_report(project_id: int, db: DbSession, user: CurrentUser):
    """回读已保存的最新项目汇总（桌面与移动端共用）。"""
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    if not await acl.can(db, user.id, p.company_id, "progress.read", project_id=p.id):
        return fail(403, 40300, "无权查看项目汇总")
    membership = await acl._membership(db, user.id, p.company_id)
    member = await acl._project_member(db, p.id, user.id)
    if not (membership and membership.is_super_admin) and not (member and member.role == "pm") and p.pm_user_id != user.id:
        return fail(403, 40300, "需要项目管理者")
    envelope = (await db.execute(select(ProjectReportEnvelope).where(
        ProjectReportEnvelope.project_id == p.id
    ).order_by(ProjectReportEnvelope.id.desc()).limit(1))).scalar_one_or_none()
    if not envelope:
        return ResponseData(data=None)
    return ResponseData(data={
        "id": envelope.id, "project_id": envelope.project_id, "status": envelope.status,
        "summary_text": envelope.summary_text, "payload_json": envelope.payload_json,
        "report_ids": (envelope.payload_json or {}).get("report_ids", []),
        "source_count": (envelope.payload_json or {}).get("source_count", 0),
        "created_at": envelope.created_at.isoformat() if envelope.created_at else None,
    })


@router.post("/projects/{project_id}/agent-reports/rollup")
async def rollup_agent_reports(project_id: int, db: DbSession, user: CurrentUser):
    """逐级上报智能体汇报"""
    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    await assert_collaboration_write(db, p.company_id, project_id=p.id, user_id=user.id)
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
async def _legacy_report_dto(db, report: AgentReport, *, viewer_user_id: int) -> dict:
    sources = (
        await db.execute(
            select(AgentReportSource).where(AgentReportSource.report_id == report.id).order_by(AgentReportSource.id)
        )
    ).scalars().all() if report.author_user_id == viewer_user_id else []
    project = await db.get(Project, report.project_id)
    can_review = bool(project and project.status != "archived" and report.status in ("submitted", "aggregated") and await is_member_report_reviewer(db, report=report, reviewer_user_id=viewer_user_id))
    return _report_record_dto(report, viewer_user_id=viewer_user_id, can_review=can_review, sources=[
            {"id": s.id, "source_type": s.source_type, "source_id": s.source_id, "excerpt": s.excerpt, "metadata": s.metadata_json}
            for s in sources
        ])


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
        .join(CompanyMembership, and_(CompanyMembership.company_id == AgentReport.company_id, CompanyMembership.user_id == user.id, CompanyMembership.status == "active"))
        .where(*filters)
        .order_by(AgentReport.id.desc())
    )).scalars().all()
    return ResponseData(data={"items": [await _legacy_report_dto(db, r, viewer_user_id=user.id) for r in rows]})


@router.get("/reports/inbox")
async def legacy_report_inbox(db: DbSession, user: CurrentUser):
    """旧版：汇报收件箱"""
    rows = (
        await db.execute(
            select(AgentReport)
            .join(ProjectMember, ProjectMember.project_id == AgentReport.project_id)
            .join(CompanyMembership, and_(CompanyMembership.company_id == AgentReport.company_id, CompanyMembership.user_id == user.id, CompanyMembership.status == "active"))
            .where(
                AgentReport.parent_user_id == user.id,
                AgentReport.status.in_(("submitted", "aggregated")),
                ProjectMember.user_id == user.id,
                ProjectMember.left_at.is_(None),
            )
            .order_by(AgentReport.id.desc())
        )
    ).scalars().all()
    return ResponseData(data={"items": [await _legacy_report_dto(db, r, viewer_user_id=user.id) for r in rows]})


@router.get("/reports/{report_id}")
async def legacy_get_report(report_id: int, db: DbSession, user: CurrentUser):
    """旧版：汇报详情"""
    report = await db.get(AgentReport, report_id)
    if not report:
        return fail(404, 40400, "汇报不存在")
    project = await db.get(Project, report.project_id)
    if not project or not await acl.can(db, user.id, report.company_id, "progress.read", project_id=report.project_id):
        return fail(403, 40300, "无权查看汇报")
    visible = (await db.execute(select(AgentReport.id).where(
        AgentReport.id == report.id, await _report_visibility(db, project, user.id)
    ))).scalar_one_or_none()
    if visible is None:
        return fail(403, 40300, "无权查看汇报")
    return ResponseData(data=await _legacy_report_dto(db, report, viewer_user_id=user.id))


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
        target_project_id = body.project_id
        if target_project_id is None:
            pm_row = (
                await db.execute(
                    select(ProjectMember.project_id)
                    .where(ProjectMember.user_id == user.id, ProjectMember.left_at.is_(None))
                    .order_by(ProjectMember.id.desc())
                    .limit(1)
                )
            ).first()
            if pm_row:
                target_project_id = pm_row[0]
            else:
                return fail(403, 40300, "非项目成员")
        p = await db.get(Project, target_project_id)
        if not p:
            return fail(404, 40400, "项目不存在")
        if not await acl.can(db, user.id, p.company_id, "progress.read", project_id=p.id):
            return fail(403, 40300, "非项目成员")
        await assert_collaboration_write(db, p.company_id, project_id=p.id, user_id=user.id)
        try:
            binding = await ensure_member_agent_binding(db, project_id=target_project_id, user_id=user.id)
            await db.flush()
        except PermissionError:
            return fail(403, 40300, "非项目成员")
        except ValueError as e:
            return fail(422, 42200, str(e))
    await assert_collaboration_write(db, binding.company_id, project_id=binding.project_id, user_id=user.id)
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
    return ResponseData(data=await _legacy_report_dto(db, draft, viewer_user_id=user.id))


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
    await assert_collaboration_write(db, report.company_id, project_id=report.project_id, user_id=user.id)
    if report.status == "submitted" and not body.summary and not body.sources:
        return ResponseData(data=await _legacy_report_dto(db, report, viewer_user_id=user.id))
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
    return ResponseData(data=await _legacy_report_dto(db, submitted, viewer_user_id=user.id))


@router.post("/reports/{report_id}/review")
async def review_report(report_id: int, body: ReportReviewBody, db: DbSession, user: CurrentUser):
    """接收上级或项目 PM 核验已提交汇报，作者可回读结果。"""
    try:
        report = await review_member_report(db, report_id=report_id, reviewer_user_id=user.id, decision=body.decision, comment=body.comment)
    except PermissionError:
        return fail(403, 40300, "仅该汇报的接收上级或项目负责人可以核验")
    except ValueError as exc:
        if str(exc) == "report_not_found":
            return fail(404, 40400, "汇报不存在")
        if str(exc) == "report_not_reviewable":
            return fail(409, 40900, "只能核验已经提交的汇报")
        return fail(422, 42200, "请填写有效核验决定与意见")
    await db.commit()
    return ResponseData(data=await _legacy_report_dto(db, report, viewer_user_id=user.id))


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


# ---------------------------------------------------------------------------
# 项目汇总「确认发布」与汇报策略设置
# ---------------------------------------------------------------------------
PERIODS = ("daily", "weekly", "monthly")


class ReportPolicyBody(BaseModel):
    """汇报策略：周期 / 截止时间 / 提醒。只传要改的字段。"""

    period: str | None = Field(default=None, description="daily|weekly|monthly")
    deadline_time: str | None = Field(default=None, description="HH:MM，用户本地时间")
    weekday: int | None = Field(default=None, ge=1, le=7, description="每周截止日，1=周一…7=周日")
    month_day: int | None = Field(default=None, ge=1, le=28, description="每月截止日，1~28")
    remind: bool | None = None
    enabled: bool | None = None


def _policy_dto(r: ReportPolicy) -> dict:
    from app.services.report_policy_schedule import normalize_policy_config

    cfg = normalize_policy_config(r.config_json)
    return {
        "id": r.id,
        "name": r.name,
        "trigger": r.trigger,
        "template_key": r.template_key,
        "enabled": r.enabled,
        **cfg,
    }


async def _can_manage_reports(db, user, p: Project) -> bool:
    return await acl.can(db, user.id, p.company_id, "progress.write_formal", project_id=p.id)


@router.put("/projects/{project_id}/report-policy")
async def put_report_policy(
    project_id: int, body: ReportPolicyBody, db: DbSession, user: CurrentUser
):
    """项目负责人设置汇报周期、截止时间与提醒；调度器按此提醒成员"""
    from app.api.deps_collab import assert_company_write
    from app.core.collab_errors import CollabError
    from app.services.report_policy_schedule import normalize_policy_config, validate_deadline_time

    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    try:
        await assert_company_write(db, p.company_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    if not await _can_manage_reports(db, user, p):
        return fail(403, 40300, "仅项目负责人可设置汇报策略")
    if body.period is not None and body.period not in PERIODS:
        return fail(422, 42200, "汇报周期只能是每日、每周或每月")
    if body.deadline_time is not None and not validate_deadline_time(body.deadline_time):
        return fail(422, 42200, "截止时间格式应为 时:分，例如 18:00")
    policy = await ensure_default_policy(db, company_id=p.company_id, project_id=p.id)
    before = normalize_policy_config(policy.config_json)
    cfg = dict(policy.config_json or {})
    for key in ("period", "deadline_time", "weekday", "month_day", "remind"):
        value = getattr(body, key)
        if value is not None:
            cfg[key] = value
    after = normalize_policy_config(cfg)
    if any(before[k] != after[k] for k in ("period", "deadline_time", "weekday", "month_day")):
        # 改了周期或截止时间，这一期可以重新提醒
        after.pop("last_reminded_key", None)
    policy.config_json = after
    if body.enabled is not None:
        policy.enabled = body.enabled
    # 设置了周期就是定时汇报：调度器只处理 trigger=cron 的策略
    policy.trigger = "cron"
    await db.commit()
    await db.refresh(policy)
    return ResponseData(data=_policy_dto(policy))


async def _can_see_summaries(db, user, p: Project) -> tuple[bool, bool]:
    """返回 (能否查看已发布汇总, 能否看全部含未发布)。"""
    from app.api.deps_collab import get_membership_for

    if await _can_manage_reports(db, user, p):
        return True, True
    if await acl.can(db, user.id, p.company_id, "progress.read", project_id=p.id):
        return True, False
    membership = await get_membership_for(db, p.company_id, user.id)
    if membership and (membership.is_org_leader or membership.is_super_admin):
        return True, False
    return False, False


def _envelope_dto(e: ProjectReportEnvelope, names: dict[int, str]) -> dict:
    payload = e.payload_json or {}
    published_by = payload.get("published_by")
    return {
        "id": e.id,
        "project_id": e.project_id,
        "status": e.status,
        "summary_text": e.summary_text,
        "report_count": payload.get("report_count", 0),
        "source_count": payload.get("source_count", 0),
        "conflicts": payload.get("conflicts", []),
        "created_at": e.created_at.isoformat() if e.created_at else None,
        "published_at": payload.get("published_at"),
        "published_by": published_by,
        "published_by_name": names.get(published_by) if published_by else None,
    }


@router.get("/projects/{project_id}/report-summaries")
async def list_report_summaries(project_id: int, db: DbSession, user: CurrentUser):
    """项目汇总列表。成员与上级只看已发布版本；负责人可看到全部（含待发布）"""
    from app.models.user import User

    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    can_see, see_all = await _can_see_summaries(db, user, p)
    if not can_see:
        return fail(403, 40300, "无权查看项目汇总")
    stmt = select(ProjectReportEnvelope).where(ProjectReportEnvelope.project_id == p.id)
    if not see_all:
        stmt = stmt.where(ProjectReportEnvelope.status == "published")
    rows = (
        await db.execute(stmt.order_by(ProjectReportEnvelope.id.desc()).limit(30))
    ).scalars().all()
    publisher_ids = {
        (r.payload_json or {}).get("published_by")
        for r in rows
        if (r.payload_json or {}).get("published_by")
    }
    names: dict[int, str] = {}
    if publisher_ids:
        for u in (await db.execute(select(User).where(User.id.in_(publisher_ids)))).scalars():
            names[u.id] = u.nickname or u.username
    items = [_envelope_dto(r, names) for r in rows]
    latest_published = next((i for i in items if i["status"] == "published"), None)
    return ResponseData(
        data={
            "items": items,
            "latest_published": latest_published,
            "can_publish": see_all,
        }
    )


@router.post("/projects/{project_id}/report-summaries/{envelope_id}/publish")
async def publish_report_summary(
    project_id: int, envelope_id: int, db: DbSession, user: CurrentUser
):
    """负责人确认发布项目汇总：成员与上级此后能在汇报页看到这一版"""
    from datetime import datetime, timezone

    from app.api.deps_collab import assert_company_write
    from app.core.collab_errors import CollabError
    from app.services.notify.service import NotificationService

    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    try:
        await assert_company_write(db, p.company_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    if not await _can_manage_reports(db, user, p):
        return fail(403, 40300, "仅项目负责人可发布项目汇总")
    env = await db.get(ProjectReportEnvelope, envelope_id)
    if not env or env.project_id != p.id:
        return fail(404, 40400, "项目汇总不存在")
    if env.status == "published":
        return fail(409, 40906, "该版本已经发布")
    now = datetime.now(timezone.utc)
    payload = dict(env.payload_json or {})
    payload["published_at"] = now.isoformat()
    payload["published_by"] = user.id
    env.payload_json = payload
    env.status = "published"
    members = (
        await db.execute(
            select(ProjectMember.user_id).where(
                ProjectMember.project_id == p.id, ProjectMember.left_at.is_(None)
            )
        )
    ).scalars().all()
    targets = sorted({uid for uid in members if uid != user.id})
    if targets:
        await NotificationService().enqueue(
            db,
            company_id=p.company_id,
            user_ids=targets,
            template_key="project.report.published",
            payload={"project_id": p.id, "project_name": p.name, "envelope_id": env.id},
            channels=["in_app"],
            project_id=p.id,
        )
    await db.commit()
    return ResponseData(data=_envelope_dto(env, {user.id: user.nickname or user.username}))


class ProgressNoteDraftBody(BaseModel):
    text: str = Field(min_length=1, max_length=20000)
    file_ids: list[int] = Field(default_factory=list, max_length=20)


@router.post("/projects/{project_id}/agent-reports/note-draft")
async def save_progress_note_as_draft(
    project_id: int, body: ProgressNoteDraftBody, db: DbSession, user: CurrentUser
):
    """「记录进展」存为汇报草稿：追加进我在本项目的当前草稿，出现在「我的汇报」"""
    from app.api.deps_collab import assert_company_write
    from app.core.collab_errors import CollabError
    from app.services.report_note_draft import append_progress_note_to_draft

    p = await db.get(Project, project_id)
    if not p:
        return fail(404, 40400, "项目不存在")
    try:
        await assert_company_write(db, p.company_id)
    except CollabError as e:
        return fail(e.http_status, e.code, e.message)
    if p.status == "archived":
        return fail(409, 40905, "项目已归档为只读")
    if not await acl.can(db, user.id, p.company_id, "progress.read", project_id=p.id):
        return fail(403, 40300, "非项目成员")
    try:
        from app.services.progress_attachments import resolve_attachments

        attachments = await resolve_attachments(
            db, user_id=user.id, file_ids=body.file_ids, company_id=p.company_id
        )
        draft = await append_progress_note_to_draft(
            db, project_id=p.id, user_id=user.id, text=body.text, attachments=attachments
        )
    except PermissionError:
        return fail(403, 40300, "非项目成员")
    except ValueError as e:
        return fail(422, 42200, str(e))
    await db.commit()
    return ResponseData(
        data={
            "id": draft.id,
            "project_id": draft.project_id,
            "status": draft.status,
            "summary_text": draft.summary_text,
        }
    )
