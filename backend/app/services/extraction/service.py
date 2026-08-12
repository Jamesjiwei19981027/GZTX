"""抽取服务：extract_package 遍历包内文件写 evidence_file_texts

事务约定与 knowledge.indexer 一致：只 flush 不 commit，由调用方
（sync 模式的请求事务 / worker 的单任务事务）统一提交。

幂等：已 succeeded 的文件跳过；failed/skipped 重跑会再试（复核重判场景）。
竞态补索引：抽取晚于采纳完成时（worker 模式判定先走完），包若已 adopted
则把成功正文直接补进知识块，保证「采纳即可检索」不因抽取时序丢失。
"""
from __future__ import annotations

import time
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.evidence import EvidenceFile, EvidencePackage
from app.models.knowledge import EvidenceFileText
from app.services.extraction.engines import run_engine
from app.services.extraction.router import ENGINE_SKIPPED, route_engine
from app.services.knowledge.indexer import index_evidence_file
from app.services.storage.router import StorageRouter


async def extract_package(db: AsyncSession, package_id: int) -> dict:
    """抽取一个材料包内全部文件，返回统计 {total, succeeded, failed, skipped}。"""
    pkg = await db.get(EvidencePackage, package_id)
    if not pkg:
        raise ValueError("package_not_found")
    company = await db.get(Company, pkg.company_id)
    if not company:
        raise ValueError("company_not_found")
    storage = await StorageRouter().for_company(db, company)

    files = (
        (
            await db.execute(
                select(EvidenceFile).where(EvidenceFile.package_id == pkg.id)
            )
        )
        .scalars()
        .all()
    )
    stats = {
        "package_id": pkg.id,
        "total": len(files),
        "succeeded": 0,
        "failed": 0,
        "skipped": 0,
    }

    for ef in files:
        eft = (
            await db.execute(
                select(EvidenceFileText).where(
                    EvidenceFileText.evidence_file_id == ef.id
                )
            )
        ).scalar_one_or_none()
        if eft and eft.status == "succeeded":
            # 幂等：已成功的不重抽
            stats["succeeded"] += 1
            continue
        if eft is None:
            eft = EvidenceFileText(
                evidence_file_id=ef.id,
                company_id=ef.company_id or pkg.company_id,
                project_id=ef.project_id or pkg.project_id,
                status="pending",
            )
            db.add(eft)
        eft.status = "extracting"
        eft.error_message = None
        await db.flush()

        started = time.monotonic()
        try:
            engine = route_engine(ef.original_name, ef.mime_type)
            if engine == ENGINE_SKIPPED:
                eft.status = "skipped"
                eft.extractor = None
                eft.text_md = None
                eft.meta_json = {"skipped_reason": "unsupported_format"}
                stats["skipped"] += 1
            else:
                content = await storage.get(ef.storage_key)
                text_md, meta = run_engine(engine, content, ef.original_name)
                meta["elapsed_ms"] = int((time.monotonic() - started) * 1000)
                eft.extractor = meta.get("extractor") or engine
                eft.meta_json = meta
                if text_md is None:
                    # 引擎判定不可处理（如 LibreOffice 未装）
                    eft.status = "skipped"
                    eft.text_md = None
                    stats["skipped"] += 1
                else:
                    eft.status = "succeeded"
                    eft.text_md = text_md
                    stats["succeeded"] += 1
        except Exception as e:  # noqa: BLE001 — 单文件失败不阻断整包与判定主流程
            eft.status = "failed"
            eft.error_message = str(e)[:2000]
            eft.meta_json = {
                **(eft.meta_json or {}),
                "elapsed_ms": int((time.monotonic() - started) * 1000),
            }
            stats["failed"] += 1
        eft.extracted_at = datetime.now(timezone.utc)
        await db.flush()

    # 竞态补索引：包已被采纳（判定先于抽取完成）时，把成功正文补进知识块
    if pkg.status == "adopted":
        indexed = 0
        for ef in files:
            eft = (
                await db.execute(
                    select(EvidenceFileText).where(
                        EvidenceFileText.evidence_file_id == ef.id,
                        EvidenceFileText.status == "succeeded",
                    )
                )
            ).scalar_one_or_none()
            if eft and (eft.text_md or "").strip():
                await index_evidence_file(db, ef, eft.text_md, node_id=pkg.node_id)
                indexed += 1
        stats["indexed_after_adopt"] = indexed

    return stats
