"""存量 wiki 条目补切块进 knowledge_chunks（幂等，可重跑）。

用法：
    cd backend && python scripts/backfill_knowledge_chunks.py

索引器语义是「先删该来源旧块再全量重建」，重跑不会产生重复块。
运行前请确保库已迁移到 head（alembic upgrade head）。
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.db.session import async_session_factory  # noqa: E402
from app.models.wiki import ProjectWikiEntry  # noqa: E402
from app.services.knowledge.indexer import index_wiki_entry  # noqa: E402


async def main() -> None:
    entries_total = 0
    chunks_total = 0
    failed: list[tuple[int, str]] = []

    async with async_session_factory() as db:
        entries = (await db.execute(select(ProjectWikiEntry))).scalars().all()
        for entry in entries:
            entries_total += 1
            try:
                chunks_total += await index_wiki_entry(db, entry)
                await db.commit()  # 逐条提交，避免后续失败回滚时丢掉已成功条目
            except Exception as exc:  # 单条失败不阻断其余条目
                failed.append((entry.id, str(exc)))
                await db.rollback()  # 恢复会话可用状态，继续处理后续条目

    print(f"[backfill] wiki 条目 {entries_total} 条，写入知识块 {chunks_total} 个")
    if failed:
        print(f"[backfill] 失败 {len(failed)} 条：")
        for entry_id, err in failed:
            print(f"  - wiki_entry id={entry_id}: {err}")


if __name__ == "__main__":
    asyncio.run(main())
