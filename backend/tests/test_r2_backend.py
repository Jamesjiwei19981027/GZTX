"""R2 后端回归：真实路由、租户隔离与业务副作用。"""
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.security import create_access_token
from app.models.company import Company, CompanyMembership
from app.models.project import Project, ProjectMember
from app.models.report import AgentReport, AgentReportSource
from app.models.user import User
from app.models.tree import NodeType, TreeNode
from app.models.category import Category
from app.models.task import Task
from app.models.notify import CollabInboxMessage, NotifyJob
from app.models.agent import AgentMessage
from app.services.hierarchical_reporting import bind_project_agents


def headers(user):
    return {"Authorization": f"Bearer {create_access_token(data={'sub': user.id})}"}


@pytest_asyncio.fixture
async def team(db_session):
    company = Company(name="R2", slug="r2", status="active", entitlement_json={"features": {"agents": True, "project_tree": True}})
    users = [User(username=name, password_hash="x", email_verified_at=datetime.now(timezone.utc))
             for name in ("pm", "alice", "bob", "leader", "admin")]
    db_session.add_all([company, *users])
    await db_session.flush()
    pm, alice, bob, leader, admin = users
    db_session.add_all([CompanyMembership(company_id=company.id, user_id=u.id, is_super_admin=u == admin)
                        for u in users])
    project = Project(company_id=company.id, name="项目", status="active", pm_user_id=pm.id, created_by=pm.id)
    db_session.add(project)
    await db_session.flush()
    db_session.add_all([ProjectMember(project_id=project.id, user_id=u.id, role="pm" if u == pm else "member")
                        for u in users if u != admin])
    await db_session.flush()
    bindings = await bind_project_agents(db_session, project_id=project.id, company_id=company.id, actor_user_id=pm.id)
    await db_session.commit()
    return dict(company=company, project=project, pm=pm, alice=alice, bob=bob, leader=leader, admin=admin,
                bindings={b.user_id: b for b in bindings})


@pytest.mark.asyncio
async def test_report_privacy_drafts_and_submitted(client, db_session, team):
    p, bob = team["project"], team["bob"]
    drafts = []
    for status in ("draft", "submitted", "aggregated"):
        report = AgentReport(company_id=p.company_id, project_id=p.id, binding_id=team["bindings"][bob.id].id,
                             author_user_id=bob.id, parent_user_id=team["leader"].id,
                             status=status, summary_text=f"私密-{status}")
        db_session.add(report)
        await db_session.flush()
        db_session.add(AgentReportSource(report_id=report.id, source_type="user_note", excerpt="秘密来源"))
        drafts.append(report)
    await db_session.commit()
    for role, expected in (("alice", []), ("bob", [r.id for r in drafts]),
                           ("leader", [r.id for r in drafts[1:]]), ("pm", [r.id for r in drafts[1:]]),
                           ("admin", [r.id for r in drafts[1:]])):
        response = await client.get(f"/api/v1/projects/{p.id}/agent-reports", headers=headers(team[role]))
        assert response.status_code == 200
        assert sorted(r["id"] for r in response.json()["data"]["items"]) == expected
        if role != "bob":
            assert "秘密来源" not in response.text
        for report in drafts:
            detail = await client.get(f"/api/v1/reports/{report.id}", headers=headers(team[role]))
            assert detail.status_code == (200 if report.id in expected else 403)
            if role != "bob":
                assert "秘密来源" not in detail.text


@pytest.mark.asyncio
async def test_suggest_rejects_inaccessible_and_cross_project_nodes(client, db_session, team, monkeypatch):
    from app.api.v1 import record_progress
    calls = []
    async def model(db, company_id):
        calls.append(company_id)
        return None
    monkeypatch.setattr(record_progress, "llm_from_company", model)
    p = team["project"]
    other = Project(company_id=p.company_id, name="另一个项目", status="active", created_by=team["pm"].id)
    db_session.add(other)
    await db_session.flush()
    kind = NodeType(company_id=p.company_id, key="person", name="人", behavior_template="person")
    db_session.add(kind)
    await db_session.flush()
    node = TreeNode(company_id=p.company_id, project_id=other.id, node_type_id=kind.id, title="另一个项目的节点")
    db_session.add(node)
    await db_session.commit()
    for payload in ({"project_id": other.id}, {"project_id": p.id, "node_id": node.id}, {"node_id": node.id}, {"project_id": 99999}):
        res = await client.post("/api/v1/record-progress/suggest", json={"text": "私密内容", **payload}, headers=headers(team["alice"]))
        assert res.status_code == 403
    assert calls == []
    res = await client.post("/api/v1/record-progress/suggest", json={"text": "进度", "project_id": p.id}, headers=headers(team["alice"]))
    assert res.status_code == 200
    assert calls == [p.company_id]


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path,key", [("PATCH", "/batch/complete", "completed_count"), ("PATCH", "/batch/reschedule", "updated_count"), ("DELETE", "/batch", "deleted_count")])
async def test_batch_routes_reach_handlers(client, db_session, test_user, auth_headers, method, path, key):
    cat = Category(user_id=test_user.id, name="任务")
    db_session.add(cat)
    await db_session.flush()
    task = Task(user_id=test_user.id, category_id=cat.id, title="批量任务", linked_readonly=False)
    db_session.add(task)
    await db_session.commit()
    payload = {"task_ids": [task.id]}
    if path.endswith("reschedule"):
        payload["due_date"] = "2027-01-02"
    res = await client.request(method, f"/api/v1/tasks{path}", json=payload, headers=auth_headers)
    assert res.status_code == 200, res.text
    assert res.json()["data"][key] == 1
    await db_session.refresh(task)
    if key == "completed_count":
        assert task.status == Task.STATUS_DONE
    elif key == "updated_count":
        assert task.due_date.date().isoformat() == "2027-01-02"
    else:
        assert task.is_deleted


@pytest.mark.asyncio
@pytest.mark.parametrize("period", ["week", "month"])
async def test_task_stats_sqlite_utc_overdue(client, db_session, test_user, auth_headers, monkeypatch, period):
    from datetime import timedelta
    from app.api.v1 import tasks
    from app.services.task_statistics import statistics_window
    now = datetime(2026, 11, 9, 2, 0)
    monkeypatch.setattr(tasks, "statistics_window", lambda p, offset: statistics_window(p, offset, now=now))
    cat = Category(user_id=test_user.id, name="统计")
    db_session.add(cat)
    await db_session.flush()
    db_session.add_all([
        Task(user_id=test_user.id, category_id=cat.id, title="过期", created_at=now-timedelta(hours=1), due_date=now.replace(tzinfo=timezone.utc)-timedelta(minutes=1), status=0),
        Task(user_id=test_user.id, category_id=cat.id, title="已完成", created_at=now-timedelta(hours=1), due_date=now-timedelta(days=1), status=2),
        Task(user_id=test_user.id, category_id=cat.id, title="未来", created_at=now-timedelta(hours=1), due_date=now+timedelta(hours=1), status=0),
    ])
    await db_session.commit()
    res = await client.get(f"/api/v1/tasks/stats?period={period}&timezone_offset=480", headers=auth_headers)
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert (data["total"], data["overdue"], data["completed"]) == (3, 1, 1)


@pytest.mark.asyncio
async def test_notification_reply_delivered_to_original_sender(client, db_session, team):
    m = CollabInboxMessage(company_id=team["company"].id, user_id=team["alice"].id,
                           sender_user_id=team["bob"].id, template_key="manual", body_text="请确认",
                           payload_json={"project_id": team["project"].id}, requires_reply=True)
    db_session.add(m)
    await db_session.commit()
    res = await client.post(f"/api/v1/notifications/collab/{m.id}/reply", json={"text": "已经确认"}, headers=headers(team["alice"]))
    assert res.status_code == 200
    inbox = await client.get("/api/v1/notifications/collab", headers=headers(team["bob"]))
    rows = inbox.json()["data"]["items"]
    assert len(rows) == 1
    assert rows[0]["body_text"] == "已经确认"
    assert rows[0]["sender"]["user_id"] == team["alice"].id
    assert rows[0]["payload"]["reply_to_message_id"] == m.id


@pytest.mark.asyncio
async def test_report_submit_is_idempotent_with_generated_sources(client, db_session, team):
    from app.services.hierarchical_reporting import create_member_report_draft
    alice = team["alice"]
    report = await create_member_report_draft(db_session, binding_id=team["bindings"][alice.id].id, author_user_id=alice.id)
    report.summary_text = "已完成"
    source = {"source_type": "user_note", "source_id": 123, "excerpt": "来源", "metadata": {"project_id": team["project"].id}}
    db_session.add(AgentReportSource(report_id=report.id, source_type=source["source_type"], source_id=123, excerpt="来源", metadata_json=source["metadata"]))
    await db_session.commit()
    for _ in range(2):
        res = await client.post(f"/api/v1/reports/{report.id}/submit", json={"summary": "已完成", "sources": [source, source]}, headers=headers(alice))
        assert res.status_code == 200
        assert len(res.json()["data"]["sources"]) == 1
    jobs = (await db_session.execute(select(NotifyJob).where(NotifyJob.template_key == "agent.report.submitted"))).scalars().all()
    messages = (await db_session.execute(select(AgentMessage))).scalars().all()
    assert len(jobs) == 1
    assert len(messages) == 1


@pytest.mark.asyncio
async def test_project_aggregate_reuses_all_submitted_reports_and_latest(client, db_session, team):
    p, alice = team["project"], team["alice"]
    report = AgentReport(company_id=p.company_id, project_id=p.id, binding_id=team["bindings"][alice.id].id,
                         author_user_id=alice.id, status="submitted", summary_text="成员完成接口")
    draft = AgentReport(company_id=p.company_id, project_id=p.id, binding_id=team["bindings"][alice.id].id,
                        author_user_id=alice.id, status="draft", summary_text="秘密草稿")
    db_session.add_all([report, draft])
    await db_session.commit()
    for _ in range(2):
        res = await client.post(f"/api/v1/projects/{p.id}/agent-reports/aggregate", headers=headers(team["pm"]))
        assert res.status_code == 200
        data = res.json()["data"]
        assert data["report_ids"] == [report.id]
        assert "成员完成接口" in data["summary_text"]
        assert "秘密草稿" not in data["summary_text"]
    latest = await client.get(f"/api/v1/projects/{p.id}/agent-reports/latest", headers=headers(team["pm"]))
    assert latest.status_code == 200
    assert latest.json()["data"]["id"] == data["id"]
    assert (await client.get(f"/api/v1/projects/{p.id}/agent-reports/latest", headers=headers(alice))).status_code == 403


@pytest.mark.asyncio
async def test_notify_worker_uses_job_company_smtp(db_session, team, monkeypatch):
    from app.services.smtp_settings import save_company_smtp
    from app.workers.notify_worker import process_one_job
    from app.core.config import settings
    monkeypatch.setattr(settings, "DEBUG", False)
    calls = []
    monkeypatch.setattr("app.utils.email._send_smtp", lambda **kw: calls.append(kw) or True)
    await save_company_smtp(db_session, team["company"].id, smtp_host="company.smtp", smtp_user="sender", smtp_password="secret")
    team["alice"].email = "alice@example.com"
    job = NotifyJob(company_id=team["company"].id, user_id=team["alice"].id, channel="email", template_key="evidence.adopted", payload_json={"node_title": "交付"})
    db_session.add(job)
    await db_session.flush()
    result = await process_one_job(db_session, job.id)
    assert result.status == "sent"
    assert len(calls) == 1
    assert calls[0]["smtp_host"] == "company.smtp"


@pytest.mark.asyncio
async def test_smtp_explicit_company_falls_back_to_default(db_session, team, monkeypatch):
    from app.services.smtp_settings import save_company_smtp, resolve_smtp
    from app.core.config import settings
    default = Company(name="默认公司", slug="default-smtp", status="active")
    db_session.add(default)
    await db_session.flush()
    monkeypatch.setattr(settings, "DEFAULT_COMPANY_SLUG", default.slug)
    await save_company_smtp(db_session, default.id, smtp_host="default.smtp", smtp_user="sender", smtp_password="secret")
    resolved = await resolve_smtp(db_session, company_id=team["company"].id)
    assert resolved.host == "default.smtp"


@pytest.mark.asyncio
@pytest.mark.parametrize("source", ["user", "company", "default"])
async def test_daily_digest_uses_resolved_smtp(sync_db_session, monkeypatch, source):
    import json
    from datetime import timedelta
    from app.main import send_daily_digest
    from app.models.integration import IntegrationAccount
    from app.services.secret_box import encrypt_str
    from app.core.config import settings
    db = sync_db_session
    company = Company(name="摘要公司", slug="digest", status="active")
    user = User(username="digest", password_hash="x", email="digest@example.com")
    db.add_all([company, user])
    db.flush()
    db.add(CompanyMembership(company_id=company.id, user_id=user.id))
    cat = Category(user_id=user.id, name="摘要任务")
    db.add(cat)
    db.flush()
    db.add(Task(user_id=user.id, category_id=cat.id, title="已逾期", due_date=datetime.utcnow()-timedelta(days=2)))
    cfg = {"smtp_host": f"{source}.smtp", "smtp_user": "sender", "smtp_password": "secret"}
    if source == "user":
        user.notify_pref = {"channels": {"email": cfg}}
    else:
        if source == "default":
            company.slug = "digest-default"
        db.add(IntegrationAccount(company_id=company.id, provider="smtp", credentials_encrypted=encrypt_str(json.dumps(cfg))))
    monkeypatch.setattr(settings, "DEFAULT_COMPANY_SLUG", company.slug if source == "default" else "no-default")
    db.commit()
    monkeypatch.setattr("app.db.session.SyncSessionLocal", lambda: db)
    calls = []
    monkeypatch.setattr("app.utils.email._send_smtp", lambda **kw: calls.append(kw) or True)
    await send_daily_digest()
    assert len(calls) == 1
    assert calls[0]["smtp_host"] == f"{source}.smtp"


@pytest.mark.asyncio
async def test_welcome_uses_system_company_smtp(db_session, team, monkeypatch):
    from app.services.smtp_settings import save_company_smtp
    from app.services.notify.channels import send_welcome_email
    user = team["alice"]
    user.email = "alice@example.com"
    user.notify_pref = {"channels": {"email": {"smtp_host": "personal.smtp", "smtp_user": "p", "smtp_password": "s"}}}
    await save_company_smtp(db_session, team["company"].id, smtp_host="system.smtp", smtp_user="s", smtp_password="secret")
    calls = []
    monkeypatch.setattr("app.utils.email._send_smtp", lambda **kw: calls.append(kw) or True)
    assert await send_welcome_email(user, db=db_session, company_id=team["company"].id, company_name="公司")
    assert calls[0]["smtp_host"] == "system.smtp"


@pytest.mark.asyncio
async def test_legacy_test_email_uses_company_smtp(client, db_session, team, monkeypatch):
    from app.services.smtp_settings import save_company_smtp
    user = team["alice"]
    user.email = "alice@example.com"
    await save_company_smtp(db_session, team["company"].id, smtp_host="company.smtp", smtp_user="s", smtp_password="secret")
    await db_session.commit()
    calls = []
    monkeypatch.setattr("app.utils.email._send_smtp", lambda **kw: calls.append(kw) or True)
    res = await client.post("/api/v1/notifications/send-test-email", headers=headers(user))
    assert res.status_code == 200, res.text
    assert calls[0]["smtp_host"] == "company.smtp"


def test_confirmation_email_uses_company_smtp(sync_db_session, monkeypatch):
    import json
    from app.models.integration import IntegrationAccount
    from app.services.secret_box import encrypt_str
    from app.services.task_email_service import TaskEmailService
    db = sync_db_session
    company = Company(name="回执公司", slug="confirmation", status="active")
    db.add(company)
    db.flush()
    db.add(IntegrationAccount(company_id=company.id, provider="smtp", credentials_encrypted=encrypt_str(json.dumps({"smtp_host": "reply.smtp", "smtp_user": "s", "smtp_password": "secret"}))))
    db.flush()
    calls = []
    monkeypatch.setattr("app.utils.email._send_smtp", lambda **kw: calls.append(kw) or True)
    TaskEmailService()._send_confirmation_email("a@example.com", 1, "任务", "done", {}, {}, db=db, company_id=company.id)
    assert calls[0]["smtp_host"] == "reply.smtp"


@pytest.mark.asyncio
@pytest.mark.parametrize("scope", ["channel", "conversation"])
@pytest.mark.parametrize("model_result", ["success", "error", "exception"])
async def test_message_ai_summary_persists_and_falls_back(client, db_session, team, monkeypatch, scope, model_result):
    from app.models.shell import TeamChannel, TeamChannelMessage, DirectConversation, DirectConversationMember, DirectMessage
    from app.services import llm_settings
    p, user = team["project"], team["alice"]
    if scope == "channel":
        parent = TeamChannel(company_id=p.company_id, project_id=p.id, name="频道")
        db_session.add(parent)
        await db_session.flush()
        db_session.add(TeamChannelMessage(channel_id=parent.id, user_id=user.id, body="决定周五发布，风险：缺少材料"))
        path = f"/api/v1/channels/{parent.id}/summaries"
    else:
        parent = DirectConversation(company_id=p.company_id, project_id=p.id, created_by=user.id, kind="direct")
        db_session.add(parent)
        await db_session.flush()
        db_session.add(DirectConversationMember(conversation_id=parent.id, user_id=user.id))
        db_session.add(DirectMessage(conversation_id=parent.id, user_id=user.id, body="决定周五发布，风险：缺少材料"))
        path = f"/api/v1/conversations/{parent.id}/summaries"
    await db_session.commit()
    async def resolve(*args, **kw):
        return llm_settings.ResolvedLlm(provider="openai_compatible", base_url="http://model.test/v1", model="model", api_key="test", source="company")
    async def completion(llm, **kw):
        if model_result == "exception":
            raise RuntimeError("model down")
        return {"ok": model_result == "success", "content": "周五发布，需补材料", "provider": "openai_compatible"}
    monkeypatch.setattr(llm_settings, "resolve_llm", resolve)
    monkeypatch.setattr(llm_settings, "chat_completion", completion)
    response = await client.post(path, headers=headers(user))
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["source_count"] == 1
    assert "周五" in data["summary_text"]
    assert data["provider"] == ("openai_compatible" if model_result == "success" else "deterministic")
    saved = await client.get(path, headers=headers(user))
    assert saved.json()["data"]["items"][0]["id"] == data["id"]


@pytest.mark.asyncio
@pytest.mark.parametrize("state", ["readonly", "expired", "archived"])
@pytest.mark.parametrize("action", ["invite", "accept_invite", "review", "generate", "submit", "legacy_generate", "legacy_submit", "aggregate", "channel_message", "direct_message", "notification_reply"])
async def test_collaboration_write_gate_blocks_all_entry_points(client, db_session, team, state, action):
    from datetime import timedelta
    from app.models.project import ProjectInvitation
    from app.models.evidence import EvidencePackage
    from app.models.shell import TeamChannel, DirectConversation, DirectConversationMember
    p, alice = team["project"], team["alice"]
    kind = NodeType(company_id=p.company_id, key="person", name="人", behavior_template="person")
    db_session.add(kind)
    await db_session.flush()
    node = TreeNode(company_id=p.company_id, project_id=p.id, node_type_id=kind.id, title="负责人")
    db_session.add(node)
    await db_session.flush()
    package = EvidencePackage(company_id=p.company_id, project_id=p.id, node_id=node.id, submitter_user_id=alice.id, status="pending_review", summary_text="材料")
    draft = AgentReport(company_id=p.company_id, project_id=p.id, binding_id=team["bindings"][alice.id].id, author_user_id=alice.id, status="draft", summary_text="汇报")
    channel = TeamChannel(company_id=p.company_id, project_id=p.id, name="频道")
    conversation = DirectConversation(company_id=p.company_id, project_id=p.id, created_by=alice.id)
    invitation = ProjectInvitation(project_id=p.id, token="gate-token", invitee_user_id=alice.id, status="pending", expires_at=datetime.utcnow()+timedelta(days=1))
    message = CollabInboxMessage(company_id=p.company_id, user_id=alice.id, sender_user_id=team["pm"].id, template_key="manual", payload_json={"project_id": p.id})
    db_session.add_all([package, draft, channel, conversation, invitation, message])
    await db_session.flush()
    db_session.add(DirectConversationMember(conversation_id=conversation.id, user_id=alice.id))
    if state == "readonly":
        team["company"].status = "readonly"
    elif state == "expired":
        team["company"].entitlement_json = {"features": {"agents": True, "project_tree": True}, "valid_to": "2020-01-01T00:00:00Z"}
    else:
        p.status = "archived"
    await db_session.commit()
    paths = {
        "invite": (f"/projects/{p.id}/invitations", {"email": "invite@example.com"}, "pm"),
        "accept_invite": ("/projects/invitations/gate-token/accept", {}, "alice"),
        "review": (f"/evidence/{package.id}/review", {"decision": "rejected"}, "pm"),
        "generate": (f"/projects/{p.id}/agent-reports/generate", {}, "alice"),
        "submit": (f"/projects/{p.id}/agent-reports", {"binding_id": draft.binding_id, "summary": "汇报"}, "alice"),
        "legacy_generate": ("/reports/generate", {"project_id": p.id}, "alice"),
        "legacy_submit": (f"/reports/{draft.id}/submit", {"summary": "汇报"}, "alice"),
        "aggregate": (f"/projects/{p.id}/agent-reports/aggregate", {}, "pm"),
        "channel_message": (f"/channels/{channel.id}/messages", {"body": "消息"}, "alice"),
        "direct_message": (f"/conversations/{conversation.id}/messages", {"body": "私聊"}, "alice"),
        "notification_reply": (f"/notifications/collab/{message.id}/reply", {"text": "回复"}, "alice"),
    }
    path, payload, role = paths[action]
    response = await client.post(f"/api/v1{path}", json=payload, headers=headers(team[role]))
    assert response.status_code == 403, response.text
    await db_session.refresh(draft)
    await db_session.refresh(package)
    await db_session.refresh(invitation)
    assert draft.status == "draft"
    assert package.status == "pending_review"
    assert invitation.status == "pending"


@pytest.mark.asyncio
async def test_left_members_excluded_from_team_candidates_and_count(client, db_session, team):
    p = team["project"]
    membership = (await db_session.execute(select(ProjectMember).where(ProjectMember.project_id == p.id, ProjectMember.user_id == team["bob"].id))).scalar_one()
    membership.left_at = datetime.utcnow()
    await db_session.commit()
    # 项目成员接口同时供 Web/APP 团队和负责人候选使用。
    res = await client.get(f"/api/v1/projects/{p.id}/members", headers=headers(team["pm"]))
    assert res.status_code == 200
    ids = [item["user_id"] for item in res.json()["data"]["items"]]
    assert team["bob"].id not in ids
    assert team["alice"].id in ids
    detail = await client.get(f"/api/v1/projects/{p.id}", headers=headers(team["pm"]))
    assert detail.json()["data"]["member_count"] == 3


@pytest.mark.asyncio
async def test_report_submitted_at_written_on_submission_only(client, db_session, team):
    from datetime import timedelta
    from app.services.hierarchical_reporting import create_member_report_draft
    alice = team["alice"]
    draft = await create_member_report_draft(db_session, binding_id=team["bindings"][alice.id].id, author_user_id=alice.id)
    await db_session.commit()
    await db_session.refresh(draft)
    assert draft.submitted_at is None
    # 旧草稿可能已经带有生成时间；提交必须重写为真正的提交时间。
    draft.created_at = datetime.utcnow()-timedelta(days=2)
    draft.submitted_at = draft.created_at
    await db_session.commit()
    before = datetime.utcnow()
    response = await client.post(f"/api/v1/reports/{draft.id}/submit", json={"summary": "正式提交"}, headers=headers(alice))
    assert response.status_code == 200
    await db_session.refresh(draft)
    assert before <= draft.submitted_at <= datetime.utcnow()
    submitted_at = draft.submitted_at
    await client.post(f"/api/v1/reports/{draft.id}/submit", json={"summary": "重试"}, headers=headers(alice))
    await db_session.refresh(draft)
    assert draft.submitted_at == submitted_at


def test_submission_time_migration_cleans_drafts_preserves_submissions():
    import importlib.util
    from pathlib import Path
    from sqlalchemy import create_engine, text, inspect
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path = Path(__file__).parents[1]/"alembic/versions/fo3c4d5e6f7a_report_submission_time.py"
    spec = importlib.util.spec_from_file_location("r2_submission_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE agent_reports (id INTEGER PRIMARY KEY, status VARCHAR(24), submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP)"))
        conn.execute(text("INSERT INTO agent_reports (id,status,submitted_at) VALUES (1,'draft','2020-01-01'), (2,'submitted','2020-02-02')"))
        with Operations.context(MigrationContext.configure(conn)):
            migration.upgrade()
        assert conn.execute(text("SELECT submitted_at FROM agent_reports WHERE id=1")).scalar() is None
        assert conn.execute(text("SELECT submitted_at FROM agent_reports WHERE id=2")).scalar() == "2020-02-02"
        assert next(c for c in inspect(conn).get_columns("agent_reports") if c["name"] == "submitted_at")["default"] is None
    engine.dispose()


@pytest.mark.asyncio
async def test_all_notification_email_subjects_are_chinese(monkeypatch):
    import re
    from types import SimpleNamespace
    from app.services.notify import channels
    from app.core.config import settings
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.test")
    monkeypatch.setattr(settings, "SMTP_USER", "sender")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "secret")
    calls = []
    monkeypatch.setattr("app.utils.email._send_smtp", lambda **kw: calls.append(kw) or True)
    user = SimpleNamespace(email="new@example.com", username="new")
    payload = {"node_title": "节点", "reason": "说明", "summary": "摘要", "company_name": "测试公司", "username": "new", "app_url": "https://test", "project_id": 1, "report_count": 2, "text": "回复"}
    for key in [*channels.TEMPLATES, "unknown.internal.key"]:
        assert await channels.send_email_channel(user, key, payload)
        subject = calls[-1]["subject"]
        assert key not in subject
        assert re.search(r"[\u4e00-\u9fff]", subject)
        if key == "auth.welcome":
            assert subject == "欢迎加入 测试公司"


@pytest.mark.asyncio
@pytest.mark.parametrize("reason,expected", [(None, "负责人未采纳该材料"), ("  ", "负责人未采纳该材料"), ("缺少验收截图", "缺少验收截图")])
async def test_rejection_reason_does_not_reuse_ai_adoption(client, db_session, team, reason, expected):
    from app.models.evidence import EvidencePackage
    from app.models.progress import AdoptionRecord
    p = team["project"]
    kind = NodeType(company_id=p.company_id, key="person", name="人", behavior_template="person")
    db_session.add(kind)
    await db_session.flush()
    node = TreeNode(company_id=p.company_id, project_id=p.id, node_type_id=kind.id, title="成员")
    db_session.add(node)
    await db_session.flush()
    package = EvidencePackage(company_id=p.company_id, project_id=p.id, node_id=node.id, submitter_user_id=team["alice"].id,
                              status="pending_review", summary_text="交付材料", judge_result_json={"decision": "adopted", "reason": "材料有效，写入正式进度"})
    db_session.add(package)
    await db_session.commit()
    res = await client.post(f"/api/v1/evidence/{package.id}/review", json={"decision": "rejected", "reason": reason}, headers=headers(team["pm"]))
    assert res.status_code == 200, res.text
    jobs = (await db_session.execute(select(NotifyJob).where(NotifyJob.template_key == "evidence.rejected"))).scalars().all()
    assert jobs
    assert all(j.payload_json["reason"] == expected for j in jobs)
    record = (await db_session.execute(select(AdoptionRecord).where(AdoptionRecord.evidence_package_id == package.id))).scalar_one()
    assert record.reason == expected


@pytest.mark.asyncio
async def test_rejected_material_dto_returns_persisted_human_reason(client, db_session, team):
    from app.models.evidence import EvidencePackage
    from app.models.progress import AdoptionRecord
    p = team["project"]
    kind = NodeType(company_id=p.company_id, key="person", name="人", behavior_template="person")
    db_session.add(kind)
    await db_session.flush()
    node = TreeNode(company_id=p.company_id, project_id=p.id, node_type_id=kind.id, title="成员")
    db_session.add(node)
    await db_session.flush()
    package = EvidencePackage(company_id=p.company_id, project_id=p.id, node_id=node.id, submitter_user_id=team["alice"].id,
                              status="rejected", judge_result_json={"decision": "adopted", "reason": "AI 建议采纳"})
    db_session.add(package)
    await db_session.flush()
    db_session.add(AdoptionRecord(company_id=p.company_id, project_id=p.id, node_id=node.id, evidence_package_id=package.id,
                                  decision="rejected", reason="需要补充验收记录"))
    await db_session.commit()
    detail = await client.get(f"/api/v1/evidence/{package.id}", headers=headers(team["alice"]))
    assert detail.json()["data"]["reject_reason"] == "需要补充验收记录"
    listed = await client.get(f"/api/v1/nodes/{node.id}/evidence", headers=headers(team["alice"]))
    assert listed.json()["data"]["items"][0]["reject_reason"] == "需要补充验收记录"


@pytest.mark.asyncio
async def test_project_report_contains_submitted_summaries_tasks_and_adopted_materials(client, db_session, team):
    from app.models.evidence import EvidencePackage
    from app.models.report import ReportRun
    p, alice = team["project"], team["alice"]
    cat = Category(user_id=alice.id, name="项目任务")
    db_session.add(cat)
    await db_session.flush()
    db_session.add_all([
        AgentReport(company_id=p.company_id, project_id=p.id, binding_id=team["bindings"][alice.id].id, author_user_id=alice.id, status="submitted", summary_text="完成联调并通过验收"),
        AgentReport(company_id=p.company_id, project_id=p.id, binding_id=team["bindings"][alice.id].id, author_user_id=alice.id, status="draft", summary_text="私密草稿不能进入项目报告"),
        Task(user_id=alice.id, category_id=cat.id, company_id=p.company_id, project_id=p.id, title="完成任务", status=2),
        Task(user_id=alice.id, category_id=cat.id, company_id=p.company_id, project_id=p.id, title="进行中任务", status=1),
        Task(user_id=alice.id, category_id=cat.id, company_id=p.company_id, project_id=None, title="私密个人任务", status=2),
        EvidencePackage(company_id=p.company_id, project_id=p.id, node_id=1, submitter_user_id=alice.id, status="adopted", summary_text="已采纳验收材料"),
        EvidencePackage(company_id=p.company_id, project_id=p.id, node_id=1, submitter_user_id=alice.id, status="rejected", summary_text="未采纳材料不能进入清单"),
    ])
    await db_session.commit()
    res = await client.post(f"/api/v1/projects/{p.id}/reports/run", json={}, headers=headers(team["pm"]))
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    for fact in ("完成联调并通过验收", "alice", "已完成 1", "进行中 1", "已采纳验收材料"):
        assert fact in data["summary_text"]
    for secret in ("私密草稿", "私密个人任务", "未采纳材料不能"):
        assert secret not in data["summary_text"]
    report = await db_session.get(ReportRun, data["run_id"])
    assert report.payload_json["task_stats"] == {"total": 2, "completed": 1, "in_progress": 1, "pending": 0}
    assert len(report.payload_json["member_reports"]) == 1
    assert len(report.payload_json["adopted_materials"]) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("model_result", ["success", "http_error", "bad_json", "exception"])
async def test_evidence_judge_calls_company_model_with_attachment_and_falls_back(db_session, team, monkeypatch, model_result):
    import json
    import httpx
    from app.services import llm_settings
    from app.services.evidence_service import run_evidence_judge
    from app.models.evidence import EvidencePackage, EvidenceFile, AsyncJob
    from app.models.knowledge import EvidenceFileText
    from app.core.config import settings
    monkeypatch.setattr(settings, "JUDGE_BACKEND", "rule")
    p, alice = team["project"], team["alice"]
    await llm_settings.save_company_llm(db_session, p.company_id, provider="openai_compatible", base_url="https://model.test/v1", model="company-judge", api_key="test-key", use_for_judge=True)
    kind = NodeType(company_id=p.company_id, key="person", name="人", behavior_template="person")
    db_session.add(kind)
    await db_session.flush()
    node = TreeNode(company_id=p.company_id, project_id=p.id, node_type_id=kind.id, title="事项", progress_json={"template": "work_item", "status": "not_started", "percent": 0})
    db_session.add(node)
    await db_session.flush()
    package = EvidencePackage(company_id=p.company_id, project_id=p.id, node_id=node.id, submitter_user_id=alice.id, status="submitted", summary_text="交付说明", structured_json={"percent": 20})
    db_session.add(package)
    await db_session.flush()
    ef = EvidenceFile(package_id=package.id, company_id=p.company_id, project_id=p.id, storage_key="test/file", original_name="验收.txt")
    db_session.add(ef)
    await db_session.flush()
    db_session.add(EvidenceFileText(evidence_file_id=ef.id, company_id=p.company_id, project_id=p.id, status="succeeded", text_md="附件抽取正文：验收完成率为 80%。"))
    job = AsyncJob(company_id=p.company_id, job_type="evidence.judge", payload_json={"package_id": package.id})
    db_session.add(job)
    await db_session.flush()
    requests = []
    def handle(request):
        requests.append(json.loads(request.content))
        if model_result == "exception":
            raise httpx.ConnectError("model unavailable")
        if model_result == "http_error":
            return httpx.Response(503, json={"error": "down"})
        content = "not json" if model_result == "bad_json" else json.dumps({"decision": "adopted", "reason": "模型依据验收正文建议采纳", "confidence": 0.88, "progress_after": {"template": "work_item", "percent": 80, "status": "in_progress"}})
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})
    real_client = httpx.AsyncClient
    monkeypatch.setattr(llm_settings.httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handle), **kw))
    await run_evidence_judge(db_session, job.id)
    assert len(requests) == 1
    assert requests[0]["model"] == "company-judge"
    assert "附件抽取正文" in str(requests[0]["messages"])
    assert job.status == "succeeded"
    assert package.status == "pending_review"
    if model_result == "success":
        assert package.judge_result_json["reason"] == "模型依据验收正文建议采纳"
        assert package.judge_result_json["progress_after"]["percent"] == 80
    else:
        assert package.judge_result_json["reason"].startswith("规则判定")
        assert package.judge_result_json["progress_after"]["percent"] == 20
