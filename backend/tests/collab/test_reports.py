import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_report_policies_and_manual_run(async_client: AsyncClient, seed_ids):
    pid = seed_ids["project_id"]

    r = await async_client.get(
        f"/api/v1/projects/{pid}/report-policies",
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200
    items = r.json()["data"]["items"]
    assert len(items) >= 1
    assert items[0]["template_key"] == "progress_summary"

    r2 = await async_client.post(
        f"/api/v1/projects/{pid}/reports/run",
        headers=seed_ids["pm_headers"],
        json={"trigger": "manual_confirm"},
    )
    assert r2.status_code == 200
    data = r2.json()["data"]
    assert data["status"] == "completed"
    assert data["run_id"]
    assert "进度摘要" in (data["summary_text"] or "")


@pytest.mark.asyncio
async def test_report_run_forbidden_for_outsider(async_client: AsyncClient, seed_ids):
    pid = seed_ids["project_id"]
    r = await async_client.post(
        f"/api/v1/projects/{pid}/reports/run",
        headers=seed_ids["outsider_headers"],
        json={"trigger": "manual_confirm"},
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_project_agent_reports_includes_read_and_read_at(async_client: AsyncClient, db_session, seed_ids):
    from datetime import datetime, timezone
    from app.models.report import AgentReport, ProjectAgentBinding
    from app.models.agent import AgentDefinition
    pid = seed_ids["project_id"]
    cid = seed_ids["company_id"]
    uid = seed_ids["member_user_id"]

    agent = AgentDefinition(company_id=cid, owner_user_id=uid, name="测试智能体", kind="member_reporting")
    db_session.add(agent)
    await db_session.flush()

    binding = ProjectAgentBinding(company_id=cid, project_id=pid, user_id=uid, agent_definition_id=agent.id, role="member", is_active=True)
    db_session.add(binding)
    await db_session.flush()

    report_unread = AgentReport(
        company_id=cid,
        project_id=pid,
        binding_id=binding.id,
        author_user_id=uid,
        status="submitted",
        summary_text="未读汇报",
        submitted_at=datetime.now(timezone.utc),
        read_at=None,
    )
    report_read = AgentReport(
        company_id=cid,
        project_id=pid,
        binding_id=binding.id,
        author_user_id=uid,
        status="submitted",
        summary_text="已读汇报",
        submitted_at=datetime.now(timezone.utc),
        read_at=datetime.now(timezone.utc),
    )
    db_session.add_all([report_unread, report_read])
    await db_session.commit()

    r = await async_client.get(
        f"/api/v1/projects/{pid}/agent-reports",
        headers=seed_ids["pm_headers"],
    )
    assert r.status_code == 200, r.text
    items = r.json()["data"]["items"]
    assert len(items) >= 2
    unread_item = next(it for it in items if it["id"] == report_unread.id)
    assert unread_item["read"] is False
    assert unread_item["read_at"] is None

    read_item = next(it for it in items if it["id"] == report_read.id)
    assert read_item["read"] is True
    assert read_item["read_at"] is not None


@pytest.mark.asyncio
async def test_member_without_binding_can_generate_and_non_member_rejected(
    async_client: AsyncClient, db_session, seed_ids, monkeypatch
):
    from types import SimpleNamespace
    from app.models.progress import ProgressRecord
    from app.models.report import ProjectAgentBinding
    from sqlalchemy import select
    import app.services.llm_settings as llm_settings
    import app.services.hierarchical_reporting as reporting

    pid = seed_ids["project_id"]
    cid = seed_ids["company_id"]
    uid = seed_ids["member_user_id"]
    nid = seed_ids["node_id"]

    # 确保当前没有该 member 的 binding
    bindings = (
        await db_session.execute(
            select(ProjectAgentBinding).where(
                ProjectAgentBinding.project_id == pid,
                ProjectAgentBinding.user_id == uid,
            )
        )
    ).scalars().all()
    for b in bindings:
        await db_session.delete(b)
    await db_session.commit()

    # 非成员尝试生成汇报被拒 (403)
    res_outsider = await async_client.post(
        "/api/v1/reports/generate",
        headers=seed_ids["outsider_headers"],
        json={"project_id": pid},
    )
    assert res_outsider.status_code == 403

    # 非成员尝试调用 bindings 接口也被拒 (403)
    res_outsider_bind = await async_client.post(
        f"/api/v1/projects/{pid}/report-agents/bindings",
        headers=seed_ids["outsider_headers"],
        json={},
    )
    assert res_outsider_bind.status_code == 403

    # 普通成员直接调用 bindings，只为本人创建绑定
    res_member_bind = await async_client.post(
        f"/api/v1/projects/{pid}/report-agents/bindings",
        headers=seed_ids["member_headers"],
        json={},
    )
    assert res_member_bind.status_code == 200, res_member_bind.text
    items = res_member_bind.json()["data"]["items"]
    assert len(items) == 1
    assert items[0]["user_id"] == uid
    assert items[0]["role"] == "member"

    # 再删掉绑定，测试 /reports/generate 在无绑定时也能直接自动创建绑定并提交
    for b in (
        await db_session.execute(
            select(ProjectAgentBinding).where(
                ProjectAgentBinding.project_id == pid,
                ProjectAgentBinding.user_id == uid,
            )
        )
    ).scalars().all():
        await db_session.delete(b)
    progress = ProgressRecord(
        company_id=cid,
        project_id=pid,
        node_id=nid,
        event_type="task_done",
        source="user",
        actor_user_id=uid,
        after_json={"status": "done"},
        reason="测试进度记录",
    )
    db_session.add(progress)
    await db_session.commit()

    async def fake_model(*args, **kwargs):
        return SimpleNamespace(provider="openai_compatible", use_for_agent=True, is_usable=lambda: True)

    async def fake_completion(*args, **kwargs):
        return {"ok": True, "provider": "openai_compatible", "content": "成员自动绑定生成的事实汇报"}

    monkeypatch.setattr(llm_settings, "resolve_llm", fake_model)
    monkeypatch.setattr(llm_settings, "chat_completion", fake_completion)
    monkeypatch.setattr(reporting, "resolve_llm", fake_model)
    monkeypatch.setattr(reporting, "chat_completion", fake_completion)

    res_generate = await async_client.post(
        "/api/v1/reports/generate",
        headers=seed_ids["member_headers"],
        json={"project_id": pid},
    )
    assert res_generate.status_code == 200, res_generate.text
    draft_data = res_generate.json()["data"]
    assert draft_data["id"]
    report_id = draft_data["id"]

    res_submit = await async_client.post(
        f"/api/v1/reports/{report_id}/submit",
        headers=seed_ids["member_headers"],
        json={"summary": "完成测试提交"},
    )
    assert res_submit.status_code == 200, res_submit.text
