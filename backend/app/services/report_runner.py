"""基于项目事实生成兼容的进度汇报。"""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.progress import ProgressRecord
from app.models.project import Project
from app.models.report import AgentReport, ReportPolicy, ReportRun
from app.models.evidence import EvidencePackage
from app.models.task import Task
from app.models.user import User
from app.models.tree import TreeNode


async def ensure_default_policy(
    db: AsyncSession, *, company_id: int, project_id: int
) -> ReportPolicy:
    q = await db.execute(
        select(ReportPolicy).where(
            ReportPolicy.project_id == project_id,
            ReportPolicy.enabled.is_(True),
        ).limit(1)
    )
    pol = q.scalar_one_or_none()
    if pol:
        return pol
    pol = ReportPolicy(
        company_id=company_id,
        project_id=project_id,
        name="项目进度摘要",
        trigger="manual_confirm",
        template_key="progress_summary",
        enabled=True,
    )
    db.add(pol)
    await db.flush()
    return pol


async def run_manual_report(
    db: AsyncSession,
    *,
    project: Project,
    actor_user_id: int | None,
    policy_id: int | None = None,
    trigger: str = "manual_confirm",
) -> ReportRun:
    policy = None
    if policy_id:
        policy = await db.get(ReportPolicy, policy_id)
        if not policy or policy.project_id != project.id:
            raise ValueError("policy_not_found")
    else:
        policy = await ensure_default_policy(
            db, company_id=project.company_id, project_id=project.id
        )

    nq = await db.execute(
        select(func.count())
        .select_from(TreeNode)
        .where(TreeNode.project_id == project.id, TreeNode.is_deleted.is_(False))
    )
    node_count = int(nq.scalar() or 0)

    pq = await db.execute(
        select(func.count())
        .select_from(ProgressRecord)
        .where(ProgressRecord.project_id == project.id)
    )
    progress_count = int(pq.scalar() or 0)

    # sample recent nodes status
    tq = await db.execute(
        select(TreeNode)
        .where(TreeNode.project_id == project.id, TreeNode.is_deleted.is_(False))
        .order_by(TreeNode.id.desc())
        .limit(5)
    )
    lines = []
    for n in tq.scalars().all():
        pj = n.progress_json or {}
        lines.append(
            f"- {n.title}: {pj.get('status', '-')} {pj.get('percent', '')}"
        )

    submitted = (await db.execute(select(AgentReport, User).join(User, User.id == AgentReport.author_user_id).where(
        AgentReport.company_id == project.company_id, AgentReport.project_id == project.id,
        AgentReport.status.in_(("submitted", "aggregated")),
    ).order_by(AgentReport.id))).all()
    member_reports = [{"report_id": r.id, "author_user_id": r.author_user_id,
                       "author_name": u.nickname or u.username, "summary_text": r.summary_text}
                      for r, u in submitted]
    tasks = (await db.execute(select(Task).where(
        Task.company_id == project.company_id, Task.project_id == project.id, Task.is_deleted.is_(False)
    ).order_by(Task.id))).scalars().all()
    task_stats = {"total": len(tasks), "completed": sum(t.status == Task.STATUS_DONE for t in tasks),
                  "in_progress": sum(t.status == Task.STATUS_IN_PROGRESS for t in tasks),
                  "pending": sum(t.status == Task.STATUS_TODO for t in tasks)}
    adopted = (await db.execute(select(EvidencePackage).where(
        EvidencePackage.company_id == project.company_id, EvidencePackage.project_id == project.id,
        EvidencePackage.status == "adopted"
    ).order_by(EvidencePackage.id))).scalars().all()
    adopted_materials = [{"package_id": p.id, "node_id": p.node_id, "submitter_user_id": p.submitter_user_id,
                          "summary_text": p.summary_text or "附件材料"} for p in adopted]

    summary = (
        f"【{project.name}】进度摘要（{'定时生成' if trigger == 'cron' else '手动生成'}）\n"
        f"节点数：{node_count}；正式进度记录：{progress_count}\n"
        + ("\n".join(lines) if lines else "（暂无节点）")
        + "\n\n成员已提交汇报：\n"
        + ("\n".join(f"- {r['author_name']}：{r['summary_text']}" for r in member_reports) or "暂无已提交汇报")
        + f"\n\n任务完成情况：共 {task_stats['total']} 项，已完成 {task_stats['completed']}，进行中 {task_stats['in_progress']}，待办 {task_stats['pending']}。"
        + "\n\n已采纳材料清单：\n"
        + ("\n".join(f"- 材料 {p['package_id']}：{p['summary_text']}" for p in adopted_materials) or "暂无已采纳材料")
    )

    run = ReportRun(
        company_id=project.company_id,
        project_id=project.id,
        policy_id=policy.id if policy else None,
        trigger=trigger,
        status="completed",
        summary_text=summary,
        payload_json={
            "node_count": node_count,
            "progress_count": progress_count,
            "template_key": policy.template_key if policy else "progress_summary",
            "member_reports": member_reports,
            "task_stats": task_stats,
            "adopted_materials": adopted_materials,
        },
        actor_user_id=actor_user_id,
    )
    db.add(run)
    await db.flush()
    return run
