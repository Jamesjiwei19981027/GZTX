"""材料提交与判定流水线"""
import hashlib
import uuid
from copy import deepcopy
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog, ReviewCase
from app.models.company import Company
from app.models.evidence import AsyncJob, EvidenceFile, EvidencePackage
from app.models.knowledge import EvidenceFileText
from app.models.progress import AdoptionRecord
from app.models.tree import TreeNode
from app.models.wiki import ProjectWikiEntry
from app.services.evidence_judge import get_judge
from app.services.knowledge.indexer import index_evidence_file
from app.services.notify.service import NotificationService
from app.services.progress_service import append_progress
from app.services.storage.local import LocalStorage
from app.services.storage.router import StorageRouter


async def save_upload_file(
    db: AsyncSession,
    *,
    user_id: int,
    filename: str,
    content: bytes,
    mime_type: str | None,
    company_id: int,
    project_id: int | None = None,
    max_size: int | None = None,
) -> EvidenceFile:
    """上传材料文件到公司隔离前缀；必须提供 company_id。"""
    from app.core.config import settings

    limit = max_size if max_size is not None else int(settings.MAX_UPLOAD_SIZE)
    if len(content) > limit:
        raise ValueError("file_too_large")
    if len(content) == 0:
        raise ValueError("file_empty")

    company = await db.get(Company, company_id)
    if not company:
        raise ValueError("company_not_found")

    sha = hashlib.sha256(content).hexdigest()
    safe_name = (filename or "file.bin").replace("/", "_").replace("\\", "_")[:200]
    key = f"ev/{company_id}/{user_id}/{uuid.uuid4().hex}_{safe_name}"
    storage = await StorageRouter().for_company(db, company)
    await storage.put(key, content, mime_type or "application/octet-stream")
    ef = EvidenceFile(
        package_id=None,
        company_id=company_id,
        project_id=project_id,
        uploader_user_id=user_id,
        storage_key=key,
        original_name=safe_name,
        mime_type=mime_type,
        size_bytes=len(content),
        sha256=sha,
        kind="file",
    )
    db.add(ef)
    await db.flush()
    return ef


async def submit_evidence(
    db: AsyncSession,
    *,
    node: TreeNode,
    user_id: int,
    summary_text: str | None,
    structured: dict | None,
    links: list | None,
    file_ids: list[int] | None,
    supersedes_package_id: int | None = None,
) -> tuple[EvidencePackage, AsyncJob]:
    pkg = EvidencePackage(
        company_id=node.company_id,
        project_id=node.project_id,
        node_id=node.id,
        submitter_user_id=user_id,
        status="submitted",
        summary_text=summary_text,
        structured_json=structured,
        links_json=links,
        supersedes_package_id=supersedes_package_id,
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(pkg)
    await db.flush()

    files_count = 0
    if file_ids:
        for fid in file_ids:
            ef = await db.get(EvidenceFile, fid)
            if not ef or ef.uploader_user_id != user_id or ef.package_id is not None:
                continue
            # 租户隔离：仅本司上传、未绑定的文件可挂包
            if getattr(ef, "company_id", None) is not None and ef.company_id != node.company_id:
                continue
            if getattr(ef, "project_id", None) is not None and ef.project_id != node.project_id:
                continue
            ef.package_id = pkg.id
            if getattr(ef, "company_id", None) is None:
                ef.company_id = node.company_id
            if getattr(ef, "project_id", None) is None:
                ef.project_id = node.project_id
            files_count += 1
        await db.flush()
        if files_count == 0:
            raise ValueError("invalid_file_ids")

    if supersedes_package_id:
        old = await db.get(EvidencePackage, supersedes_package_id)
        if old and old.node_id == node.id:
            old.status = "superseded"

    job = AsyncJob(
        company_id=node.company_id,
        job_type="evidence.judge",
        status="pending",
        payload_json={"package_id": pkg.id, "node_id": node.id},
    )
    db.add(job)
    await db.flush()

    # worker 模式且包内有文件：另建抽取任务，由 extractor worker 领取，
    # 抽取完成后按 judge_job_id 链式执行判定（见 app/workers/extractor.py）
    from app.core.config import settings

    if (settings.EXTRACTION_MODE or "off").lower() == "worker" and files_count > 0:
        db.add(
            AsyncJob(
                company_id=node.company_id,
                job_type="evidence.extract",
                status="pending",
                payload_json={"package_id": pkg.id, "judge_job_id": job.id},
            )
        )
        await db.flush()

    db.add(
        AuditLog(
            company_id=node.company_id,
            project_id=node.project_id,
            actor_user_id=user_id,
            action="evidence.submit",
            resource_type="evidence_package",
            resource_id=str(pkg.id),
            detail_json={"job_id": job.id, "files_count": files_count},
        )
    )
    await db.flush()
    return pkg, job


async def run_evidence_judge(db: AsyncSession, job_id: int) -> AsyncJob:
    job = await db.get(AsyncJob, job_id)
    if not job:
        raise ValueError("job_not_found")
    job.status = "running"
    job.started_at = datetime.now(timezone.utc)
    await db.flush()

    try:
        package_id = (job.payload_json or {}).get("package_id")
        pkg = await db.get(EvidencePackage, package_id)
        if not pkg:
            raise ValueError("package_not_found")
        node = await db.get(TreeNode, pkg.node_id)
        if not node:
            raise ValueError("node_not_found")

        fq = await db.execute(
            select(EvidenceFile).where(EvidenceFile.package_id == pkg.id)
        )
        files = list(fq.scalars().all())

        # 装载已抽取成功的正文（EXTRACTION_MODE=off 时无记录，files_texts 为空）
        texts_by_file: dict[int, EvidenceFileText] = {}
        if files:
            tq = await db.execute(
                select(EvidenceFileText).where(
                    EvidenceFileText.evidence_file_id.in_([f.id for f in files]),
                    EvidenceFileText.status == "succeeded",
                )
            )
            texts_by_file = {t.evidence_file_id: t for t in tq.scalars().all()}
        files_texts = [
            {"name": f.original_name, "text": texts_by_file[f.id].text_md}
            for f in files
            if f.id in texts_by_file
            and (texts_by_file[f.id].text_md or "").strip()
        ]

        prefer_llm = False
        try:
            from app.services.llm_settings import llm_from_company

            cfg = await llm_from_company(db, pkg.company_id)
            prefer_llm = bool(cfg and cfg.enabled and cfg.use_for_judge and cfg.is_usable())
        except Exception:
            prefer_llm = False
        judge = get_judge(prefer_llm=prefer_llm)
        result = judge.judge(
            package=pkg,
            node_progress=node.progress_json or {},
            files_count=len(files),
            files_texts=files_texts or None,
        )

        pkg.judge_result_json = {
            "decision": result.decision,
            "reason": result.reason,
            "confidence": result.confidence,
            "progress_after": result.progress_after,
            "wiki_draft": result.wiki_draft,
        }
        pkg.judged_at = datetime.now(timezone.utc)
        pkg.status = "pending_review"

        notify = NotificationService()
        await notify.enqueue(
            db,
            company_id=pkg.company_id,
            user_ids=[pkg.submitter_user_id],
            template_key="evidence.pending_review",
            payload={
                "package_id": pkg.id,
                "node_title": node.title if node else "",
                "node_id": pkg.node_id,
                "suggestion": result.decision,
                "reason": result.reason or "",
            },
            channels=["in_app", "wechat", "email"],
            project_id=pkg.project_id,
        )
        # 通知项目负责人去确认（否则没人知道有材料待确认）
        from app.models.project import Project

        project = await db.get(Project, pkg.project_id)
        pm_id = getattr(project, "pm_user_id", None) if project else None
        if pm_id and pm_id != pkg.submitter_user_id:
            await notify.enqueue(
                db,
                company_id=pkg.company_id,
                user_ids=[pm_id],
                template_key="evidence.awaiting_review",
                payload={
                    "package_id": pkg.id,
                    "node_title": node.title if node else "",
                    "node_id": pkg.node_id,
                    "suggestion": result.decision,
                },
                channels=["in_app", "wechat", "email"],
                project_id=pkg.project_id,
            )

        db.add(
            AuditLog(
                company_id=pkg.company_id,
                project_id=pkg.project_id,
                actor_user_id=None,
                action="evidence.judge",
                resource_type="evidence_package",
                resource_id=str(pkg.id),
                detail_json=pkg.judge_result_json,
            )
        )

        job.status = "succeeded"
        job.result_json = {
            "package_id": pkg.id,
            "decision": result.decision,
            "status": pkg.status,
        }
        job.finished_at = datetime.now(timezone.utc)
        await db.flush()
        return job
    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)
        job.finished_at = datetime.now(timezone.utc)
        await db.flush()
        raise


async def adopt_evidence_package(
    db: AsyncSession,
    *,
    package_id: int,
    reviewer_user_id: int,
    reason: str | None = None,
) -> EvidencePackage:
    pkg = await db.get(EvidencePackage, package_id)
    if not pkg:
        raise ValueError("package_not_found")
    node = await db.get(TreeNode, pkg.node_id)
    if not node:
        raise ValueError("node_not_found")

    judge_result = pkg.judge_result_json or {}
    progress_after = judge_result.get("progress_after")
    before = deepcopy(node.progress_json or {})
    if not progress_after:
        progress_after = deepcopy(before)

    fq = await db.execute(
        select(EvidenceFile).where(EvidenceFile.package_id == pkg.id)
    )
    files = list(fq.scalars().all())
    texts_by_file: dict[int, EvidenceFileText] = {}
    if files:
        tq = await db.execute(
            select(EvidenceFileText).where(
                EvidenceFileText.evidence_file_id.in_([f.id for f in files]),
                EvidenceFileText.status == "succeeded",
            )
        )
        texts_by_file = {t.evidence_file_id: t for t in tq.scalars().all()}

    final_reason = reason or judge_result.get("reason")
    rec = await append_progress(
        db,
        company_id=pkg.company_id,
        project_id=pkg.project_id,
        node_id=pkg.node_id,
        event_type="set_status",
        source="manual_review",
        before_json=before,
        after_json=progress_after,
        actor_user_id=reviewer_user_id,
        evidence_package_id=pkg.id,
        reason=final_reason,
    )
    progress_record_id = rec.id
    pkg.status = "adopted"

    wiki_draft = judge_result.get("wiki_draft")
    in_wiki = False
    if wiki_draft:
        db.add(
            ProjectWikiEntry(
                company_id=pkg.company_id,
                project_id=pkg.project_id,
                node_id=pkg.node_id,
                title=wiki_draft.get("title") or "材料采纳",
                body_text=wiki_draft.get("body_text"),
                source="evidence_adopt",
                evidence_package_id=pkg.id,
                created_by=pkg.submitter_user_id,
            )
        )
        in_wiki = True

    for f in files:
        t = texts_by_file.get(f.id)
        if t and (t.text_md or "").strip():
            await index_evidence_file(db, f, t.text_md, node_id=pkg.node_id)

    notify = NotificationService()
    await notify.enqueue(
        db,
        company_id=pkg.company_id,
        user_ids=[pkg.submitter_user_id],
        template_key="evidence.adopted",
        payload={
            "package_id": pkg.id,
            "node_title": node.title if node else "",
            "node_id": pkg.node_id,
        },
        channels=["in_app", "wechat", "email"],
        project_id=pkg.project_id,
    )
    try:
        from app.services.progress_alert import check_and_alert

        await check_and_alert(db, pkg.node_id)
    except Exception:
        pass

    db.add(
        AdoptionRecord(
            company_id=pkg.company_id,
            project_id=pkg.project_id,
            node_id=pkg.node_id,
            evidence_package_id=pkg.id,
            progress_record_id=progress_record_id,
            decision="adopted",
            reason=final_reason,
            in_wiki=in_wiki,
        )
    )
    db.add(
        AuditLog(
            company_id=pkg.company_id,
            project_id=pkg.project_id,
            actor_user_id=reviewer_user_id,
            action="evidence.review",
            resource_type="evidence_package",
            resource_id=str(pkg.id),
            detail_json={
                "decision": "adopted",
                "reason": final_reason,
                "progress_record_id": progress_record_id,
            },
        )
    )
    await db.flush()
    return pkg


async def reject_evidence_package(
    db: AsyncSession,
    *,
    package_id: int,
    reviewer_user_id: int,
    reason: str | None = None,
) -> EvidencePackage:
    pkg = await db.get(EvidencePackage, package_id)
    if not pkg:
        raise ValueError("package_not_found")
    node = await db.get(TreeNode, pkg.node_id)
    if not node:
        raise ValueError("node_not_found")

    final_reason = reason or (pkg.judge_result_json or {}).get("reason")
    pkg.status = "rejected"
    db.add(
        ReviewCase(
            company_id=pkg.company_id,
            project_id=pkg.project_id,
            node_id=pkg.node_id,
            case_type="rejection_review",
            status="open",
            opener_user_id=pkg.submitter_user_id,
            evidence_package_id=pkg.id,
            summary_text=final_reason,
        )
    )
    notify = NotificationService()
    await notify.enqueue(
        db,
        company_id=pkg.company_id,
        user_ids=[pkg.submitter_user_id],
        template_key="evidence.rejected",
        payload={
            "package_id": pkg.id,
            "node_title": node.title if node else "",
            "node_id": pkg.node_id,
            "reason": final_reason or "",
        },
        channels=["in_app", "wechat", "email"],
        project_id=pkg.project_id,
    )
    db.add(
        AdoptionRecord(
            company_id=pkg.company_id,
            project_id=pkg.project_id,
            node_id=pkg.node_id,
            evidence_package_id=pkg.id,
            progress_record_id=None,
            decision="rejected",
            reason=final_reason,
            in_wiki=False,
        )
    )
    db.add(
        AuditLog(
            company_id=pkg.company_id,
            project_id=pkg.project_id,
            actor_user_id=reviewer_user_id,
            action="evidence.review",
            resource_type="evidence_package",
            resource_id=str(pkg.id),
            detail_json={
                "decision": "rejected",
                "reason": final_reason,
            },
        )
    )
    await db.flush()
    return pkg
