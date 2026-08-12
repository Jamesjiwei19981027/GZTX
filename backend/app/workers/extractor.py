"""材料抽取 worker：`python -m app.workers.extractor`

循环领取 pending 的 evidence.extract AsyncJob：

- 抢占用「UPDATE ... WHERE id=:id AND status='pending'」乐观更新，
  SQLite / PostgreSQL 方言无关（rowcount=0 即被其他 worker 抢走）；
- 抽取完成后链式执行对应的 evidence.judge（提交时一并创建，payload 带 judge_job_id）；
- 任何异常写 job.error_message / status=failed，进程不退出；
- SIGINT / SIGTERM 优雅退出；每个 job 用独立 session（SQLite WAL + 短事务友好）。

测试可直接调用 process_next_job(db) 做单次处理，不必起真进程。
"""
from __future__ import annotations

import asyncio
import logging
import signal
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.evidence import AsyncJob
from app.services.evidence_service import run_evidence_judge
from app.services.extraction.service import extract_package

logger = logging.getLogger("app.workers.extractor")

JOB_TYPE = "evidence.extract"
POLL_INTERVAL_SEC = 2.0


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def claim_next_job(db: AsyncSession) -> int | None:
    """乐观抢占一个 pending 的抽取任务；抢不到（无任务/被抢走）返回 None。"""
    job_id = (
        await db.execute(
            select(AsyncJob.id)
            .where(AsyncJob.job_type == JOB_TYPE, AsyncJob.status == "pending")
            .order_by(AsyncJob.id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if job_id is None:
        return None
    res = await db.execute(
        update(AsyncJob)
        .where(AsyncJob.id == job_id, AsyncJob.status == "pending")
        .values(status="running", started_at=_now())
    )
    await db.commit()
    if res.rowcount != 1:
        return None
    return job_id


async def process_job(db: AsyncSession, job_id: int) -> None:
    """处理一个已抢占的抽取任务：抽取 → 链式判定 → 标记结果。"""
    job = await db.get(AsyncJob, job_id)
    if not job:
        return
    payload = job.payload_json or {}

    # 第一步：抽取（失败则整个 job 标 failed，判定 job 保持 pending 可重试）
    try:
        stats = await extract_package(db, payload.get("package_id"))
        await db.commit()  # 抽取结果先落库，后续判定失败也不丢正文
    except Exception as e:  # noqa: BLE001 — worker 不允许崩进程
        await db.rollback()
        job = await db.get(AsyncJob, job_id)
        if job:
            job.status = "failed"
            job.error_message = str(e)[:2000]
            job.finished_at = _now()
            await db.commit()
        return

    # 第二步：链式判定（judge job 由 submit_evidence 一并创建）
    judge_error = None
    judge_job_id = payload.get("judge_job_id")
    if judge_job_id:
        judge_job = await db.get(AsyncJob, judge_job_id)
        if judge_job and judge_job.status == "pending":
            try:
                await run_evidence_judge(db, judge_job_id)
                await db.commit()
            except Exception as e:  # noqa: BLE001
                # 回滚判定的半成品改动，只保留 judge job 的失败标记
                judge_error = str(e)[:500]
                await db.rollback()
                jj = await db.get(AsyncJob, judge_job_id)
                if jj:
                    jj.status = "failed"
                    jj.error_message = str(e)[:2000]
                    jj.finished_at = _now()
                    await db.commit()

    job = await db.get(AsyncJob, job_id)
    if job:
        job.status = "succeeded"
        result = dict(stats)
        if judge_error:
            result["judge_error"] = judge_error
        job.result_json = result
        job.finished_at = _now()
        await db.commit()


async def process_next_job(db: AsyncSession) -> bool:
    """领取并处理一个任务；无任务可领返回 False。"""
    job_id = await claim_next_job(db)
    if job_id is None:
        return False
    await process_job(db, job_id)
    return True


def _install_signal_handlers(stop: asyncio.Event) -> None:
    loop = asyncio.get_running_loop()

    def _request_stop(*_args) -> None:
        logger.info("收到退出信号，处理完当前任务后退出")
        stop.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _request_stop)
        except (NotImplementedError, RuntimeError):
            # Windows ProactorEventLoop 不支持 add_signal_handler，退回同步注册
            try:
                signal.signal(sig, lambda *_: stop.set())
            except (ValueError, OSError):
                pass


async def run_forever(stop_event: asyncio.Event | None = None) -> None:
    from app.db.session import async_session_factory

    stop = stop_event or asyncio.Event()
    _install_signal_handlers(stop)
    logger.info("extractor worker 启动（轮询间隔 %ss）", POLL_INTERVAL_SEC)
    while not stop.is_set():
        worked = False
        try:
            async with async_session_factory() as db:
                worked = await process_next_job(db)
        except Exception:  # noqa: BLE001 — 单轮异常不崩进程
            logger.exception("extractor 处理任务异常，进程继续")
        if not worked and not stop.is_set():
            try:
                await asyncio.wait_for(stop.wait(), timeout=POLL_INTERVAL_SEC)
            except asyncio.TimeoutError:
                pass
    logger.info("extractor worker 已退出")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    asyncio.run(run_forever())


if __name__ == "__main__":
    main()
