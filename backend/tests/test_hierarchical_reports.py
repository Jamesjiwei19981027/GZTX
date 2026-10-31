from datetime import datetime

import pytest

from app.models.agent import AgentDefinition, AgentMessage
from app.models.category import Category
from app.models.company import Company, CompanyMembership
from app.models.project import Project, ProjectMember
from app.models.report import ProjectReportEnvelope
from app.models.report import AgentReport, ProjectAgentBinding
from app.models.task import Task
from app.models.tree import NodeAssignment, NodeType, TreeNode
from app.models.user import User
from app.services.hierarchical_reporting import (
    aggregate_leadership_report,
    bind_project_agents,
    create_member_report_draft,
    generate_member_report_draft,
    submit_member_report,
    aggregate_project_report,
)


@pytest.mark.asyncio
async def test_member_report_routes_to_parent_and_notifies_parent_agent(db_session):
    company = Company(name="Acme", slug="acme", status="active", entitlement_json={"features": ["agents"]})
    leader = User(username="leader", email="leader@example.com", password_hash="x")
    member = User(username="member", email="member@example.com", password_hash="x")
    db_session.add_all([company, leader, member])
    await db_session.flush()
    db_session.add_all([
        CompanyMembership(company_id=company.id, user_id=leader.id, is_org_leader=True),
        CompanyMembership(company_id=company.id, user_id=member.id),
    ])
    project = Project(company_id=company.id, name="P", status="active", pm_user_id=leader.id, created_by=leader.id)
    db_session.add(project)
    await db_session.flush()
    db_session.add_all([
        ProjectMember(project_id=project.id, user_id=leader.id, role="pm"),
        ProjectMember(project_id=project.id, user_id=member.id, role="member"),
    ])
    person_type = NodeType(company_id=company.id, project_id=project.id, key="person", name="人", behavior_template="person")
    db_session.add(person_type)
    await db_session.flush()
    parent = TreeNode(company_id=company.id, project_id=project.id, node_type_id=person_type.id, title="Leader", path="/1", depth=0)
    db_session.add(parent)
    await db_session.flush()
    child = TreeNode(company_id=company.id, project_id=project.id, node_type_id=person_type.id, title="Member", parent_id=parent.id, path="/1/2", depth=1)
    db_session.add(child)
    await db_session.flush()
    db_session.add_all([
        NodeAssignment(node_id=parent.id, user_id=leader.id, role_key="primary"),
        NodeAssignment(node_id=child.id, user_id=member.id, role_key="primary"),
    ])
    await db_session.commit()

    bindings = await bind_project_agents(db_session, project_id=project.id, company_id=company.id, actor_user_id=leader.id)
    await db_session.commit()
    member_binding = next(b for b in bindings if b.user_id == member.id)
    report = await submit_member_report(
        db_session,
        binding_id=member_binding.id,
        author_user_id=member.id,
        summary="本周已完成接口联调",
        sources=[{"source_type": "user_note", "source_id": 7, "excerpt": "联调记录"}],
    )
    await db_session.commit()

    assert report.parent_user_id == leader.id
    assert report.project_id == project.id
    assert report.status == "submitted"
    messages = (await db_session.execute(
        __import__("sqlalchemy").select(AgentMessage).where(AgentMessage.content.like("%本周已完成接口联调%"))
    )).scalars().all()
    assert messages


@pytest.mark.asyncio
async def test_root_persons_assigned_work_item_cannot_route_report_to_self(db_session):
    from app.services.hierarchical_reporting import resolve_direct_leader_user_id

    company = Company(name="Routing", slug="routing", status="active")
    leader = User(username="routing_pm", password_hash="x")
    member = User(username="routing_member", password_hash="x")
    db_session.add_all([company, leader, member])
    await db_session.flush()
    project = Project(company_id=company.id, name="Routing", status="active", pm_user_id=leader.id, created_by=leader.id)
    db_session.add(project)
    await db_session.flush()
    person_type = NodeType(company_id=company.id, project_id=project.id, key="person", name="人", behavior_template="person")
    work_type = NodeType(company_id=company.id, project_id=project.id, key="work_item", name="事项", behavior_template="work_item")
    db_session.add_all([person_type, work_type])
    await db_session.flush()
    person = TreeNode(company_id=company.id, project_id=project.id, node_type_id=person_type.id, title="Member", path="/1", depth=0)
    db_session.add(person)
    await db_session.flush()
    work = TreeNode(company_id=company.id, project_id=project.id, node_type_id=work_type.id, parent_id=person.id, title="Member work", path="/1/2", depth=1)
    db_session.add(work)
    await db_session.flush()
    db_session.add_all([
        NodeAssignment(node_id=person.id, user_id=member.id, role_key="primary"),
        NodeAssignment(node_id=work.id, user_id=member.id, role_key="primary"),
    ])
    await db_session.flush()
    assert await resolve_direct_leader_user_id(
        db_session, project_id=project.id, user_id=member.id, project_manager_id=leader.id,
    ) == leader.id


@pytest.mark.asyncio
async def test_project_agent_context_isolation(db_session):
    company = Company(name="Acme2", slug="acme2", status="active", entitlement_json={"features": ["agents"]})
    leader = User(username="leader2", password_hash="x")
    db_session.add_all([company, leader])
    await db_session.flush()
    db_session.add(CompanyMembership(company_id=company.id, user_id=leader.id, is_org_leader=True))
    p1 = Project(company_id=company.id, name="P1", status="active", pm_user_id=leader.id, created_by=leader.id)
    p2 = Project(company_id=company.id, name="P2", status="active", pm_user_id=leader.id, created_by=leader.id)
    db_session.add_all([p1, p2])
    await db_session.flush()
    await bind_project_agents(db_session, project_id=p1.id, company_id=company.id, actor_user_id=leader.id)
    await bind_project_agents(db_session, project_id=p2.id, company_id=company.id, actor_user_id=leader.id)
    await db_session.commit()
    from app.models.report import ProjectAgentBinding
    rows = (await db_session.execute(__import__("sqlalchemy").select(ProjectAgentBinding))).scalars().all()
    assert len(rows) == 2
    assert {r.project_id for r in rows} == {p1.id, p2.id}
    assert len({r.agent_definition_id for r in rows}) == 2


@pytest.mark.asyncio
async def test_mobile_compat_report_draft_is_idempotent(db_session):
    company = Company(name="Acme3", slug="acme3", status="active", entitlement_json={"features": ["agents"]})
    user = User(username="member3", password_hash="x")
    leader = User(username="leader3", password_hash="x")
    db_session.add_all([company, user, leader])
    await db_session.flush()
    db_session.add_all([
        CompanyMembership(company_id=company.id, user_id=user.id),
        CompanyMembership(company_id=company.id, user_id=leader.id, is_org_leader=True),
    ])
    project = Project(company_id=company.id, name="P3", status="active", pm_user_id=leader.id, created_by=leader.id)
    db_session.add(project)
    await db_session.flush()
    db_session.add_all([
        ProjectMember(project_id=project.id, user_id=leader.id, role="pm"),
        ProjectMember(project_id=project.id, user_id=user.id, role="member"),
    ])
    await db_session.commit()
    bindings = await bind_project_agents(db_session, project_id=project.id, company_id=company.id, actor_user_id=leader.id)
    member_binding = next(b for b in bindings if b.user_id == user.id)
    draft = await create_member_report_draft(db_session, binding_id=member_binding.id, author_user_id=user.id)
    same = await create_member_report_draft(db_session, binding_id=member_binding.id, author_user_id=user.id)
    assert draft.id == same.id
    assert draft.status == "draft"


@pytest.mark.asyncio
async def test_report_rejects_cross_project_source_metadata(db_session):
    company = Company(name="Acme4", slug="acme4", status="active", entitlement_json={"features": ["agents"]})
    leader = User(username="leader4", password_hash="x")
    member = User(username="member4", password_hash="x")
    db_session.add_all([company, leader, member])
    await db_session.flush()
    db_session.add_all([
        CompanyMembership(company_id=company.id, user_id=leader.id, is_org_leader=True),
        CompanyMembership(company_id=company.id, user_id=member.id),
    ])
    project = Project(company_id=company.id, name="P4", status="active", pm_user_id=leader.id, created_by=leader.id)
    db_session.add(project)
    await db_session.flush()
    db_session.add_all([
        ProjectMember(project_id=project.id, user_id=leader.id, role="pm"),
        ProjectMember(project_id=project.id, user_id=member.id, role="member"),
    ])
    await db_session.commit()
    bindings = await bind_project_agents(db_session, project_id=project.id, company_id=company.id, actor_user_id=leader.id)
    member_binding = next(b for b in bindings if b.user_id == member.id)
    with pytest.raises(ValueError, match="source_project_mismatch"):
        await submit_member_report(
            db_session,
            binding_id=member_binding.id,
            author_user_id=member.id,
            summary="x",
            sources=[{"source_type": "task", "metadata": {"project_id": 999}}],
        )


@pytest.mark.asyncio
async def test_report_generation_requires_grounded_sources(db_session, monkeypatch):
    company = Company(name="Acme5", slug="acme5", status="active", entitlement_json={"features": ["agents"]})
    leader = User(username="leader5", password_hash="x")
    member = User(username="member5", password_hash="x")
    db_session.add_all([company, leader, member])
    await db_session.flush()
    db_session.add_all([
        CompanyMembership(company_id=company.id, user_id=leader.id, is_org_leader=True),
        CompanyMembership(company_id=company.id, user_id=member.id),
    ])
    project = Project(company_id=company.id, name="P5", status="active", pm_user_id=leader.id, created_by=leader.id)
    db_session.add(project)
    await db_session.flush()
    db_session.add_all([
        ProjectMember(project_id=project.id, user_id=leader.id, role="pm"),
        ProjectMember(project_id=project.id, user_id=member.id, role="member"),
    ])
    category = Category(user_id=member.id, name="工作")
    db_session.add(category)
    await db_session.flush()
    db_session.add(Task(user_id=member.id, category_id=category.id, company_id=company.id, project_id=project.id, title="接口联调", status=1))
    await db_session.commit()
    bindings = await bind_project_agents(db_session, project_id=project.id, company_id=company.id, actor_user_id=leader.id)
    member_binding = next(b for b in bindings if b.user_id == member.id)

    import app.services.hierarchical_reporting as reporting
    class FakeNoModel:
        provider = "fake"
        use_for_agent = True
        source = "fake"
        def is_usable(self):
            return True
    async def no_model(*args, **kwargs):
        return FakeNoModel()
    monkeypatch.setattr(reporting, "resolve_llm", no_model)
    with pytest.raises(ValueError, match="llm_not_configured"):
        await generate_member_report_draft(db_session, binding_id=member_binding.id, author_user_id=member.id)

    class WorkingModel(FakeNoModel):
        provider = "openai_compatible"
        source = "company"
        api_key = "key"
        base_url = "http://llm.test/v1"
        model = "report-model"

    async def working_model(*args, **kwargs):
        return WorkingModel()
    async def completion(*args, **kwargs):
        return {"ok": True, "provider": "openai_compatible", "content": "已完成：接口联调。\n进行中：暂无资料。"}
    monkeypatch.setattr(reporting, "resolve_llm", working_model)
    monkeypatch.setattr(reporting, "chat_completion", completion)
    draft = await generate_member_report_draft(db_session, binding_id=member_binding.id, author_user_id=member.id)
    assert draft.status == "draft"
    assert draft.payload_json["grounded"] is True
    assert draft.payload_json["source_count"] >= 1


@pytest.mark.asyncio
async def test_leadership_envelope_is_project_scoped_and_marks_missing_ai(db_session, monkeypatch):
    company = Company(name="Acme6", slug="acme6", status="active", entitlement_json={"features": ["agents"]})
    leader = User(username="leader6", password_hash="x")
    db_session.add_all([company, leader])
    await db_session.flush()
    db_session.add(CompanyMembership(company_id=company.id, user_id=leader.id, is_org_leader=True))
    p1 = Project(company_id=company.id, name="P6-1", status="active", pm_user_id=leader.id, created_by=leader.id)
    p2 = Project(company_id=company.id, name="P6-2", status="active", pm_user_id=leader.id, created_by=leader.id)
    db_session.add_all([p1, p2])
    await db_session.flush()
    db_session.add_all([
        ProjectReportEnvelope(company_id=company.id, project_id=p1.id, project_binding_id=1, summary_text="P1 已完成", payload_json={"source_count": 2}),
        ProjectReportEnvelope(company_id=company.id, project_id=p2.id, project_binding_id=2, summary_text="P2 有风险", payload_json={"source_count": 1}),
    ])
    await db_session.commit()

    import app.services.hierarchical_reporting as reporting
    class FakeModel:
        provider = "fake"
        use_for_agent = True
        source = "fake"
        def is_usable(self):
            return True
    async def no_model(*args, **kwargs):
        return FakeModel()
    monkeypatch.setattr(reporting, "resolve_llm", no_model)
    envelope = await aggregate_leadership_report(
        db_session, company_id=company.id, leader_user_id=leader.id, project_ids=[p1.id]
    )
    assert envelope.payload_json["project_ids"] == [p1.id]
    assert envelope.payload_json["ai_status"] == "unavailable"
    assert "P1 已完成" in envelope.summary_text


@pytest.mark.asyncio
async def test_project_aggregate_records_conflicting_task_statuses(db_session):
    company = Company(name="Acme7", slug="acme7", status="active", entitlement_json={"features": ["agents"]})
    leader = User(username="leader7", password_hash="x")
    member = User(username="member7", password_hash="x")
    db_session.add_all([company, leader, member])
    await db_session.flush()
    project = Project(company_id=company.id, name="P7", status="active", pm_user_id=leader.id, created_by=leader.id)
    db_session.add(project)
    await db_session.flush()
    definition = AgentDefinition(company_id=company.id, owner_user_id=leader.id, kind="project_reporting", name="P7 AI", scene="reporting")
    db_session.add(definition)
    await db_session.flush()
    binding = ProjectAgentBinding(company_id=company.id, project_id=project.id, user_id=leader.id, agent_definition_id=definition.id, role="project")
    db_session.add(binding)
    await db_session.flush()
    db_session.add_all([
        AgentReport(company_id=company.id, project_id=project.id, binding_id=binding.id, author_user_id=member.id, summary_text="A", payload_json={"task_snapshot": [{"id": 8, "status": 1}]}),
        AgentReport(company_id=company.id, project_id=project.id, binding_id=binding.id, author_user_id=member.id, summary_text="B", payload_json={"task_snapshot": [{"id": 8, "status": 2}]}),
    ])
    await db_session.commit()
    envelope = await aggregate_project_report(db_session, project_id=project.id, actor_user_id=leader.id)
    assert envelope.payload_json["conflicts"][0]["type"] == "task_status_mismatch"
