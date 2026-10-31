"""Private Wiki ownership, source import and graph persistence regressions."""
from datetime import datetime, timezone

import pytest
from sqlalchemy import func, select

from app.models.agent import AgentDefinition, AgentMessage, AgentSession
from app.models.company import Company, CompanyMembership
from app.models.evidence import EvidenceFile, EvidencePackage
from app.models.knowledge import EvidenceFileText, KnowledgeChunk
from app.models.project import Project, ProjectMember
from app.models.report import AgentReport, ProjectAgentBinding


def url(ids, suffix=""):
    return f"/api/v1/projects/{ids['project_id']}/personal-knowledge{suffix}"


async def create(client, ids, title="私人 Wiki", headers=None):
    response = await client.post(url(ids, "/entries"), headers=headers or ids["member_headers"],
        json={"title": title, "body_text": "PRIVATE_NEEDLE 原始正文", "tags": ["验收"]})
    assert response.status_code == 200, response.text
    return response.json()["data"]


@pytest.mark.asyncio
async def test_owner_crud_graph_positions_and_pm_privacy(async_client, seed_ids):
    ids = seed_ids
    first = await create(async_client, ids)
    second = await create(async_client, ids, "第二页")
    entry_url = url(ids, f"/entries/{first['id']}")
    edited = await async_client.patch(entry_url, headers=ids["member_headers"],
        json={"title": "改过标题", "position": {"x": 123.5, "y": -82}, "tags": ["新标签"]})
    assert edited.status_code == 200, edited.text
    assert edited.json()["data"]["position"] == {"x": 123.5, "y": -82}
    linked = await async_client.post(url(ids, "/links"), headers=ids["member_headers"],
        json={"source_entry_id": first["id"], "target_entry_id": second["id"], "label": "关联"})
    assert linked.status_code == 200, linked.text
    relabeled = await async_client.patch(url(ids, f"/links/{linked.json()['data']['id']}"), headers=ids["member_headers"], json={"label": "新关系"})
    assert relabeled.status_code == 200 and relabeled.json()["data"]["label"] == "新关系"
    # Self links and cycles are deliberate user relationships and are allowed.
    cycle = await async_client.post(url(ids, "/links"), headers=ids["member_headers"],
        json={"source_entry_id": second["id"], "target_entry_id": first["id"], "label": "回路"})
    assert cycle.status_code == 200, cycle.text
    owner = (await async_client.get(url(ids), headers=ids["member_headers"])).json()["data"]
    assert owner["scope"] == {"company_id": ids["company_id"], "project_id": ids["project_id"], "owner_user_id": ids["member_user_id"]}
    assert owner["entries"][0]["position"] == {"x": 123.5, "y": -82}
    assert len(owner["links"]) == 2
    pm = (await async_client.get(url(ids), headers=ids["pm_headers"], params={"user_id": ids["member_user_id"]})).json()["data"]
    assert pm["entries"] == [] and pm["links"] == []
    for method in (async_client.patch, async_client.delete):
        kwargs = {"json": {"title": "偷窥"}} if method == async_client.patch else {}
        denied = await method(entry_url, headers=ids["pm_headers"], **kwargs)
        assert denied.status_code == 404
    denied = await async_client.delete(url(ids, f"/links/{linked.json()['data']['id']}"), headers=ids["pm_headers"])
    assert denied.status_code == 404
    deleted = await async_client.delete(entry_url, headers=ids["member_headers"])
    assert deleted.json()["data"] == {"id": first["id"], "is_deleted": True}
    remaining = (await async_client.get(url(ids), headers=ids["member_headers"])).json()["data"]
    assert len(remaining["entries"]) == 1 and remaining["links"] == []


async def sources(db, ids):
    own = EvidencePackage(company_id=ids["company_id"], project_id=ids["project_id"], node_id=ids["node_id"], submitter_user_id=ids["member_user_id"], summary_text="OWN_PACKAGE 原材料")
    other = EvidencePackage(company_id=ids["company_id"], project_id=ids["project_id"], node_id=ids["node_id"], submitter_user_id=ids["pm_user_id"], summary_text="FOREIGN_PACKAGE")
    db.add_all([own, other]); await db.flush()
    for uploader, package, marker in [(ids["member_user_id"], own.id, "OWN_FILE_BODY"), (ids["pm_user_id"], own.id, "FOREIGN_FILE_BODY"), (ids["member_user_id"], None, "OWN_UNATTACHED_FILE")]:
        file = EvidenceFile(company_id=ids["company_id"], project_id=ids["project_id"], package_id=package, uploader_user_id=uploader, storage_key=marker, original_name=marker+".txt")
        db.add(file); await db.flush()
        db.add(EvidenceFileText(evidence_file_id=file.id, company_id=ids["company_id"], project_id=ids["project_id"], status="succeeded", text_md=marker))
    agent = AgentDefinition(company_id=ids["company_id"], name="test")
    db.add(agent); await db.flush()
    binding = ProjectAgentBinding(company_id=ids["company_id"], project_id=ids["project_id"], user_id=ids["member_user_id"], agent_definition_id=agent.id)
    db.add(binding); await db.flush()
    for user in (ids["member_user_id"], ids["pm_user_id"]):
        marker = "OWN" if user == ids["member_user_id"] else "FOREIGN"
        db.add(AgentReport(company_id=ids["company_id"], project_id=ids["project_id"], binding_id=binding.id, author_user_id=user, summary_text=marker+"_REPORT"))
        session = AgentSession(company_id=ids["company_id"], project_id=ids["project_id"], user_id=user)
        db.add(session); await db.flush()
        db.add_all([AgentMessage(session_id=session.id, role="user", content=marker+"_MESSAGE"), AgentMessage(session_id=session.id, role="assistant", content="ASSISTANT_MUST_NOT_IMPORT")])
    await db.commit()
    return own.id


@pytest.mark.asyncio
async def test_sync_own_sources_idempotent_preserves_edits_and_deleted_tombstones(async_client, db_session, seed_ids):
    ids = seed_ids
    package_id = await sources(db_session, ids)
    first = await async_client.post(url(ids, "/sync"), headers=ids["member_headers"], json={})
    assert first.status_code == 200, first.text
    assert first.json()["data"]["created"] == 5
    catalog = (await async_client.get(url(ids), headers=ids["member_headers"])).json()["data"]
    text = " ".join(entry["body_text"] for entry in catalog["entries"])
    for marker in ("OWN_PACKAGE", "OWN_FILE_BODY", "OWN_UNATTACHED_FILE", "OWN_REPORT", "OWN_MESSAGE"):
        assert marker in text
    assert "FOREIGN" not in text and "ASSISTANT_MUST_NOT_IMPORT" not in text
    imported = next(e for e in catalog["entries"] if e["source_id"] == package_id and e["source_type"] == "evidence_package")
    assert imported["source_ref"]["package_id"] == package_id
    assert any(e["source_type"] == "evidence_file" and "file_id" in e["source_ref"] for e in catalog["entries"])
    await async_client.patch(url(ids, f"/entries/{imported['id']}"), headers=ids["member_headers"], json={"body_text": "MY_EDIT survives sync"})
    second = await async_client.post(url(ids, "/sync"), headers=ids["member_headers"], json={})
    assert second.json()["data"] == {"created": 0, "skipped": 5}
    catalog = (await async_client.get(url(ids), headers=ids["member_headers"])).json()["data"]
    assert next(e for e in catalog["entries"] if e["id"] == imported["id"])["body_text"] == "MY_EDIT survives sync"
    await async_client.delete(url(ids, f"/entries/{imported['id']}"), headers=ids["member_headers"])
    third = await async_client.post(url(ids, "/sync"), headers=ids["member_headers"], json={})
    assert third.json()["data"] == {"created": 0, "skipped": 5}
    assert await db_session.get(EvidencePackage, package_id) is not None
    assert (await db_session.execute(select(func.count()).select_from(KnowledgeChunk))).scalar_one() == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("revocation", ["project", "employment", "company"])
async def test_revoked_access_blocks_every_action_and_retrieval(async_client, db_session, seed_ids, revocation):
    ids = seed_ids
    entry = await create(async_client, ids)
    if revocation == "project":
        membership = (await db_session.execute(select(ProjectMember).where(ProjectMember.project_id == ids["project_id"], ProjectMember.user_id == ids["member_user_id"]))).scalar_one()
        membership.left_at = datetime.now(timezone.utc)
    else:
        membership = (await db_session.execute(select(CompanyMembership).where(CompanyMembership.company_id == ids["company_id"], CompanyMembership.user_id == ids["member_user_id"]))).scalar_one()
        if revocation == "employment": membership.employment_status = "left"
        else: membership.status = "inactive"
    await db_session.commit()
    requests = [("GET", "", None), ("POST", "/entries", {"title": "new", "body_text": "x"}), ("PATCH", f"/entries/{entry['id']}", {"body_text": "edited"}), ("DELETE", f"/entries/{entry['id']}", None), ("POST", "/sync", {}), ("POST", "/links", {"source_entry_id": entry["id"], "target_entry_id": entry["id"], "label": "self"}), ("PATCH", "/links/123", {"label": "edit"}), ("DELETE", "/links/123", None)]
    for method, suffix, payload in requests:
        response = await async_client.request(method, url(ids, suffix), headers=ids["member_headers"], **({"json": payload} if payload is not None else {}))
        assert response.status_code == 403, response.text
    from app.services.personal_knowledge import search_personal_knowledge
    assert await search_personal_knowledge(db_session, ids["company_id"], ids["project_id"], ids["member_user_id"], "PRIVATE_NEEDLE") == []


@pytest.mark.asyncio
async def test_cross_owner_project_company_links_and_search_denied(async_client, db_session, seed_ids):
    ids = seed_ids
    own = await create(async_client, ids)
    foreign_user = await create(async_client, ids, headers=ids["pm_headers"])
    project = Project(company_id=ids["company_id"], name="other", created_by=ids["pm_user_id"])
    db_session.add(project); await db_session.flush()
    db_session.add(ProjectMember(project_id=project.id, user_id=ids["member_user_id"]))
    await db_session.commit()
    foreign_ids = {**ids, "project_id": project.id}
    foreign_project = await create(async_client, foreign_ids)
    for entry in (foreign_user, foreign_project):
        response = await async_client.post(url(ids, "/links"), headers=ids["member_headers"], json={"source_entry_id": own["id"], "target_entry_id": entry["id"], "label": "bad"})
        assert response.status_code == 404, response.text
    denied = await async_client.patch(url(foreign_ids, f"/entries/{own['id']}"), headers=ids["member_headers"], json={"body_text": "bad"})
    assert denied.status_code == 404
    from app.services.personal_knowledge import search_personal_knowledge
    hits = await search_personal_knowledge(db_session, ids["company_id"], ids["project_id"], ids["member_user_id"], "PRIVATE_NEEDLE")
    assert [h["source_id"] for h in hits] == [own["id"]]
    assert hits[0]["source_type"] == "personal_knowledge" and "PRIVATE_NEEDLE" in hits[0]["chunk_text"]
    assert await search_personal_knowledge(db_session, 99999, ids["project_id"], ids["member_user_id"], "PRIVATE_NEEDLE") == []
    denied = await async_client.get(url(ids), headers=ids["outsider_headers"])
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_import_rejects_other_project_company_and_mismatched_file_text(async_client, db_session, seed_ids):
    ids = seed_ids
    await sources(db_session, ids)
    company = Company(name="别的公司", slug="other-personal-knowledge-company")
    db_session.add(company); await db_session.flush()
    other_project = Project(company_id=ids["company_id"], name="我的其他项目", created_by=ids["member_user_id"])
    other_company_project = Project(company_id=company.id, name="我的其他公司项目", created_by=ids["member_user_id"])
    db_session.add_all([other_project, other_company_project]); await db_session.flush()
    db_session.add(CompanyMembership(company_id=company.id, user_id=ids["member_user_id"], status="active", employment_status="active"))
    for project in [other_project, other_company_project]:
        db_session.add(ProjectMember(project_id=project.id, user_id=ids["member_user_id"]))
        package = EvidencePackage(company_id=project.company_id, project_id=project.id, node_id=ids["node_id"], submitter_user_id=ids["member_user_id"], summary_text="OUT_OF_SCOPE_PACKAGE")
        session = AgentSession(company_id=project.company_id, project_id=project.id, user_id=ids["member_user_id"])
        db_session.add_all([package, session]); await db_session.flush()
        db_session.add(AgentMessage(session_id=session.id, role="user", content="OUT_OF_SCOPE_MESSAGE"))
        file = EvidenceFile(company_id=project.company_id, project_id=project.id, uploader_user_id=ids["member_user_id"], storage_key=f"foreign-{project.id}", original_name="OUT_OF_SCOPE_FILE.txt")
        db_session.add(file); await db_session.flush()
        db_session.add(EvidenceFileText(evidence_file_id=file.id, company_id=project.company_id, project_id=project.id, status="succeeded", text_md="OUT_OF_SCOPE_FILE_BODY"))
    file = EvidenceFile(company_id=ids["company_id"], project_id=ids["project_id"], uploader_user_id=ids["member_user_id"], storage_key="mismatched", original_name="MISMATCHED_FILE.txt")
    db_session.add(file); await db_session.flush()
    db_session.add(EvidenceFileText(evidence_file_id=file.id, company_id=company.id, project_id=ids["project_id"], status="succeeded", text_md="MISMATCHED_TEXT"))
    await db_session.commit()
    response = await async_client.post(url(ids, "/sync"), headers=ids["member_headers"], json={})
    assert response.status_code == 200, response.text
    assert response.json()["data"]["created"] == 5
    catalog = (await async_client.get(url(ids), headers=ids["member_headers"])).json()["data"]
    assert "OUT_OF_SCOPE" not in str(catalog) and "MISMATCHED" not in str(catalog)
    # Foreign company entries remain inaccessible even to this owner when the URL names the original project.
    from app.models.personal_knowledge import PersonalKnowledgeEntry
    entry = PersonalKnowledgeEntry(company_id=company.id, project_id=other_company_project.id, owner_user_id=ids["member_user_id"], title="FOREIGN_COMPANY_PRIVATE", body_text="PRIVATE_NEEDLE")
    db_session.add(entry); await db_session.commit()
    denied = await async_client.post(url(ids, "/links"), headers=ids["member_headers"], json={"source_entry_id": catalog["entries"][0]["id"], "target_entry_id": entry.id, "label": "bad"})
    assert denied.status_code == 404


@pytest.mark.asyncio
async def test_rejects_owner_override_and_invalid_patch_data(async_client, seed_ids):
    ids = seed_ids
    entry = await create(async_client, ids)
    for payload in [{"owner_user_id": ids["pm_user_id"], "title": "偷换所有人"}, {"title": "  "}, {"title": None}, {"body_text": None}, {"tags": ["x" * 101]}, {"position": {"x": 1e20, "y": 0}}]:
        response = await async_client.patch(url(ids, f"/entries/{entry['id']}"), headers=ids["member_headers"], json=payload)
        assert response.status_code == 422, response.text


@pytest.mark.asyncio
async def test_late_extracted_and_new_attachments_import_without_overwriting_edits_or_tombstones(async_client, db_session, seed_ids):
    ids = seed_ids
    package = EvidencePackage(company_id=ids["company_id"], project_id=ids["project_id"],
        node_id=ids["node_id"], submitter_user_id=ids["member_user_id"], summary_text="先整理材料")
    db_session.add(package); await db_session.flush()
    file = EvidenceFile(company_id=ids["company_id"], project_id=ids["project_id"], package_id=package.id,
        uploader_user_id=ids["member_user_id"], storage_key="late-extraction", original_name="稍后完成抽取.txt")
    db_session.add(file); await db_session.flush()
    extracted = EvidenceFileText(evidence_file_id=file.id, company_id=ids["company_id"], project_id=ids["project_id"], status="pending")
    db_session.add(extracted); await db_session.commit()
    initial = await async_client.post(url(ids, "/sync"), headers=ids["member_headers"], json={})
    assert initial.json()["data"] == {"created": 1, "skipped": 0}
    catalog = (await async_client.get(url(ids), headers=ids["member_headers"])).json()["data"]
    package_entry = catalog["entries"][0]
    await async_client.patch(url(ids, f"/entries/{package_entry['id']}"), headers=ids["member_headers"], json={"body_text": "MY_PACKAGE_EDIT"})
    extracted.status, extracted.text_md = "succeeded", "LATE_EXTRACTION_BODY"
    await db_session.commit()
    late = await async_client.post(url(ids, "/sync"), headers=ids["member_headers"], json={})
    assert late.json()["data"] == {"created": 1, "skipped": 1}
    catalog = (await async_client.get(url(ids), headers=ids["member_headers"])).json()["data"]
    file_entry = next(entry for entry in catalog["entries"] if entry["source_type"] == "evidence_file")
    assert file_entry["body_text"] == "LATE_EXTRACTION_BODY"
    assert file_entry["source_ref"] == {"file_id": file.id, "package_id": package.id, "node_id": ids["node_id"]}
    assert next(entry for entry in catalog["entries"] if entry["id"] == package_entry["id"])["body_text"] == "MY_PACKAGE_EDIT"
    await async_client.patch(url(ids, f"/entries/{file_entry['id']}"), headers=ids["member_headers"], json={"body_text": "MY_FILE_EDIT"})
    extracted.text_md = "CHANGED_SOURCE_BODY"
    await db_session.commit()
    again = await async_client.post(url(ids, "/sync"), headers=ids["member_headers"], json={})
    assert again.json()["data"] == {"created": 0, "skipped": 2}
    catalog = (await async_client.get(url(ids), headers=ids["member_headers"])).json()["data"]
    assert next(entry for entry in catalog["entries"] if entry["id"] == file_entry["id"])["body_text"] == "MY_FILE_EDIT"
    for entry in (package_entry, file_entry):
        await async_client.delete(url(ids, f"/entries/{entry['id']}"), headers=ids["member_headers"])
    tombstones = await async_client.post(url(ids, "/sync"), headers=ids["member_headers"], json={})
    assert tombstones.json()["data"] == {"created": 0, "skipped": 2}
    new_file = EvidenceFile(company_id=ids["company_id"], project_id=ids["project_id"], package_id=package.id,
        uploader_user_id=ids["member_user_id"], storage_key="new-attachment", original_name="新增附件.txt")
    db_session.add(new_file); await db_session.flush()
    db_session.add(EvidenceFileText(evidence_file_id=new_file.id, company_id=ids["company_id"], project_id=ids["project_id"], status="succeeded", text_md="NEW_ATTACHMENT_BODY"))
    await db_session.commit()
    new_attachment = await async_client.post(url(ids, "/sync"), headers=ids["member_headers"], json={})
    assert new_attachment.json()["data"] == {"created": 1, "skipped": 2}
    catalog = (await async_client.get(url(ids), headers=ids["member_headers"])).json()["data"]
    assert len(catalog["entries"]) == 1 and catalog["entries"][0]["body_text"] == "NEW_ATTACHMENT_BODY"
    assert await db_session.get(EvidencePackage, package.id) is not None
    assert await db_session.get(EvidenceFile, file.id) is not None
