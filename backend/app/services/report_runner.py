"""手工汇报生成桩"""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.progress import ProgressRecord
from app.models.project import Project
from app.models.report import ReportPolicy, ReportRun
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

    summary = (
        f"【{project.name}】进度摘要（{trigger}）\n"
        f"节点数：{node_count}；正式进度记录：{progress_count}\n"
        + ("\n".join(lines) if lines else "（暂无节点）")
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
        },
        actor_user_id=actor_user_id,
    )
    db.add(run)
    await db.flush()
    return run
