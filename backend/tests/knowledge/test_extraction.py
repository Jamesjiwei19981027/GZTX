"""抽取管线 + worker + 判定接入（阶段 2）

覆盖：off 模式行为不变 · sync 模式 txt 正文进判定与 chunk · 未采纳无 chunk ·
不支持格式 skipped 不阻断 · worker 领取-抽取-判定链路 · 采纳先于抽取的竞态补索引。
复用 tests/knowledge/conftest.py 的内存库基座（外键约束关闭，可直插关联行）。
"""
import uuid

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.company import Company
from app.models.evidence import AsyncJob
from app.models.knowledge import EvidenceFileText, KnowledgeChunk
from app.models.tree import TreeNode, default_progress_json
from app.services import evidence_service as evidence_service_module
from app.services.evidence_judge import JudgeResult, RuleBasedEvidenceJudge
from app.services.evidence_service import (
    adopt_evidence_package,
    reject_evidence_package,
    run_evidence_judge,
    save_upload_file,
    submit_evidence,
)
from app.services.extraction.router import route_engine
from app.services.extraction.service import extract_package
from app.services.knowledge.search import search_chunks
from app.workers.extractor import process_next_job

TXT_BODY = "上线前必须完成数据库迁移与冒烟测试。\n负责人已确认部署窗口为周五晚。"


@pytest.fixture(autouse=True)
def _storage_root(tmp_path, monkeypatch):
    """材料文件落临时目录，避免测试污染仓库 data/objects。"""
    monkeypatch.setattr(settings, "COLLAB_OBJECT_ROOT", str(tmp_path / "objects"))


async def _seed(db):
    company = Company(
        name="抽取测试公司",
        slug=f"ext-{uuid.uuid4().hex[:8]}",
        status="active",
        policy_json={},
        entitlement_json={},
    )
    db.add(company)
    await db.flush()
    node = TreeNode(
        company_id=company.id,
        project_id=1,
        node_type_id=1,
        title="工作项A",
        path="/",
        depth=0,
        progress_json=default_progress_json("work_item"),
    )
    db.add(node)
    await db.flush()
    return company, node


async def _upload(db, *, company, filename, content, mime, user_id=1):
    return await save_upload_file(
        db,
        user_id=user_id,
        filename=filename,
        content=content,
        mime_type=mime,
        company_id=company.id,
        project_id=1,
    )


async def _submit(db, *, node, file_ids=None, summary="进度已完成一半，附材料"):
    return await submit_evidence(
        db,
        node=node,
        user_id=1,
        summary_text=summary,
        structured=None,
        links=None,
        file_ids=file_ids,
    )


async def _get_eft(db, evidence_file_id):
    return (
        await db.execute(
            select(EvidenceFileText).where(
                EvidenceFileText.evidence_file_id == evidence_file_id
            )
        )
    ).scalar_one_or_none()


async def _chunks_for_file(db, evidence_file_id):
    return (
        (
            await db.execute(
                select(KnowledgeChunk).where(
                    KnowledgeChunk.source_type == "evidence_file",
                    KnowledgeChunk.source_id == evidence_file_id,
                )
            )
        )
        .scalars()
        .all()
    )


def test_route_engine_mapping():
    assert route_engine("说明.txt", "text/plain") == "plain"
    assert route_engine("report.docx", None) == "markitdown"
    assert route_engine("扫描件.pdf", "application/pdf") == "docling"
    assert route_engine("photo.jpg", "image/jpeg") == "docling"
    assert route_engine("老文档.doc", "application/msword") == "libreoffice"
    # 扩展名不认识时看 mime；都不认识 → skipped
    assert route_engine("noext", "text/x-python") == "plain"
    assert route_engine("firmware.bin", "application/octet-stream") == "skipped"


async def test_off_mode_behaves_like_before(db_session):
    """EXTRACTION_MODE=off（默认）：不建 extract job、无 EvidenceFileText、判定照旧。"""
    assert (settings.EXTRACTION_MODE or "off").lower() == "off"
    company, node = await _seed(db_session)
    ef = await _upload(
        db_session,
        company=company,
        filename="说明.txt",
        content=TXT_BODY.encode("utf-8"),
        mime="text/plain",
    )
    pkg, job = await _submit(db_session, node=node, file_ids=[ef.id])

    extract_jobs = (
        (
            await db_session.execute(
                select(AsyncJob).where(AsyncJob.job_type == "evidence.extract")
            )
        )
        .scalars()
        .all()
    )
    assert extract_jobs == []

    await run_evidence_judge(db_session, job.id)
    assert pkg.status == "pending_review"
    assert job.status == "succeeded"
    assert await _get_eft(db_session, ef.id) is None
    assert await _chunks_for_file(db_session, ef.id) == []


async def test_sync_mode_txt_extract_judge_and_chunks(db_session, monkeypatch):
    """sync 模式：txt 抽取 succeeded → 正文进 files_texts → 采纳后 chunk 可召回。"""
    monkeypatch.setattr(settings, "EXTRACTION_MODE", "sync")
    company, node = await _seed(db_session)
    ef = await _upload(
        db_session,
        company=company,
        filename="部署说明.txt",
        content=TXT_BODY.encode("utf-8"),
        mime="text/plain",
    )

    captured: dict = {}

    class SpyJudge(RuleBasedEvidenceJudge):
        def judge(self, *, package, node_progress, files_count=0, files_texts=None):
            captured["files_texts"] = files_texts
            return super().judge(
                package=package,
                node_progress=node_progress,
                files_count=files_count,
                files_texts=files_texts,
            )

    monkeypatch.setattr(
        evidence_service_module, "get_judge", lambda *, prefer_llm=False: SpyJudge()
    )

    pkg, job = await _submit(db_session, node=node, file_ids=[ef.id])
    # 模拟端点 sync 分支：请求内先抽取再内联判定
    await extract_package(db_session, pkg.id)
    await run_evidence_judge(db_session, job.id)

    eft = await _get_eft(db_session, ef.id)
    assert eft is not None and eft.status == "succeeded"
    assert eft.extractor == "plain"
    assert "数据库迁移" in (eft.text_md or "")

    assert captured["files_texts"], "判定器应收到抽取正文"
    assert captured["files_texts"][0]["name"] == ef.original_name
    assert "数据库迁移" in captured["files_texts"][0]["text"]

    assert pkg.status == "pending_review"
    await adopt_evidence_package(db_session, package_id=pkg.id, reviewer_user_id=1)
    assert pkg.status == "adopted"
    assert await _chunks_for_file(db_session, ef.id), "采纳后应有知识块"
    results = await search_chunks(
        db_session, company_id=company.id, project_id=1, query="数据库迁移"
    )
    assert any(
        r["source_type"] == "evidence_file" and r["source_id"] == ef.id
        for r in results
    ), "search_chunks 应能召回材料正文"


async def test_rejected_package_text_persisted_but_no_chunk(db_session, monkeypatch):
    """未采纳：正文已持久化（证据域），但不进检索层；空材料拒绝路径不受抽取影响。"""
    monkeypatch.setattr(settings, "EXTRACTION_MODE", "sync")
    company, node = await _seed(db_session)
    ef = await _upload(
        db_session,
        company=company,
        filename="材料.txt",
        content=TXT_BODY.encode("utf-8"),
        mime="text/plain",
    )

    class RejectJudge(RuleBasedEvidenceJudge):
        def judge(self, *, package, node_progress, files_count=0, files_texts=None):
            return JudgeResult(
                decision="rejected",
                reason="测试：强制拒绝",
                progress_after=dict(node_progress or {}),
            )

    monkeypatch.setattr(
        evidence_service_module, "get_judge", lambda *, prefer_llm=False: RejectJudge()
    )
    pkg, job = await _submit(db_session, node=node, file_ids=[ef.id])
    await extract_package(db_session, pkg.id)
    await run_evidence_judge(db_session, job.id)

    eft = await _get_eft(db_session, ef.id)
    assert eft is not None and eft.status == "succeeded", "正文抽取结果应持久化"
    assert pkg.status == "pending_review"
    await reject_evidence_package(db_session, package_id=pkg.id, reviewer_user_id=1)
    assert pkg.status == "rejected"
    assert await _chunks_for_file(db_session, ef.id) == [], "未采纳不得入检索层"

    # 空材料拒绝路径：无附件包直接拒绝，抽取环节零参与
    monkeypatch.setattr(
        evidence_service_module,
        "get_judge",
        lambda *, prefer_llm=False: RuleBasedEvidenceJudge(),
    )
    pkg2, job2 = await _submit(db_session, node=node, file_ids=None, summary=None)
    await extract_package(db_session, pkg2.id)
    await run_evidence_judge(db_session, job2.id)
    assert pkg2.status == "pending_review"
    await reject_evidence_package(db_session, package_id=pkg2.id, reviewer_user_id=1)
    assert pkg2.status == "rejected"
    assert (
        await db_session.execute(select(KnowledgeChunk))
    ).scalars().all() == []


async def test_unsupported_format_skipped_and_judge_unblocked(db_session, monkeypatch):
    """不支持格式（.bin）→ skipped；判定流程照常完成。"""
    monkeypatch.setattr(settings, "EXTRACTION_MODE", "sync")
    company, node = await _seed(db_session)
    ef = await _upload(
        db_session,
        company=company,
        filename="firmware.bin",
        content=b"\x00\x01\x02\xff\xfe",
        mime="application/octet-stream",
    )
    pkg, job = await _submit(db_session, node=node, file_ids=[ef.id], summary="固件已烧录")
    stats = await extract_package(db_session, pkg.id)
    assert stats["skipped"] == 1
    await run_evidence_judge(db_session, job.id)

    eft = await _get_eft(db_session, ef.id)
    assert eft is not None and eft.status == "skipped"
    assert job.status == "succeeded"
    assert pkg.status == "pending_review"
    await adopt_evidence_package(db_session, package_id=pkg.id, reviewer_user_id=1)
    assert pkg.status == "adopted"
    assert await _chunks_for_file(db_session, ef.id) == [], "无正文不入检索层"


async def test_worker_chain_extract_then_judge(db_session, monkeypatch):
    """worker 链路：extract job 领取 → 抽取 → 链式判定 → 包状态正确（函数级，不起真进程）。"""
    monkeypatch.setattr(settings, "EXTRACTION_MODE", "worker")
    company, node = await _seed(db_session)
    ef = await _upload(
        db_session,
        company=company,
        filename="部署说明.txt",
        content=TXT_BODY.encode("utf-8"),
        mime="text/plain",
    )
    pkg, judge_job = await _submit(db_session, node=node, file_ids=[ef.id])

    extract_job = (
        await db_session.execute(
            select(AsyncJob).where(AsyncJob.job_type == "evidence.extract")
        )
    ).scalar_one()
    assert extract_job.payload_json == {
        "package_id": pkg.id,
        "judge_job_id": judge_job.id,
    }
    assert judge_job.status == "pending", "worker 模式提交后判定不内联"
    await db_session.commit()

    assert await process_next_job(db_session) is True

    assert extract_job.status == "succeeded"
    assert judge_job.status == "succeeded"
    assert pkg.status == "pending_review"
    await adopt_evidence_package(db_session, package_id=pkg.id, reviewer_user_id=1)
    assert pkg.status == "adopted"
    eft = await _get_eft(db_session, ef.id)
    assert eft is not None and eft.status == "succeeded"
    assert await _chunks_for_file(db_session, ef.id), "worker 链路采纳后应入检索层"

    # 队列已空：再领一次应返回 False
    assert await process_next_job(db_session) is False


async def test_extract_after_adopt_backfills_chunks(db_session, monkeypatch):
    """竞态：判定采纳先于抽取完成时，extract_package 结束后补索引。"""
    monkeypatch.setattr(settings, "EXTRACTION_MODE", "worker")
    company, node = await _seed(db_session)
    ef = await _upload(
        db_session,
        company=company,
        filename="部署说明.txt",
        content=TXT_BODY.encode("utf-8"),
        mime="text/plain",
    )
    pkg, judge_job = await _submit(db_session, node=node, file_ids=[ef.id])

    # 判定先完成（此时尚无正文，files_texts 为空）
    await run_evidence_judge(db_session, judge_job.id)
    assert pkg.status == "pending_review"
    await adopt_evidence_package(db_session, package_id=pkg.id, reviewer_user_id=1)
    assert pkg.status == "adopted"
    assert await _chunks_for_file(db_session, ef.id) == []

    stats = await extract_package(db_session, pkg.id)
    assert stats["indexed_after_adopt"] == 1
    assert await _chunks_for_file(db_session, ef.id), "抽取完成后应补索引"
