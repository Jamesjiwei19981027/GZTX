"""Private knowledge CRUD helpers and deterministic import of the owner's sources.

No public KnowledgeChunk is created. Repeated sync never modifies existing rows,
including deleted imports, so user edits and deletion intent are preserved.
"""
import re

from fastapi import HTTPException
from sqlalchemy import delete, or_, select

from app.models.agent import AgentMessage, AgentSession
from app.models.company import CompanyMembership
from app.models.evidence import EvidenceFile, EvidencePackage
from app.models.knowledge import EvidenceFileText
from app.models.personal_knowledge import PersonalKnowledgeEntry, PersonalKnowledgeLink
from app.models.project import Project, ProjectMember
from app.models.report import AgentReport


async def require_personal_scope(db, project_id: int, user_id: int, company_id: int | None = None):
    project = await db.get(Project, project_id)
    if not project or (company_id is not None and project.company_id != company_id):
        raise HTTPException(404, "项目不存在")
    membership = (await db.execute(select(CompanyMembership.id).where(
        CompanyMembership.company_id == project.company_id,
        CompanyMembership.user_id == user_id,
        CompanyMembership.status == "active",
        CompanyMembership.employment_status == "active",
    ))).first()
    project_member = (await db.execute(select(ProjectMember.id).where(
        ProjectMember.project_id == project.id,
        ProjectMember.user_id == user_id,
        ProjectMember.left_at.is_(None),
    ))).first()
    if not membership or not project_member:
        raise HTTPException(403, "需要在职公司成员与当前项目成员资格")
    return project


def scoped(model, company_id, project_id, user_id):
    return (model.company_id == company_id, model.project_id == project_id, model.owner_user_id == user_id)


def entry_dto(row):
    return {"id": row.id, "title": row.title, "body_text": row.body_text,
        "tags": row.tags_json or [], "position": row.position_json,
        "source_type": row.source_type, "source_id": row.source_id,
        "source_ref": row.source_ref_json or {},
        "updated_at": row.updated_at.isoformat() if row.updated_at else None}


def link_dto(row):
    return {"id": row.id, "source_entry_id": row.source_entry_id,
        "target_entry_id": row.target_entry_id, "label": row.label}


async def owned_entry(db, project, user_id, entry_id):
    row = (await db.execute(select(PersonalKnowledgeEntry).where(
        *scoped(PersonalKnowledgeEntry, project.company_id, project.id, user_id),
        PersonalKnowledgeEntry.id == entry_id, PersonalKnowledgeEntry.is_deleted.is_(False),
    ))).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "知识条目不存在")
    return row


async def owned_link(db, project, user_id, link_id):
    row = (await db.execute(select(PersonalKnowledgeLink).where(
        *scoped(PersonalKnowledgeLink, project.company_id, project.id, user_id),
        PersonalKnowledgeLink.id == link_id,
    ))).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, "知识关联不存在")
    await owned_entry(db, project, user_id, row.source_entry_id)
    await owned_entry(db, project, user_id, row.target_entry_id)
    return row


async def delete_entry(db, project, user_id, entry_id):
    row = await owned_entry(db, project, user_id, entry_id)
    row.is_deleted = True
    await db.execute(delete(PersonalKnowledgeLink).where(
        *scoped(PersonalKnowledgeLink, project.company_id, project.id, user_id),
        or_(PersonalKnowledgeLink.source_entry_id == entry_id, PersonalKnowledgeLink.target_entry_id == entry_id)))


async def sync_personal_knowledge(db, project, user_id):
    # Serialize syncs per owner/project using the membership row on databases
    # supporting FOR UPDATE; the unique constraint independently protects imports.
    await db.execute(select(ProjectMember.id).where(ProjectMember.project_id == project.id,
        ProjectMember.user_id == user_id, ProjectMember.left_at.is_(None)).with_for_update())
    existing = set((await db.execute(select(PersonalKnowledgeEntry.source_type, PersonalKnowledgeEntry.source_id).where(
        *scoped(PersonalKnowledgeEntry, project.company_id, project.id, user_id)))).all())
    packages = (await db.execute(select(EvidencePackage).where(
        EvidencePackage.company_id == project.company_id, EvidencePackage.project_id == project.id,
        EvidencePackage.submitter_user_id == user_id).order_by(EvidencePackage.id))).scalars().all()
    own_packages = {p.id: p for p in packages}
    files = (await db.execute(select(EvidenceFile, EvidenceFileText).join(EvidenceFileText,
        EvidenceFileText.evidence_file_id == EvidenceFile.id).outerjoin(EvidencePackage,
        EvidencePackage.id == EvidenceFile.package_id).where(
        EvidenceFile.company_id == project.company_id, EvidenceFile.project_id == project.id,
        EvidenceFile.uploader_user_id == user_id,
        EvidenceFileText.company_id == project.company_id, EvidenceFileText.project_id == project.id,
        EvidenceFileText.status == "succeeded",
        or_(EvidenceFile.package_id.is_(None),
            (EvidencePackage.company_id == project.company_id) & (EvidencePackage.project_id == project.id)),
    ).order_by(EvidenceFile.id))).all()
    file_bodies = {}
    importable_files = []
    for file, text in files:
        if not (text.text_md or "").strip():
            continue
        if file.package_id in own_packages:
            file_bodies.setdefault(file.package_id, []).append((file, text))
        # A file has its own immutable import identity even when its package
        # was imported earlier. Extraction may complete or attachments arrive
        # after the package entry has already been edited or deleted.
        importable_files.append((file, text))
    candidates = []
    for package in packages:
        owned_files = file_bodies.get(package.id, [])
        body = "\n\n".join([package.summary_text or ""] + [f"## {f.original_name}\n\n{t.text_md}" for f, t in owned_files]).strip()
        candidates.append(("evidence_package", package.id, (package.summary_text or f"材料 #{package.id}").splitlines()[0][:300], body,
            {"package_id": package.id, "node_id": package.node_id, "file_ids": [f.id for f, _ in owned_files]}))
    for file, text in importable_files:
        ref = {"file_id": file.id}
        if file.package_id:
            ref["package_id"] = file.package_id
        if file.package_id in own_packages:
            ref["node_id"] = own_packages[file.package_id].node_id
        candidates.append(("evidence_file", file.id, file.original_name[:300], text.text_md, ref))
    reports = (await db.execute(select(AgentReport).where(AgentReport.company_id == project.company_id,
        AgentReport.project_id == project.id, AgentReport.author_user_id == user_id).order_by(AgentReport.id))).scalars().all()
    for report in reports:
        candidates.append(("agent_report", report.id, f"我的汇报 #{report.id}", report.summary_text,
            {"report_id": report.id}))
    messages = (await db.execute(select(AgentMessage, AgentSession).join(AgentSession, AgentSession.id == AgentMessage.session_id).where(
        AgentSession.company_id == project.company_id, AgentSession.project_id == project.id,
        AgentSession.user_id == user_id, AgentMessage.role == "user").order_by(AgentMessage.id))).all()
    for message, session in messages:
        candidates.append(("agent_message", message.id, (message.content or f"我的对话 #{message.id}").splitlines()[0][:300], message.content,
            {"session_id": session.id, "message_id": message.id}))
    created = skipped = 0
    for source_type, source_id, title, body, ref in candidates:
        if (source_type, source_id) in existing:
            skipped += 1
            continue
        db.add(PersonalKnowledgeEntry(company_id=project.company_id, project_id=project.id,
            owner_user_id=user_id, title=title or f"资料 #{source_id}", body_text=body or "",
            source_type=source_type, source_id=source_id, source_ref_json=ref))
        existing.add((source_type, source_id))
        created += 1
    await db.flush()
    return {"created": created, "skipped": skipped}


async def search_personal_knowledge(db, company_id, project_id, user_id, query, limit=6):
    """Agent retrieval-compatible rows, never accessible after membership revocation."""
    try:
        await require_personal_scope(db, project_id, user_id, company_id)
    except HTTPException:
        return []
    limit = max(0, min(int(limit), 50))
    if not limit:
        return []
    rows = (await db.execute(select(PersonalKnowledgeEntry).where(
        *scoped(PersonalKnowledgeEntry, company_id, project_id, user_id),
        PersonalKnowledgeEntry.is_deleted.is_(False)))).scalars().all()
    query = (query or "").casefold().strip()
    terms = set(re.findall(r"[a-z0-9_]+|[\u4e00-\u9fff]", query))
    hits = []
    for row in rows:
        text = f"{row.title}\n{row.body_text}"
        folded = text.casefold()
        score = (5.0 if query and query in folded else 0.0) + sum(1 for term in terms if term in folded)
        if query and not score:
            continue
        # An imported document can be much longer than the prompt budget.
        # Prefer matches in its body, even when its title also matches the query.
        body = row.body_text or ""
        body_folded = body.casefold()
        match_at = body_folded.find(query) if query else 0
        if match_at < 0:
            for term in sorted(terms, key=lambda value: (-len(value), value)):
                match_at = body_folded.find(term)
                if match_at >= 0:
                    break
        start = max(0, match_at - 2000)
        budget = max(1, 12000 - len(row.title) - 1)
        excerpt = body[start:start + budget]
        hits.append({"chunk_id": f"personal-knowledge:{row.id}", "chunk_text": f"{row.title}\n{excerpt}",
            "source_type": "personal_knowledge", "source_id": row.id, "node_id": None,
            "meta": {"title": row.title, "private_owner_user_id": user_id,
                "project_id": project_id, "source_type": row.source_type,
                "source_id": row.source_id, "source_ref": row.source_ref_json or {}}, "score": score or 1.0})
    return sorted(hits, key=lambda h: (-h["score"], -h["source_id"]))[:limit]
