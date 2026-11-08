"""Project-scoped agent reporting routed by the human responsibility axis.

The service deliberately does not persist an independent agent org chart.  A
member's direct leader is resolved from ``TreeNode.parent_id`` and
``NodeAssignment`` every time a report is submitted, so changing the people
axis changes the next reporting route automatically.
"""

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import AgentDefinition, AgentMessage, AgentSession
from app.models.evidence import EvidenceFile, EvidencePackage
from app.models.knowledge import EvidenceFileText
from app.models.project import Project
from app.models.report import (
    AgentReport,
    AgentReportSource,
    LeadershipReportEnvelope,
    ProjectAgentBinding,
    ProjectReportEnvelope,
    ReportPolicy,
)
from app.models.tree import NodeAssignment, NodeType, TreeNode
from app.models.progress import ProgressRecord
from app.models.task import Task
from app.models.user import User
from app.services.notify.service import NotificationService
from app.services.llm_settings import chat_completion, resolve_llm


async def _binding_for_user(db: AsyncSession, project_id: int, user_id: int):
    return (
        await db.execute(
            select(ProjectAgentBinding).where(
                ProjectAgentBinding.project_id == project_id,
                ProjectAgentBinding.user_id == user_id,
                ProjectAgentBinding.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()


async def bind_project_agents(
    db: AsyncSession, *, project_id: int, company_id: int, actor_user_id: int
) -> list[ProjectAgentBinding]:
    """Ensure one project agent and one member agent per project participant.

    The caller is expected to have PM/company write permission.  The PM's
    agent is the project-level agent; the PM is not duplicated as a member
    agent.  Calling this repeatedly is idempotent.
    """
    project = await db.get(Project, project_id)
    if not project or project.company_id != company_id:
        raise ValueError("project_not_found")
    if project.pm_user_id is None:
        raise ValueError("project_manager_required")

    participants = (
        await db.execute(
            select(ProjectAgentBinding).where(ProjectAgentBinding.project_id == project_id)
        )
    ).scalars().all()
    by_role = {row.role: row for row in participants}
    by_user = {row.user_id: row for row in participants if row.user_id is not None}

    def _new_definition(*, user_id: int, role: str) -> AgentDefinition:
        return AgentDefinition(
            company_id=company_id,
            owner_user_id=user_id,
            kind="project_reporting" if role == "project" else "member_reporting",
            name=("项目汇报智能体" if role == "project" else "个人项目汇报智能体"),
            scene="reporting",
            config_json={"project_id": project_id, "context_scope": "project"},
        )

    project_binding = by_role.get("project")
    if project_binding is None:
        # A legacy sync may have created the PM as a member binding. Promote it
        # in place so the (project_id, user_id) unique key remains valid.
        project_binding = by_user.get(project.pm_user_id)
        if project_binding is not None:
            project_binding.role = "project"
            project_binding.is_active = True
            definition = await db.get(AgentDefinition, project_binding.agent_definition_id)
            if definition:
                definition.kind = "project_reporting"
                definition.config_json = {"project_id": project_id, "context_scope": "project"}
        else:
            definition = _new_definition(user_id=project.pm_user_id, role="project")
            db.add(definition)
            await db.flush()
            project_binding = ProjectAgentBinding(
                company_id=company_id,
                project_id=project_id,
                user_id=project.pm_user_id,
                agent_definition_id=definition.id,
                role="project",
                is_active=True,
            )
            db.add(project_binding)
            await db.flush()
    elif project_binding.user_id != project.pm_user_id:
        # PM changes follow the human project record while preserving the
        # unique project/user key. If the new PM already has a member binding,
        # swap its user id with the former project binding.
        old_pm_user_id = project_binding.user_id
        new_pm_member = by_user.get(project.pm_user_id)
        if new_pm_member is not None and new_pm_member.id != project_binding.id:
            new_pm_member.user_id = None
            await db.flush()
            project_binding.user_id = project.pm_user_id
            await db.flush()
            new_pm_member.user_id = old_pm_user_id
            new_pm_member.role = "member"
            new_pm_member.is_active = True
        else:
            project_binding.user_id = project.pm_user_id
        definition = await db.get(AgentDefinition, project_binding.agent_definition_id)
        if definition:
            definition.owner_user_id = project.pm_user_id
            definition.kind = "project_reporting"
            definition.config_json = {"project_id": project_id, "context_scope": "project"}
        project_binding.is_active = True
    elif not project_binding.is_active:
        project_binding.is_active = True

    from app.models.project import ProjectMember

    member_ids = list((
        await db.execute(
            select(ProjectMember.user_id).where(
                ProjectMember.project_id == project_id,
                ProjectMember.left_at.is_(None),
                ProjectMember.user_id != project.pm_user_id,
            )
        )
    ).scalars().all())
    # The responsibility axis is authoritative even when a historical project
    # member row was not backfilled. Include users assigned to live person
    # nodes, then let the ACL layer decide whether they may submit/read.
    axis_user_ids = (
        await db.execute(
            select(NodeAssignment.user_id)
            .join(TreeNode, TreeNode.id == NodeAssignment.node_id)
            .where(
                TreeNode.project_id == project_id,
                TreeNode.is_deleted.is_(False),
                NodeAssignment.role_key == "primary",
                NodeAssignment.user_id != project.pm_user_id,
            )
        )
    ).scalars().all()
    member_ids.extend(axis_user_ids)
    member_ids = list(dict.fromkeys(member_ids))
    active_member_ids = set(member_ids)
    for existing in participants:
        if existing.role == "member" and existing.user_id not in active_member_ids:
            existing.is_active = False
    for user_id in member_ids:
        existing = by_user.get(user_id)
        if existing:
            existing.is_active = True
            continue
        definition = _new_definition(user_id=user_id, role="member")
        db.add(definition)
        await db.flush()
        binding = ProjectAgentBinding(
            company_id=company_id,
            project_id=project_id,
            user_id=user_id,
            agent_definition_id=definition.id,
            role="member",
            is_active=True,
        )
        db.add(binding)
        await db.flush()
        by_user[user_id] = binding

    rows = (
        await db.execute(
            select(ProjectAgentBinding)
            .where(ProjectAgentBinding.project_id == project_id, ProjectAgentBinding.is_active.is_(True))
            .order_by(ProjectAgentBinding.role, ProjectAgentBinding.id)
        )
    ).scalars().all()
    return list(rows)


async def ensure_member_agent_binding(
    db: AsyncSession, *, project_id: int, user_id: int
) -> ProjectAgentBinding:
    """为项目成员创建或激活本人的个人汇报智能体绑定，非项目成员抛出 PermissionError"""
    project = await db.get(Project, project_id)
    if not project:
        raise ValueError("project_not_found")

    from app.models.project import ProjectMember
    from app.models.tree import NodeAssignment, TreeNode

    is_member = (
        await db.execute(
            select(ProjectMember.id).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user_id,
                ProjectMember.left_at.is_(None),
            )
        )
    ).first()
    if not is_member:
        is_assigned = (
            await db.execute(
                select(NodeAssignment.id)
                .join(TreeNode, TreeNode.id == NodeAssignment.node_id)
                .where(
                    TreeNode.project_id == project_id,
                    TreeNode.is_deleted.is_(False),
                    NodeAssignment.user_id == user_id,
                )
            )
        ).first()
        if not is_assigned:
            raise PermissionError("not_project_member")

    binding = (
        await db.execute(
            select(ProjectAgentBinding).where(
                ProjectAgentBinding.project_id == project_id,
                ProjectAgentBinding.user_id == user_id,
            )
        )
    ).scalar_one_or_none()

    if binding:
        binding.is_active = True
        return binding

    definition = AgentDefinition(
        company_id=project.company_id,
        owner_user_id=user_id,
        kind="member_reporting",
        name="个人项目汇报智能体",
        scene="reporting",
        config_json={"project_id": project_id, "context_scope": "project"},
    )
    db.add(definition)
    await db.flush()

    binding = ProjectAgentBinding(
        company_id=project.company_id,
        project_id=project_id,
        user_id=user_id,
        agent_definition_id=definition.id,
        role="member",
        is_active=True,
    )
    db.add(binding)
    await db.flush()
    return binding


async def resolve_direct_leader_user_id(
    db: AsyncSession, *, project_id: int, user_id: int, project_manager_id: int | None
) -> int | None:
    """Resolve the direct leader from the assigned person node's parent."""
    # SQLAlchemy aliases keep the self-join portable across SQLite/Postgres.
    from sqlalchemy.orm import aliased

    child = aliased(TreeNode)
    parent = aliased(TreeNode)
    child_type = aliased(NodeType)
    parent_type = aliased(NodeType)
    parent_asg = aliased(NodeAssignment)
    result = await db.execute(
        select(parent_asg.user_id)
        .select_from(NodeAssignment)
        .join(child, child.id == NodeAssignment.node_id)
        .join(child_type, child_type.id == child.node_type_id)
        .join(parent, parent.id == child.parent_id)
        .join(parent_type, parent_type.id == parent.node_type_id)
        .join(parent_asg, parent_asg.node_id == parent.id)
        .where(
            NodeAssignment.user_id == user_id,
            child.project_id == project_id,
            parent.project_id == project_id,
            child_type.behavior_template == "person",
            parent_type.behavior_template == "person",
            child.is_deleted.is_(False),
            parent.is_deleted.is_(False),
            NodeAssignment.role_key == "primary",
            parent_asg.role_key == "primary",
            parent_asg.user_id != user_id,
        )
        .order_by(parent_asg.id)
        .limit(1)
    )
    direct = result.scalar_one_or_none()
    return direct if direct is not None else (project_manager_id if project_manager_id != user_id else None)


async def _ensure_agent_session(
    db: AsyncSession, *, binding: ProjectAgentBinding, user_id: int
) -> AgentSession:
    session = (
        await db.execute(
            select(AgentSession).where(
                AgentSession.project_id == binding.project_id,
                AgentSession.agent_definition_id == binding.agent_definition_id,
                AgentSession.user_id == user_id,
            ).limit(1)
        )
    ).scalar_one_or_none()
    if session:
        return session
    session = AgentSession(
        company_id=binding.company_id,
        project_id=binding.project_id,
        agent_definition_id=binding.agent_definition_id,
        user_id=user_id,
        channel="system",
        title="项目汇报上下文",
    )
    db.add(session)
    await db.flush()
    return session


async def submit_member_report(
    db: AsyncSession,
    *,
    binding_id: int,
    author_user_id: int,
    summary: str,
    sources: list[dict] | None = None,
    payload: dict | None = None,
    report_id: int | None = None,
) -> AgentReport:
    binding = await db.get(ProjectAgentBinding, binding_id)
    if not binding or not binding.is_active or binding.role != "member":
        raise ValueError("member_agent_binding_not_found")
    if binding.user_id != author_user_id:
        raise ValueError("binding_owner_mismatch")
    summary = (summary or "").strip()
    if not summary:
        raise ValueError("summary_required")
    project = await db.get(Project, binding.project_id)
    if not project or project.company_id != binding.company_id:
        raise ValueError("project_not_found")

    parent_user_id = await resolve_direct_leader_user_id(
        db,
        project_id=project.id,
        user_id=author_user_id,
        project_manager_id=project.pm_user_id,
    )
    normalized_sources = []
    for source in sources or []:
        metadata = source.get("metadata") or {}
        source_project_id = metadata.get("project_id")
        if source_project_id is not None and int(source_project_id) != project.id:
            raise ValueError("source_project_mismatch")
        normalized_sources.append((source, metadata))
    report = await db.get(AgentReport, report_id) if report_id is not None else None
    if report is not None:
        if report.binding_id != binding.id or report.author_user_id != author_user_id or report.status not in ("draft", "submitted"):
            raise ValueError("report_not_editable")
        report.parent_user_id = parent_user_id
        report.status = "submitted"
        report.summary_text = summary
        report.payload_json = {
            **(report.payload_json or {}),
            **(payload or {}),
            "context_scope": {"company_id": binding.company_id, "project_id": binding.project_id},
        }
    else:
        report = AgentReport(
            company_id=binding.company_id,
            project_id=binding.project_id,
            binding_id=binding.id,
            author_user_id=author_user_id,
            parent_user_id=parent_user_id,
            status="submitted",
            summary_text=summary,
            payload_json={**(payload or {}), "context_scope": {"company_id": binding.company_id, "project_id": binding.project_id}},
        )
        db.add(report)
        await db.flush()
    for source, metadata in normalized_sources:
        db.add(
            AgentReportSource(
                report_id=report.id,
                source_type=str(source.get("source_type") or "unknown"),
                source_id=source.get("source_id"),
                excerpt=source.get("excerpt"),
                metadata_json=metadata,
            )
        )

    if parent_user_id is not None:
        parent_binding = await _binding_for_user(db, project.id, parent_user_id)
        if parent_binding is None:
            parent_binding = (
                await db.execute(
                    select(ProjectAgentBinding).where(
                        ProjectAgentBinding.project_id == project.id,
                        ProjectAgentBinding.role == "project",
                        ProjectAgentBinding.is_active.is_(True),
                    ).limit(1)
                )
            ).scalar_one_or_none()
        if parent_binding:
            session = await _ensure_agent_session(db, binding=parent_binding, user_id=parent_user_id)
            db.add(
                AgentMessage(
                    session_id=session.id,
                    role="system",
                    content=f"收到下属项目汇报（项目 {project.name}）：\n{summary}",
                    meta_json={"report_id": report.id, "project_id": project.id, "context_scope": "project"},
                )
            )
        await NotificationService().enqueue(
            db,
            company_id=binding.company_id,
            user_ids=[parent_user_id],
            template_key="agent.report.submitted",
            payload={"project_id": project.id, "report_id": report.id, "summary": summary},
            channels=["in_app"],
            project_id=project.id,
        )
    await db.flush()
    return report


async def create_member_report_draft(
    db: AsyncSession, *, binding_id: int, author_user_id: int
) -> AgentReport:
    """Create or return the current draft for a member agent (mobile alias)."""
    binding = await db.get(ProjectAgentBinding, binding_id)
    if not binding or not binding.is_active or binding.role != "member":
        raise ValueError("member_agent_binding_not_found")
    if binding.user_id != author_user_id:
        raise ValueError("binding_owner_mismatch")
    existing = (
        await db.execute(
            select(AgentReport)
            .where(
                AgentReport.binding_id == binding_id,
                AgentReport.author_user_id == author_user_id,
                AgentReport.status == "draft",
            )
            .order_by(AgentReport.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing:
        return existing
    project = await db.get(Project, binding.project_id)
    if not project:
        raise ValueError("project_not_found")
    parent_user_id = await resolve_direct_leader_user_id(
        db, project_id=project.id, user_id=author_user_id, project_manager_id=project.pm_user_id
    )
    draft = AgentReport(
        company_id=binding.company_id,
        project_id=binding.project_id,
        binding_id=binding.id,
        author_user_id=author_user_id,
        parent_user_id=parent_user_id,
        status="draft",
        summary_text="",
        payload_json={"context_scope": {"company_id": binding.company_id, "project_id": binding.project_id}},
    )
    db.add(draft)
    await db.flush()
    return draft


class ReportGenerationUnavailable(ValueError):
    """The report cannot be generated without a usable configured model."""


async def generate_member_report_draft(
    db: AsyncSession, *, binding_id: int, author_user_id: int
) -> AgentReport:
    """Generate a grounded member draft from project-scoped facts.

    Only facts owned by the member in this project are sent to the model. A
    fake/unconfigured model is rejected explicitly; the fallback chat behavior
    used for interactive assistance must never create an official report.
    """
    binding = await db.get(ProjectAgentBinding, binding_id)
    if not binding or not binding.is_active or binding.role != "member":
        raise ValueError("member_agent_binding_not_found")
    if binding.user_id != author_user_id:
        raise ValueError("binding_owner_mismatch")
    project = await db.get(Project, binding.project_id)
    user = await db.get(User, author_user_id)
    if not project or not user or project.company_id != binding.company_id:
        raise ValueError("project_not_found")

    tasks = (
        await db.execute(
            select(Task)
            .where(
                Task.user_id == author_user_id,
                Task.company_id == binding.company_id,
                Task.project_id == project.id,
                Task.is_deleted.is_(False),
            )
            .order_by(Task.updated_at.desc(), Task.id.desc())
            .limit(100)
        )
    ).scalars().all()
    node_rows = (
        await db.execute(
            select(TreeNode)
            .join(NodeAssignment, NodeAssignment.node_id == TreeNode.id)
            .where(
                NodeAssignment.user_id == author_user_id,
                NodeAssignment.role_key == "primary",
                TreeNode.company_id == binding.company_id,
                TreeNode.project_id == project.id,
                TreeNode.is_deleted.is_(False),
            )
            .order_by(TreeNode.updated_at.desc(), TreeNode.id.desc())
            .limit(100)
        )
    ).scalars().all()
    node_ids = [node.id for node in node_rows]
    progress_filter = [
        ProgressRecord.company_id == binding.company_id,
        ProgressRecord.project_id == project.id,
    ]
    if node_ids:
        from sqlalchemy import or_

        progress_filter.append(
            or_(
                ProgressRecord.actor_user_id == author_user_id,
                ProgressRecord.node_id.in_(node_ids),
            )
        )
    else:
        progress_filter.append(ProgressRecord.actor_user_id == author_user_id)
    progress = (
        await db.execute(
            select(ProgressRecord)
            .where(*progress_filter)
            .order_by(ProgressRecord.created_at.desc(), ProgressRecord.id.desc())
            .limit(100)
        )
    ).scalars().all()
    evidence = (
        await db.execute(
            select(EvidencePackage)
            .where(
                EvidencePackage.company_id == binding.company_id,
                EvidencePackage.project_id == project.id,
                EvidencePackage.submitter_user_id == author_user_id,
                EvidencePackage.status.in_(
                    ("submitted", "under_review", "pending_review", "adopted", "rejected")
                ),
            )
            .order_by(EvidencePackage.created_at.desc(), EvidencePackage.id.desc())
            .limit(100)
        )
    ).scalars().all()
    evidence_files = []
    evidence_text_by_file: dict[int, str] = {}
    if evidence:
        file_rows = (
            await db.execute(
                select(EvidenceFile).where(
                    EvidenceFile.package_id.in_([item.id for item in evidence]),
                    EvidenceFile.company_id == binding.company_id,
                    EvidenceFile.project_id == project.id,
                    EvidenceFile.uploader_user_id == author_user_id,
                )
            )
        ).scalars().all()
        evidence_files = file_rows
        if file_rows:
            text_rows = (
                await db.execute(
                    select(EvidenceFileText).where(
                        EvidenceFileText.evidence_file_id.in_([item.id for item in file_rows]),
                        EvidenceFileText.company_id == binding.company_id,
                        EvidenceFileText.project_id == project.id,
                        EvidenceFileText.status == "succeeded",
                    )
                )
            ).scalars().all()
            evidence_text_by_file = {
                item.evidence_file_id: (item.text_md or "")[:12000]
                for item in text_rows
                if (item.text_md or "").strip()
            }
    user_notes = (
        await db.execute(
            select(AgentMessage)
            .join(AgentSession, AgentSession.id == AgentMessage.session_id)
            .where(
                AgentSession.company_id == binding.company_id,
                AgentSession.project_id == project.id,
                AgentSession.user_id == author_user_id,
                AgentMessage.role == "user",
            )
            .order_by(AgentMessage.created_at.desc(), AgentMessage.id.desc())
            .limit(50)
        )
    ).scalars().all()

    source_refs: list[dict] = []
    task_snapshot = []
    for task in tasks:
        task_snapshot.append(
            {
                "id": task.id,
                "title": task.title,
                "status": task.status,
                "completion_rate": task.completion_rate,
                "due_date": task.due_date.isoformat() if task.due_date else None,
                "needs_follow_up": task.needs_follow_up,
                "comment": task.completion_comment,
            }
        )
        source_refs.append(
            {
                "source_type": "task",
                "source_id": task.id,
                "excerpt": task.title,
                "metadata": {"project_id": project.id, "status": task.status},
            }
        )
    node_snapshot = []
    for node in node_rows:
        node_snapshot.append(
            {"id": node.id, "title": node.title, "progress": node.progress_json or {}}
        )
        source_refs.append(
            {
                "source_type": "tree_node",
                "source_id": node.id,
                "excerpt": node.title,
                "metadata": {"project_id": project.id, "progress": node.progress_json or {}},
            }
        )
    progress_snapshot = []
    for item in progress:
        progress_snapshot.append(
            {
                "id": item.id,
                "node_id": item.node_id,
                "event_type": item.event_type,
                "source": item.source,
                "after": item.after_json or {},
                "reason": item.reason,
            }
        )
        source_refs.append(
            {
                "source_type": "progress_record",
                "source_id": item.id,
                "excerpt": item.reason or item.event_type,
                "metadata": {"project_id": project.id, "node_id": item.node_id},
            }
        )
    evidence_snapshot = []
    for item in evidence:
        package_files = [file for file in evidence_files if file.package_id == item.id]
        evidence_snapshot.append(
            {
                "id": item.id,
                "node_id": item.node_id,
                "status": item.status,
                "summary": item.summary_text,
                "structured": item.structured_json or {},
                "files": [
                    {
                        "id": file.id,
                        "name": file.original_name,
                        "mime_type": file.mime_type,
                        "extracted_text": evidence_text_by_file.get(file.id, ""),
                    }
                    for file in package_files
                ],
            }
        )
        source_refs.append(
            {
                "source_type": "evidence_package",
                "source_id": item.id,
                "excerpt": item.summary_text or item.status,
                "metadata": {"project_id": project.id, "node_id": item.node_id, "status": item.status},
            }
        )
        for file in package_files:
            extracted = evidence_text_by_file.get(file.id, "")
            source_refs.append(
                {
                    "source_type": "evidence_file",
                    "source_id": file.id,
                    "excerpt": extracted[:500] or file.original_name,
                    "metadata": {
                        "project_id": project.id,
                        "package_id": item.id,
                        "owner_user_id": author_user_id,
                        "original_name": file.original_name,
                    },
                }
            )
    notes_snapshot = []
    for note in user_notes:
        notes_snapshot.append({"id": note.id, "content": note.content})
        source_refs.append(
            {
                "source_type": "agent_message",
                "source_id": note.id,
                "excerpt": note.content[:500],
                "metadata": {"project_id": project.id, "role": "user"},
            }
        )

    if not source_refs:
        raise ValueError("report_sources_empty")
    llm = await resolve_llm(db, company_id=binding.company_id, user=user)
    if (
        llm.provider == "fake"
        or not llm.use_for_agent
        or not llm.is_usable()
    ):
        raise ReportGenerationUnavailable("llm_not_configured")
    facts = {
        "project": {"id": project.id, "name": project.name},
        "tasks": task_snapshot,
        "responsibility_nodes": node_snapshot,
        "formal_progress": progress_snapshot,
        "evidence": evidence_snapshot,
        "user_ai_notes": notes_snapshot,
    }
    prompt = (
        "根据以下项目内事实生成中文个人工作汇报。只能引用给定事实，不能推测或补齐未知信息。"
        "输出四段：已完成、进行中、风险/阻塞、下一步；每段使用要点。"
        "没有事实支撑的内容写‘暂无资料’，不要宣称已完成。\n"
        + str(facts)
    )
    result = await chat_completion(
        llm,
        messages=[
            {"role": "system", "content": "你是项目汇报助手，必须严格基于来源事实。"},
            {"role": "user", "content": prompt},
        ],
    )
    if not result.get("ok") or not (result.get("content") or "").strip():
        raise ValueError(f"llm_generation_failed:{result.get('error') or 'empty_response'}")
    draft = await create_member_report_draft(
        db, binding_id=binding_id, author_user_id=author_user_id
    )
    draft.summary_text = str(result["content"]).strip()
    draft.status = "draft"
    draft.payload_json = {
        "context_scope": {"company_id": binding.company_id, "project_id": project.id},
        "grounded": True,
        "requires_confirmation": True,
        "model_provider": result.get("provider") or llm.provider,
        "source_count": len(source_refs),
        "task_snapshot": task_snapshot,
        "node_snapshot": node_snapshot,
        "progress_snapshot": progress_snapshot,
        "evidence_snapshot": evidence_snapshot,
        "user_ai_notes": notes_snapshot,
    }
    await db.execute(delete(AgentReportSource).where(AgentReportSource.report_id == draft.id))
    for source in source_refs:
        db.add(
            AgentReportSource(
                report_id=draft.id,
                source_type=source["source_type"],
                source_id=source["source_id"],
                excerpt=source["excerpt"],
                metadata_json=source["metadata"],
            )
        )
    await db.flush()
    return draft


async def aggregate_project_report(
    db: AsyncSession, *, project_id: int, actor_user_id: int
) -> ProjectReportEnvelope:
    project = await db.get(Project, project_id)
    if not project:
        raise ValueError("project_not_found")
    binding = (
        await db.execute(
            select(ProjectAgentBinding).where(
                ProjectAgentBinding.project_id == project_id,
                ProjectAgentBinding.role == "project",
                ProjectAgentBinding.is_active.is_(True),
            ).limit(1)
        )
    ).scalar_one_or_none()
    if not binding:
        raise ValueError("project_agent_binding_not_found")
    reports = (
        await db.execute(
            select(AgentReport)
            .where(AgentReport.project_id == project_id, AgentReport.status == "submitted")
            .order_by(AgentReport.created_at)
        )
    ).scalars().all()
    source_count = 0
    if reports:
        from sqlalchemy import func

        source_count = int(
            (
                await db.execute(
                    select(func.count(AgentReportSource.id)).where(
                        AgentReportSource.report_id.in_([r.id for r in reports])
                    )
                )
            ).scalar()
            or 0
        )
    conflicts: list[dict] = []
    seen_task_status: dict[int, tuple[int, object]] = {}
    for report in reports:
        for task in (report.payload_json or {}).get("task_snapshot", []):
            task_id = task.get("id")
            status = task.get("status")
            if task_id is None:
                continue
            previous = seen_task_status.get(int(task_id))
            if previous and previous[1] != status:
                conflicts.append(
                    {
                        "type": "task_status_mismatch",
                        "task_id": int(task_id),
                        "report_ids": [previous[0], report.id],
                        "statuses": [previous[1], status],
                        "severity": "warning",
                    }
                )
            else:
                seen_task_status[int(task_id)] = (report.id, status)
    lines = [f"【{project.name}】项目汇报", f"已收到 {len(reports)} 份下属智能体汇报。"]
    lines.extend(f"- {r.summary_text}" for r in reports)
    envelope = ProjectReportEnvelope(
        company_id=project.company_id,
        project_id=project.id,
        project_binding_id=binding.id,
        status="submitted",
        summary_text="\n".join(lines),
        payload_json={
            "report_ids": [r.id for r in reports],
            "report_count": len(reports),
            "source_count": source_count,
            "conflicts": conflicts,
            "actor_user_id": actor_user_id,
            "context_scope": {"company_id": project.company_id, "project_id": project.id},
        },
    )
    db.add(envelope)
    for report in reports:
        report.status = "aggregated"
    await db.flush()
    if project.pm_user_id is not None:
        project_binding = await _binding_for_user(db, project.id, project.pm_user_id)
        if project_binding is None:
            project_binding = binding
        session = await _ensure_agent_session(
            db, binding=project_binding, user_id=project.pm_user_id
        )
        db.add(
            AgentMessage(
                session_id=session.id,
                role="system",
                content=f"项目汇总已生成（项目 {project.name}）：\n{envelope.summary_text}",
                meta_json={
                    "envelope_id": envelope.id,
                    "project_id": project.id,
                    "context_scope": "project",
                    "conflicts": conflicts,
                },
            )
        )
        await NotificationService().enqueue(
            db,
            company_id=project.company_id,
            user_ids=[project.pm_user_id],
            template_key="project.report.aggregated",
            payload={
                "project_id": project.id,
                "report_count": len(reports),
                "envelope_id": envelope.id,
            },
            channels=["in_app"],
            project_id=project.id,
        )
    await db.flush()
    return envelope


async def aggregate_leadership_report(
    db: AsyncSession,
    *,
    company_id: int,
    leader_user_id: int,
    project_ids: list[int] | None = None,
) -> LeadershipReportEnvelope:
    """Package the latest project summaries for the top leader.

    Only project envelopes enter the company-level context. If the configured
    model is unavailable, a source-backed deterministic package is still
    created and explicitly marked ``ai_status=unavailable``.
    """
    project_filter = [ProjectReportEnvelope.company_id == company_id]
    if project_ids:
        project_filter.append(ProjectReportEnvelope.project_id.in_(project_ids))
    envelopes = (
        await db.execute(
            select(ProjectReportEnvelope)
            .where(*project_filter)
            .order_by(ProjectReportEnvelope.project_id, ProjectReportEnvelope.created_at.desc(), ProjectReportEnvelope.id.desc())
        )
    ).scalars().all()
    latest: dict[int, ProjectReportEnvelope] = {}
    for envelope in envelopes:
        latest.setdefault(envelope.project_id, envelope)
    if not latest:
        raise ValueError("project_envelopes_empty")
    project_rows = (
        await db.execute(select(Project).where(Project.id.in_(list(latest)), Project.company_id == company_id))
    ).scalars().all()
    names = {p.id: p.name for p in project_rows}
    project_facts = [
        {
            "project_id": project_id,
            "project_name": names.get(project_id, f"项目#{project_id}"),
            "summary": envelope.summary_text,
            "payload": envelope.payload_json or {},
        }
        for project_id, envelope in latest.items()
    ]
    deterministic = "\n".join(
        ["公司项目汇报封装", *[f"- {p['project_name']}：{p['summary']}" for p in project_facts]]
    )
    payload = {
        "context_scope": {"company_id": company_id, "scope": "project_envelopes_only"},
        "project_ids": list(latest),
        "project_envelope_ids": [e.id for e in latest.values()],
        "project_count": len(latest),
        "source_count": sum(int((e.payload_json or {}).get("source_count", 0)) for e in latest.values()),
        "ai_status": "unavailable",
    }
    leader = await db.get(User, leader_user_id)
    llm = await resolve_llm(db, company_id=company_id, user=leader)
    if llm.provider != "fake" and llm.use_for_agent and llm.is_usable():
        result = await chat_completion(
            llm,
            messages=[
                {"role": "system", "content": "你是总领导汇报助手，只能基于各项目封装事实总结，不得读取或推测项目原始资料。"},
                {"role": "user", "content": "请总结以下项目汇报，指出完成情况、风险、冲突和需要决策事项：\n" + str(project_facts)},
            ],
        )
        if result.get("ok") and (result.get("content") or "").strip():
            deterministic = str(result["content"]).strip()
            payload["ai_status"] = "generated"
            payload["model_provider"] = result.get("provider") or llm.provider
        else:
            payload["ai_error"] = result.get("error") or "empty_response"
    envelope = LeadershipReportEnvelope(
        company_id=company_id,
        leader_user_id=leader_user_id,
        status="submitted",
        summary_text=deterministic,
        payload_json=payload,
    )
    db.add(envelope)
    await db.flush()
    leader_agent = (
        await db.execute(
            select(AgentDefinition)
            .where(
                AgentDefinition.company_id == company_id,
                AgentDefinition.owner_user_id == leader_user_id,
                AgentDefinition.kind == "leadership_reporting",
                AgentDefinition.is_deleted.is_(False),
            )
            .order_by(AgentDefinition.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if leader_agent is None:
        leader_agent = AgentDefinition(
            company_id=company_id,
            owner_user_id=leader_user_id,
            kind="leadership_reporting",
            name="总领导汇报智能体",
            scene="reporting",
            config_json={"context_scope": "project_envelopes_only"},
        )
        db.add(leader_agent)
        await db.flush()
    leader_session = (
        await db.execute(
            select(AgentSession)
            .where(
                AgentSession.company_id == company_id,
                AgentSession.project_id.is_(None),
                AgentSession.agent_definition_id == leader_agent.id,
                AgentSession.user_id == leader_user_id,
            )
            .limit(1)
        )
    ).scalar_one_or_none()
    if leader_session is None:
        leader_session = AgentSession(
            company_id=company_id,
            project_id=None,
            agent_definition_id=leader_agent.id,
            user_id=leader_user_id,
            channel="system",
            title="总领导项目汇报上下文",
        )
        db.add(leader_session)
        await db.flush()
    db.add(
        AgentMessage(
            session_id=leader_session.id,
            role="system",
            content=f"收到公司项目汇报封装：\n{deterministic}",
            meta_json={
                "envelope_id": envelope.id,
                "company_id": company_id,
                "project_ids": list(latest),
                "context_scope": "project_envelopes_only",
            },
        )
    )
    await db.flush()
    return envelope


async def run_scheduled_report_generation(db: AsyncSession) -> dict:
    """Generate member drafts for enabled ``cron`` report policies.

    Scheduled runs never auto-submit a draft unless a policy explicitly sets
    ``config_json.auto_submit=true``. This keeps the same human confirmation
    boundary as the manual flow while still producing timely AI drafts.
    """
    policies = (
        await db.execute(
            select(ReportPolicy).where(
                ReportPolicy.enabled.is_(True), ReportPolicy.trigger == "cron"
            )
        )
    ).scalars().all()
    generated = failed = submitted = 0
    projects_seen: set[int] = set()
    for policy in policies:
        if policy.project_id in projects_seen:
            continue
        projects_seen.add(policy.project_id)
        bindings = (
            await db.execute(
                select(ProjectAgentBinding).where(
                    ProjectAgentBinding.project_id == policy.project_id,
                    ProjectAgentBinding.role == "member",
                    ProjectAgentBinding.is_active.is_(True),
                )
            )
        ).scalars().all()
        auto_submit = bool((policy.config_json or {}).get("auto_submit"))
        for binding in bindings:
            if binding.user_id is None:
                continue
            try:
                draft = await generate_member_report_draft(
                    db, binding_id=binding.id, author_user_id=binding.user_id
                )
                generated += 1
                if auto_submit:
                    await submit_member_report(
                        db,
                        binding_id=binding.id,
                        author_user_id=binding.user_id,
                        summary=draft.summary_text,
                        payload={"scheduled": True, "policy_id": policy.id},
                        report_id=draft.id,
                    )
                    submitted += 1
            except (ValueError, ReportGenerationUnavailable):
                failed += 1
        await db.flush()
    # Cron also advances any already-submitted reports one people-axis level
    # at a time; drafts remain drafts until a human confirms them.
    for project_id in projects_seen:
        try:
            for _ in range(20):
                result = await rollup_member_reports(db, project_id=project_id)
                generated += int(result.get("created", 0))
                failed += int(result.get("failed", 0))
                if not result.get("created"):
                    break
        except ValueError:
            failed += 1
    return {
        "policies": len(policies),
        "projects": len(projects_seen),
        "generated": generated,
        "submitted": submitted,
        "failed": failed,
    }


async def rollup_member_reports(
    db: AsyncSession, *, project_id: int, actor_user_id: int | None = None
) -> dict:
    """Generate submitted rollups for non-root people-axis leaders.

    A rollup consumes only direct-child ``AgentReport`` rows and is emitted as
    a new submitted report authored by the parent person. The project manager
    remains the root and is handled by ``aggregate_project_report``.
    """
    project = await db.get(Project, project_id)
    if not project:
        raise ValueError("project_not_found")
    rows = (
        await db.execute(
            select(AgentReport)
            .where(AgentReport.project_id == project_id, AgentReport.status == "submitted")
            .order_by(AgentReport.id)
        )
    ).scalars().all()
    groups: dict[int, list[AgentReport]] = {}
    for report in rows:
        if report.parent_user_id is not None:
            groups.setdefault(report.parent_user_id, []).append(report)
    created = skipped = failed = 0
    for parent_user_id, children in groups.items():
        if parent_user_id == project.pm_user_id:
            skipped += 1
            continue
        parent_binding = await _binding_for_user(db, project_id, parent_user_id)
        if parent_binding is None or parent_binding.role != "member":
            skipped += 1
            continue
        child_ids = sorted(r.id for r in children)
        already = (
            await db.execute(
                select(AgentReport).where(
                    AgentReport.project_id == project_id,
                    AgentReport.author_user_id == parent_user_id,
                    AgentReport.status.in_(("submitted", "aggregated")),
                )
            )
        ).scalars().all()
        if any(sorted((r.payload_json or {}).get("child_report_ids", [])) == child_ids for r in already):
            skipped += 1
            continue
        parent_parent_id = await resolve_direct_leader_user_id(
            db, project_id=project_id, user_id=parent_user_id, project_manager_id=project.pm_user_id
        )
        parent_user = await db.get(User, parent_user_id)
        llm = await resolve_llm(db, company_id=project.company_id, user=parent_user)
        if llm.provider == "fake" or not llm.use_for_agent or not llm.is_usable():
            failed += 1
            continue
        prompt = (
            "将以下直属下属汇报合并成一份中文上级汇报。只能引用原文事实，输出已完成、进行中、风险/阻塞、下一步；"
            "保留无法确认的信息，不要补写。\n"
            + str([{"report_id": r.id, "summary": r.summary_text, "payload": r.payload_json or {}} for r in children])
        )
        result = await chat_completion(
            llm,
            messages=[
                {"role": "system", "content": "你是人轴逐级汇报助手，只基于下属已提交事实。"},
                {"role": "user", "content": prompt},
            ],
        )
        if not result.get("ok") or not (result.get("content") or "").strip():
            failed += 1
            continue
        rollup = AgentReport(
            company_id=project.company_id,
            project_id=project_id,
            binding_id=parent_binding.id,
            author_user_id=parent_user_id,
            parent_user_id=parent_parent_id,
            status="submitted",
            summary_text=str(result["content"]).strip(),
            payload_json={
                "context_scope": {"company_id": project.company_id, "project_id": project_id},
                "rollup": True,
                "child_report_ids": child_ids,
                "model_provider": result.get("provider") or llm.provider,
                "source_count": len(children),
            },
        )
        db.add(rollup)
        await db.flush()
        for child in children:
            child.status = "aggregated"
            db.add(
                AgentReportSource(
                    report_id=rollup.id,
                    source_type="agent_report",
                    source_id=child.id,
                    excerpt=child.summary_text[:500],
                    metadata_json={"project_id": project_id, "child_report_id": child.id},
                )
            )
        session = await _ensure_agent_session(
            db, binding=parent_binding, user_id=parent_user_id
        )
        db.add(
            AgentMessage(
                session_id=session.id,
                role="system",
                content=f"已生成下属汇总：\n{rollup.summary_text}",
                meta_json={"report_id": rollup.id, "child_report_ids": child_ids, "context_scope": "project"},
            )
        )
        if parent_parent_id is not None:
            await NotificationService().enqueue(
                db,
                company_id=project.company_id,
                user_ids=[parent_parent_id],
                template_key="agent.report.submitted",
                payload={"project_id": project_id, "report_id": rollup.id, "summary": rollup.summary_text},
                channels=["in_app"],
                project_id=project_id,
            )
        created += 1
    await db.flush()
    return {"project_id": project_id, "created": created, "skipped": skipped, "failed": failed}
