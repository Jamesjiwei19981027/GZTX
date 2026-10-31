"""Shared published knowledge -> cited owner-private drafts and explicit save.

Database, authentication and permissions are real; only the external LLM is stubbed.
"""
import json
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select

from app.models.audit import AuditLog
from app.models.company import Company, CompanyMembership
from app.models.personal_knowledge import PersonalKnowledgeEntry
from app.models.project import Project, ProjectMember
from app.models.wiki import ProjectWikiEntry


def url(ids, suffix=""):
    return f"/api/v1/projects/{ids['project_id']}/knowledge-space{suffix}"


async def seed_pages(db, ids):
    pages = []
    for source, title, text in [
        ("manual", "手写知识", "MANUAL_PUBLIC_BODY 验收标准是七项通过。"),
        ("llm_wiki", "发布知识", "PUBLISHED_PUBLIC_BODY 本轮交付已提交待复核。"),
        ("llm_wiki_draft", "保密草稿", "PRIVATE_DRAFT_MUST_NOT_APPEAR"),
        ("llm_wiki_review", "未发布审阅", "PRIVATE_REVIEW_MUST_NOT_APPEAR"),
    ]:
        row = ProjectWikiEntry(company_id=ids["company_id"], project_id=ids["project_id"],
            title=title, body_text=text, source=source, created_by=ids["pm_user_id"],
            meta_json={"facts": [{"package_id": 42, "quote": "原材料引用"}]})
        db.add(row); pages.append(row)
    db.add(PersonalKnowledgeEntry(company_id=ids["company_id"], project_id=ids["project_id"],
        owner_user_id=ids["pm_user_id"], title="他人私有知识", body_text="OTHER_USER_PRIVATE_MUST_NOT_APPEAR"))
    await db.commit()
    return pages


def model_stub(monkeypatch, page, *, content=None, after=None, response_ok=True):
    calls = []
    async def resolve(db, *, company_id, user):
        calls.append({"user_id": user.id, "company_id": company_id})
        return SimpleNamespace(provider="openai_compatible", source="user", use_for_agent=True,
            enabled=True, model="test", is_usable=lambda: True)
    async def completion(llm, **kwargs):
        calls.append(kwargs["messages"])
        if after:
            await after()
        return {"ok": response_ok, "content": content if content is not None else json.dumps({
            "title": "我的项目要点", "points": [{"text": "验收需七项通过", "page_id": page.id,
                "quote": "验收标准是七项通过"}]}, ensure_ascii=False)}
    monkeypatch.setattr("app.services.llm_settings.resolve_llm", resolve)
    monkeypatch.setattr("app.services.llm_settings.chat_completion", completion)
    return calls


async def grant(client, ids, *, allowed=True, target=None, headers=None):
    response = await client.put(url(ids, f"/grants/{target or ids['member_user_id']}"),
        headers=headers or ids["pm_headers"], json={"can_summarize": allowed})
    assert response.status_code == 200, response.text
    return response.json()["data"]


async def generate(client, ids, page, headers=None):
    response = await client.post(url(ids, "/summaries"), headers=headers or ids["member_headers"],
        json={"page_ids": [page.id], "instruction": "整理本项目验收标准"})
    assert response.status_code == 200, response.text
    return response.json()["data"]


@pytest.mark.asyncio
async def test_shared_catalog_grant_and_owner_private_save_lifecycle(async_client, db_session, seed_ids, monkeypatch):
    ids = seed_ids
    pages = await seed_pages(db_session, ids)
    member = await async_client.get(url(ids), headers=ids["member_headers"])
    assert member.status_code == 200, member.text
    data = member.json()["data"]
    assert data["scope"] == {"company_id": ids["company_id"], "project_id": ids["project_id"], "owner_user_id": ids["member_user_id"]}
    assert data["permissions"] == {"can_summarize": False, "can_manage_grants": False}
    assert data["members"] == []
    assert {page["id"] for page in data["pages"]} == {pages[0].id, pages[1].id}
    assert data["pages"][0]["meta"]["facts"][0]["package_id"] == 42
    denied = await async_client.post(url(ids, "/summaries"), headers=ids["member_headers"], json={"page_ids": [pages[0].id]})
    assert denied.status_code == 403
    denied = await async_client.put(url(ids, f"/grants/{ids['member_user_id']}"), headers=ids["member_headers"], json={"can_summarize": True})
    assert denied.status_code == 403
    pm = (await async_client.get(url(ids), headers=ids["pm_headers"])).json()["data"]
    assert pm["permissions"] == {"can_summarize": True, "can_manage_grants": True}
    assert any(m["user_id"] == ids["member_user_id"] and not m["can_summarize"] for m in pm["members"])
    allowed = await grant(async_client, ids)
    assert allowed["can_summarize"] is True and allowed["is_manager"] is False
    calls = model_stub(monkeypatch, pages[0])
    draft = await generate(async_client, ids, pages[0])
    assert draft["status"] == "draft" and draft["personal_entry_id"] is None
    assert draft["sources"] == [{"page_id": pages[0].id, "title": pages[0].title, "quote": "验收标准是七项通过"}]
    assert calls[0] == {"user_id": ids["member_user_id"], "company_id": ids["company_id"]}
    assert "MANUAL_PUBLIC_BODY" in str(calls) and "PUBLISHED_PUBLIC_BODY" not in str(calls)
    assert "PRIVATE_" not in str(calls) and "OTHER_USER" not in str(calls)
    assert (await db_session.execute(select(func.count()).select_from(PersonalKnowledgeEntry).where(PersonalKnowledgeEntry.owner_user_id == ids["member_user_id"]))).scalar_one() == 0
    restored = await async_client.get(url(ids, f"/summaries/{draft['id']}"), headers=ids["member_headers"])
    assert restored.json()["data"] == draft
    denied = await async_client.get(url(ids, f"/summaries/{draft['id']}"), headers=ids["pm_headers"])
    assert denied.status_code == 404
    save_payload = {"title": "我的手改标题", "body_text": "手工核对后保留七项验收。", "tags": ["验收"]}
    save_url = url(ids, f"/summaries/{draft['id']}/save")
    denied = await async_client.post(save_url, headers=ids["pm_headers"], json=save_payload)
    assert denied.status_code == 404
    saved = await async_client.post(save_url, headers=ids["member_headers"], json=save_payload)
    assert saved.status_code == 200, saved.text
    result = saved.json()["data"]
    assert result["already_saved"] is False
    entry = result["entry"]
    assert entry["title"] == save_payload["title"] and entry["body_text"] == save_payload["body_text"]
    assert entry["source_type"] == "project_summary" and entry["source_id"] == draft["id"]
    assert entry["source_ref"]["project_id"] == ids["project_id"]
    assert entry["source_ref"]["sources"] == draft["sources"]
    private_url = f"/api/v1/projects/{ids['project_id']}/personal-knowledge/entries/{entry['id']}"
    await async_client.patch(private_url, headers=ids["member_headers"], json={"body_text": "EDITED_PERSONAL_COPY"})
    saved_again = await async_client.post(save_url, headers=ids["member_headers"], json=save_payload)
    assert saved_again.json()["data"]["already_saved"] is True
    assert saved_again.json()["data"]["entry"]["body_text"] == "EDITED_PERSONAL_COPY"
    saved_draft = (await async_client.get(url(ids, f"/summaries/{draft['id']}"), headers=ids["member_headers"])).json()["data"]
    assert saved_draft["status"] == "saved" and saved_draft["personal_entry_id"] == entry["id"]
    await async_client.delete(private_url, headers=ids["member_headers"])
    tombstone = await async_client.post(save_url, headers=ids["member_headers"], json=save_payload)
    assert tombstone.status_code == 409
    audits = (await db_session.execute(select(AuditLog).where(AuditLog.action.in_(["project_knowledge.grant", "project_knowledge.save"])))).scalars().all()
    assert [a.action for a in audits] == ["project_knowledge.grant", "project_knowledge.save"]


@pytest.mark.asyncio
async def test_active_project_admin_can_manage_but_needs_summarize_grant(async_client, db_session, seed_ids, monkeypatch):
    ids = seed_ids
    pages = await seed_pages(db_session, ids)
    admin = (await db_session.execute(select(CompanyMembership).where(CompanyMembership.company_id == ids["company_id"], CompanyMembership.user_id == ids["member_user_id"]))).scalar_one()
    admin.is_super_admin = True
    await db_session.commit()
    response = await async_client.get(url(ids), headers=ids["member_headers"])
    assert response.json()["data"]["permissions"] == {"can_summarize": False, "can_manage_grants": True}
    await grant(async_client, ids, headers=ids["member_headers"])
    model_stub(monkeypatch, pages[0])
    await generate(async_client, ids, pages[0])
    denied = await async_client.put(url(ids, f"/grants/{ids['outsider_user_id']}"), headers=ids["pm_headers"], json={"can_summarize": True})
    assert denied.status_code in (403, 404)


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid", ["quote", "page", "empty", "malformed", "failed"])
async def test_untrusted_model_output_cannot_create_uncited_drafts(async_client, db_session, seed_ids, monkeypatch, invalid):
    ids = seed_ids
    pages = await seed_pages(db_session, ids)
    await grant(async_client, ids)
    output = {"title": "bad", "points": [{"text": "编造结论", "page_id": pages[0].id, "quote": "验收标准是七项通过"}]}
    if invalid == "quote": output["points"][0]["quote"] = "THIS_QUOTE_IS_NOT_IN_SOURCE"
    if invalid == "page": output["points"][0]["page_id"] = pages[2].id
    if invalid == "empty": output["points"] = []
    content = "{not json" if invalid == "malformed" else json.dumps(output)
    model_stub(monkeypatch, pages[0], content=content, response_ok=invalid != "failed")
    response = await async_client.post(url(ids, "/summaries"), headers=ids["member_headers"], json={"page_ids": [pages[0].id]})
    assert response.status_code == (502 if invalid == "failed" else 422), response.text
    from app.models.project_knowledge import ProjectKnowledgeSummary
    assert (await db_session.execute(select(func.count()).select_from(ProjectKnowledgeSummary))).scalar_one() == 0


@pytest.mark.asyncio
async def test_sources_must_be_published_selected_current_project_and_bounded(async_client, db_session, seed_ids, monkeypatch):
    ids = seed_ids
    pages = await seed_pages(db_session, ids)
    await grant(async_client, ids)
    other_company = Company(name="别的公司", slug="project-knowledge-foreign-company")
    db_session.add(other_company); await db_session.flush()
    other_project = Project(company_id=ids["company_id"], name="其他项目", created_by=ids["pm_user_id"])
    db_session.add(other_project); await db_session.flush()
    foreign_pages = []
    for company_id, project_id in [(ids["company_id"], other_project.id), (other_company.id, ids["project_id"])]:
        row = ProjectWikiEntry(company_id=company_id, project_id=project_id, title="FOREIGN_PAGE", body_text="FOREIGN_BODY", source="manual")
        db_session.add(row); foreign_pages.append(row)
    await db_session.commit()
    calls = model_stub(monkeypatch, pages[0])
    for page_ids in [[pages[2].id], [pages[3].id], [foreign_pages[0].id], [foreign_pages[1].id], [pages[0].id, 999999]]:
        response = await async_client.post(url(ids, "/summaries"), headers=ids["member_headers"], json={"page_ids": page_ids})
        assert response.status_code == 404, response.text
    for page_ids in [[], [pages[0].id] * 21]:
        response = await async_client.post(url(ids, "/summaries"), headers=ids["member_headers"], json={"page_ids": page_ids})
        assert response.status_code == 422
    pages[0].body_text = "X" * 60001
    await db_session.commit()
    response = await async_client.post(url(ids, "/summaries"), headers=ids["member_headers"], json={"page_ids": [pages[0].id]})
    assert response.status_code == 422
    assert calls == []


@pytest.mark.asyncio
async def test_missing_real_model_returns_configuration_error(async_client, db_session, seed_ids, monkeypatch):
    ids = seed_ids
    pages = await seed_pages(db_session, ids)
    await grant(async_client, ids)
    async def fake(*args, **kwargs):
        return SimpleNamespace(provider="fake", source="fake", use_for_agent=True, enabled=True, is_usable=lambda: True)
    monkeypatch.setattr("app.services.llm_settings.resolve_llm", fake)
    response = await async_client.post(url(ids, "/summaries"), headers=ids["member_headers"], json={"page_ids": [pages[0].id]})
    assert response.status_code == 409 and "模型" in str(response.json())


@pytest.mark.asyncio
@pytest.mark.parametrize("revocation", ["grant", "project", "employment", "company"])
async def test_revocations_during_model_or_before_save_are_rechecked(async_client, db_session, seed_ids, monkeypatch, revocation):
    ids = seed_ids
    pages = await seed_pages(db_session, ids)
    await grant(async_client, ids)
    model_stub(monkeypatch, pages[0])
    draft = await generate(async_client, ids, pages[0])
    async def revoke():
        if revocation == "grant":
            await grant(async_client, ids, allowed=False)
        elif revocation == "project":
            row = (await db_session.execute(select(ProjectMember).where(ProjectMember.project_id == ids["project_id"], ProjectMember.user_id == ids["member_user_id"]))).scalar_one()
            row.left_at = datetime.now(timezone.utc)
        else:
            row = (await db_session.execute(select(CompanyMembership).where(CompanyMembership.company_id == ids["company_id"], CompanyMembership.user_id == ids["member_user_id"]))).scalar_one()
            if revocation == "employment": row.employment_status = "left"
            else: row.status = "inactive"
        await db_session.commit()
    model_stub(monkeypatch, pages[0], after=revoke)
    during = await async_client.post(url(ids, "/summaries"), headers=ids["member_headers"], json={"page_ids": [pages[0].id]})
    assert during.status_code == 403, during.text
    save = await async_client.post(url(ids, f"/summaries/{draft['id']}/save"), headers=ids["member_headers"], json={"title": "try", "body_text": "never", "tags": []})
    assert save.status_code == 403, save.text
    assert (await db_session.execute(select(func.count()).select_from(PersonalKnowledgeEntry).where(PersonalKnowledgeEntry.owner_user_id == ids["member_user_id"]))).scalar_one() == 0
    from app.models.project_knowledge import ProjectKnowledgeSummary
    assert (await db_session.execute(select(func.count()).select_from(ProjectKnowledgeSummary))).scalar_one() == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("change", ["body", "title", "unpublish", "delete"])
async def test_source_change_blocks_confirm_save(async_client, db_session, seed_ids, monkeypatch, change):
    ids = seed_ids
    pages = await seed_pages(db_session, ids)
    await grant(async_client, ids)
    model_stub(monkeypatch, pages[0])
    draft = await generate(async_client, ids, pages[0])
    if change == "body": pages[0].body_text = "SOURCE_CHANGED"
    if change == "title": pages[0].title = "SOURCE_RENAMED"
    if change == "unpublish": pages[0].source = "llm_wiki_draft"
    if change == "delete": await db_session.delete(pages[0])
    await db_session.commit()
    saved = await async_client.post(url(ids, f"/summaries/{draft['id']}/save"), headers=ids["member_headers"], json={"title": "try", "body_text": "never", "tags": []})
    assert saved.status_code == 409, saved.text


@pytest.mark.asyncio
async def test_cross_scope_draft_and_grants_and_revoked_copy_behavior(async_client, db_session, seed_ids, monkeypatch):
    ids = seed_ids
    pages = await seed_pages(db_session, ids)
    await grant(async_client, ids)
    model_stub(monkeypatch, pages[0])
    draft = await generate(async_client, ids, pages[0])
    saved = await async_client.post(url(ids, f"/summaries/{draft['id']}/save"), headers=ids["member_headers"], json={"title": "copy", "body_text": "allowed", "tags": []})
    assert saved.status_code == 200, saved.text
    await grant(async_client, ids, allowed=False)
    existing = await async_client.get(f"/api/v1/projects/{ids['project_id']}/personal-knowledge", headers=ids["member_headers"])
    assert any(entry["id"] == saved.json()["data"]["entry"]["id"] for entry in existing.json()["data"]["entries"])
    other_project = Project(company_id=ids["company_id"], name="其他知识项目", created_by=ids["pm_user_id"], pm_user_id=ids["pm_user_id"])
    db_session.add(other_project); await db_session.flush()
    db_session.add_all([ProjectMember(project_id=other_project.id, user_id=ids["pm_user_id"], role="pm"), ProjectMember(project_id=other_project.id, user_id=ids["member_user_id"])])
    await db_session.commit()
    other_ids = {**ids, "project_id": other_project.id}
    await grant(async_client, other_ids)
    denied = await async_client.get(url(other_ids, f"/summaries/{draft['id']}"), headers=ids["member_headers"])
    assert denied.status_code == 404
    denied = await async_client.post(url(other_ids, f"/summaries/{draft['id']}/save"), headers=ids["member_headers"], json={"title": "copy", "body_text": "bad", "tags": []})
    assert denied.status_code == 404
    outsider = await async_client.get(url(ids), headers=ids["outsider_headers"])
    assert outsider.status_code == 403
