"""复用单进程 APScheduler 的持久化审计队列。"""
import asyncio
from datetime import datetime, timezone
import logging

from sqlalchemy import select, update

from app.db.session import async_session_factory
from app.models.audit_run import AuditRun
from app.services.axis_audit import complete_audit

logger = logging.getLogger(__name__)


async def fail_audit(audit_id, reason):
    async with async_session_factory() as db:
        row = await db.get(AuditRun, audit_id, with_for_update=True)
        if row and row.status == 'running':
            result = dict(row.result_json)
            result.pop('_job', None)
            result.update(fallback_reason=reason, mode_message=reason)
            row.result_json = result
            row.status, row.mode, row.finished_at = 'failed', 'rule', datetime.now(timezone.utc)
            await db.commit()


async def recover_interrupted_audits():
    """仅调度所有者启动时运行；普通 Web worker 不清理别人的运行。"""
    async with async_session_factory() as db:
        ids = list((await db.scalars(select(AuditRun.id).where(AuditRun.status == 'running'))).all())
    for audit_id in ids:
        await fail_audit(audit_id, '服务已重启，本次 AI 审计已中断，以下保留规则检查，请重新发起审计')
    return len(ids)


async def _execute(audit_id):
    try:
        async with async_session_factory() as db:
            claimed = await db.execute(update(AuditRun).where(AuditRun.id == audit_id,
                AuditRun.status == 'running', AuditRun.started_at.is_(None))
                .values(started_at=datetime.now(timezone.utc)))
            await db.commit()
            if not claimed.rowcount:
                return
            await complete_audit(db, audit_id)
    except asyncio.CancelledError:
        await fail_audit(audit_id, '服务正在关闭，本次 AI 审计已中断，以下保留规则检查，请重新发起审计')
        raise
    except Exception:
        # 不把供应商错误、配置或材料写入日志/客户端。
        logger.warning('axis audit background failed audit=%s', audit_id)
        await fail_audit(audit_id, '审计权限已变化或后台任务中断，已丢弃 AI 结果，以下保留规则检查，请重新发起审计')


async def process_pending_audits():
    async with async_session_factory() as db:
        ids = list((await db.scalars(select(AuditRun.id).where(AuditRun.status == 'running',
            AuditRun.started_at.is_(None)).order_by(AuditRun.id).limit(4))).all())
    await asyncio.gather(*(_execute(audit_id) for audit_id in ids))
