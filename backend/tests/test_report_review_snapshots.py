from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.security import create_access_token
from app.models.agent import AgentDefinition
from app.models.company import Company, CompanyMembership
from app.models.notify import NotifyJob
from app.models.project import Project, ProjectMember
from app.models.report import AgentReport, ProjectAgentBinding
from app.models.user import User


def headers(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': user.id})}"}


@pytest_asyncio.fixture
async def reports_setup(db_session):
    company = Company(name="汇报核验", slug="report-review", status="active")
    users = {key: User(username=f"review_{key}", password_hash="x") for key in ("pm", "receiver", "author", "peer", "admin", "outsider")}
    db_session.add_all([company, *users.values()])
    await db_session.flush()
    memberships = {}
    for key, user in users.items():
        memberships[key] = CompanyMembership(company_id=company.id, user_id=user.id, is_super_admin=key == "admin")
        db_session.add(memberships[key])
    project = Project(company_id=company.id, name="项目甲", status="active", pm_user_id=users["pm"].id, created_by=users["pm"].id)
    other = Project(company_id=company.id, name="项目乙", status="active", pm_user_id=users["outsider"].id, created_by=users["outsider"].id)
    db_session.add_all([project, other])
    await db_session.flush()
    members = {}
    for key, user in users.items():
        members[key] = ProjectMember(project_id=other.id if key == "outsider" else project.id, user_id=user.id, role="pm" if key in ("pm", "outsider") else "member")
        db_session.add(members[key])
    definition = AgentDefinition(company_id=company.id, owner_user_id=users["author"].id, kind="member_reporting", name="汇报助手", scene="reporting")
    db_session.add(definition)
    await db_session.flush()
    binding = ProjectAgentBinding(company_id=company.id, project_id=project.id, user_id=users["author"].id, agent_definition_id=definition.id, role="member", is_active=True)
    db_session.add(binding)
    await db_session.flush()
    payload = {"task_snapshot": [{"id": 42, "title": "任务快照", "status": 1}], "evidence_snapshot": [{"id": 77, "summary": "材料快照"}], "user_ai_notes": ["私人草稿备注"]}
    reports = {}
    for status in ("draft", "submitted"):
        reports[status] = AgentReport(company_id=company.id, project_id=project.id, binding_id=binding.id, author_user_id=users["author"].id, parent_user_id=users["receiver"].id, status=status, summary_text="本期汇报", payload_json=payload.copy())
        db_session.add(reports[status])
    await db_session.commit()
    return {"company": company, "users": users, "members": members, "memberships": memberships, "project": project, "other": other, "reports": reports, "binding": binding, "payload": payload}


@pytest.mark.asyncio
async def test_report_author_snapshot_contract_matches_all_three_routes(client, reports_setup):
    setup = reports_setup
    draft = setup["reports"]["draft"]
    urls = [f'/api/v1/projects/{setup["project"].id}/agent-reports', '/api/v1/reports/my', f'/api/v1/reports/{draft.id}']
    for url in urls:
        response = await client.get(url, headers=headers(setup["users"]["author"]))
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        row = next(row for row in data["items"] if row["id"] == draft.id) if "items" in data else data
        assert row["payload_json"]["task_snapshot"] == setup["payload"]["task_snapshot"]
        assert row["payload_json"]["evidence_snapshot"] == setup["payload"]["evidence_snapshot"]
    for key in ("receiver", "pm", "peer", "outsider"):
        response = await client.get(f'/api/v1/reports/{draft.id}', headers=headers(setup["users"][key]))
        assert response.status_code == 403
    submitted = setup["reports"]["submitted"]
    for key, expected_review in (("author", False), ("receiver", True), ("pm", True), ("admin", False)):
        read = await client.get(f'/api/v1/reports/{submitted.id}', headers=headers(setup["users"][key]))
        assert read.status_code == 200
        data = read.json()["data"]
        assert data["can_review"] is expected_review
        if key != "author":
            assert "task_snapshot" not in data["payload_json"] and "evidence_snapshot" not in data["payload_json"]
            assert "user_ai_notes" not in data["payload_json"]


@pytest.mark.asyncio
async def test_report_receiver_review_persists_notifies_and_member_reads(client, db_session, reports_setup):
    setup = reports_setup
    report = setup["reports"]["submitted"]
    body = {"decision": "returned", "comment": "请补充验收材料"}
    response = await client.post(f'/api/v1/reports/{report.id}/review', json=body, headers=headers(setup["users"]["receiver"]))
    assert response.status_code == 200, response.text
    review = response.json()["data"]["review"]
    assert review["decision"] == "returned" and review["comment"] == body["comment"]
    assert review["reviewer_user_id"] == setup["users"]["receiver"].id and review["reviewed_at"]
    for url in (f'/api/v1/reports/{report.id}', '/api/v1/reports/my', f'/api/v1/projects/{setup["project"].id}/agent-reports'):
        read = await client.get(url, headers=headers(setup["users"]["author"]))
        data = read.json()["data"]
        row = next(row for row in data["items"] if row["id"] == report.id) if "items" in data else data
        assert row["review"] == review and row["payload_json"]["review"] == review
        assert row["status"] == "submitted"
    repeated = await client.post(f'/api/v1/reports/{report.id}/review', json=body, headers=headers(setup["users"]["receiver"]))
    assert repeated.status_code == 200
    jobs = (await db_session.execute(select(NotifyJob).where(NotifyJob.template_key == "agent.report.reviewed"))).scalars().all()
    assert len(jobs) == 1 and jobs[0].user_id == setup["users"]["author"].id
    assert jobs[0].payload_json["report_id"] == report.id and jobs[0].payload_json["comment"] == body["comment"]
    from app.services.notify.channels import render_template
    assert "退回" in render_template(jobs[0].template_key, jobs[0].payload_json)
    approved = await client.post(f'/api/v1/reports/{report.id}/review', json={"decision": "approved", "comment": "已核实"}, headers=headers(setup["users"]["pm"]))
    assert approved.status_code == 200 and approved.json()["data"]["review"]["decision"] == "approved"
    resubmitted = await client.post(f'/api/v1/reports/{report.id}/submit', json={"summary": "尝试修改已提交汇报"}, headers=headers(setup["users"]["author"]))
    assert resubmitted.status_code == 200
    assert resubmitted.json()["data"]["review"]["decision"] == "approved"


@pytest.mark.asyncio
async def test_report_review_denies_peers_self_superadmin_outsiders_and_draft(client, reports_setup):
    setup = reports_setup
    for key in ("author", "peer", "admin", "outsider"):
        response = await client.post(f'/api/v1/reports/{setup["reports"]["submitted"].id}/review', json={"decision": "approved", "comment": "越权"}, headers=headers(setup["users"][key]))
        assert response.status_code == 403, (key, response.text)
    draft = await client.post(f'/api/v1/reports/{setup["reports"]["draft"].id}/review', json={"decision": "approved", "comment": "草稿"}, headers=headers(setup["users"]["pm"]))
    assert draft.status_code == 409


@pytest.mark.asyncio
@pytest.mark.parametrize("blocked", ["left", "inactive", "archived"])
async def test_report_review_respects_active_member_and_archive_guard(client, db_session, reports_setup, blocked):
    setup = reports_setup
    if blocked == "left": setup["members"]["receiver"].left_at = datetime.now(timezone.utc)
    elif blocked == "inactive": setup["memberships"]["receiver"].employment_status = "inactive"
    else: setup["project"].status = "archived"
    await db_session.commit()
    response = await client.post(f'/api/v1/reports/{setup["reports"]["submitted"].id}/review', json={"decision": "approved", "comment": "核验"}, headers=headers(setup["users"]["receiver"]))
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_report_submit_filters_client_forged_review_and_preserves_snapshots(client, reports_setup):
    setup = reports_setup
    response = await client.post(f'/api/v1/projects/{setup["project"].id}/agent-reports', headers=headers(setup["users"]["author"]), json={"binding_id": setup["binding"].id, "summary": "正式汇报", "payload": {"review": {"decision": "approved"}, "review_history": [{"decision": "approved"}], "task_snapshot": [{"id": 99}]}})
    assert response.status_code == 200, response.text
    detail = await client.get(f'/api/v1/reports/{response.json()["data"]["id"]}', headers=headers(setup["users"]["author"]))
    payload = detail.json()["data"]["payload_json"]
    assert "review" not in payload and "review_history" not in payload
    assert payload["task_snapshot"] == [{"id": 99}]


@pytest.mark.asyncio
async def test_personal_draft_list_hides_reports_after_company_membership_revoked(client, db_session, reports_setup):
    setup = reports_setup
    setup["memberships"]["author"].status = "inactive"
    await db_session.commit()
    response = await client.get('/api/v1/reports/my', headers=headers(setup["users"]["author"]))
    assert response.status_code == 200
    assert response.json()["data"]["items"] == []


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [{"decision": "approved", "comment": " "}, {"decision": "wrong", "comment": "意见"}, {"decision": "returned", "comment": "意见" * 2001}])
async def test_report_review_validates_decision_and_comment(client, reports_setup, body):
    setup = reports_setup
    response = await client.post(f'/api/v1/reports/{setup["reports"]["submitted"].id}/review', json=body, headers=headers(setup["users"]["receiver"]))
    assert response.status_code == 422
