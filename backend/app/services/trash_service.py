"""回收站物理清理：软删超过保留期的任务连同附属数据一并删除。

用 Core 级批量 delete 而非 ORM 级联：调度器在 async 会话里跑，ORM 删除会
触发关系懒加载（attachments 等未配 selectin）直接 MissingGreenlet。
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.attachment import Attachment
from app.models.email_reply_record import EmailReplyRecord
from app.models.recurring_instance import RecurringInstance
from app.models.reminder import Reminder
from app.models.tag import task_tags
from app.models.task import Task
from app.models.task_assignment import TaskAssignment

logger = logging.getLogger(__name__)

TRASH_RETENTION_DAYS = 30


async def purge_soft_deleted_tasks(
    db: AsyncSession, older_than_days: int = TRASH_RETENTION_DAYS
) -> int:
    """物理删除软删超过 older_than_days 天的任务，返回删除条数（不提交）。"""
    cutoff = datetime.utcnow() - timedelta(days=older_than_days)
    ids = (
        await db.execute(
            select(Task.id).where(
                Task.is_deleted == True,
                Task.deleted_at.isnot(None),
                Task.deleted_at < cutoff,
            )
        )
    ).scalars().all()
    if not ids:
        return 0

    # 附件先删磁盘文件（尽力而为），再删记录
    stored_names = (
        await db.execute(
            select(Attachment.stored_name).where(Attachment.task_id.in_(ids))
        )
    ).scalars().all()
    for name in stored_names:
        try:
            path = os.path.join(settings.UPLOAD_DIR, name)
            if os.path.isfile(path):
                os.remove(path)
        except OSError:
            logger.warning("[TrashPurge] 删除附件文件失败: %s", name)

    await db.execute(delete(Attachment).where(Attachment.task_id.in_(ids)))
    await db.execute(delete(Reminder).where(Reminder.task_id.in_(ids)))
    await db.execute(delete(TaskAssignment).where(TaskAssignment.task_id.in_(ids)))
    await db.execute(
        delete(RecurringInstance).where(RecurringInstance.task_id.in_(ids))
    )
    await db.execute(
        delete(EmailReplyRecord).where(EmailReplyRecord.task_id.in_(ids))
    )
    await db.execute(delete(task_tags).where(task_tags.c.task_id.in_(ids)))
    # 断开子任务（重复实例等）的模板引用，避免外键失败
    await db.execute(
        update(Task)
        .where(Task.parent_task_id.in_(ids))
        .values(parent_task_id=None)
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        delete(Task)
        .where(Task.id.in_(ids))
        .execution_options(synchronize_session=False)
    )
    logger.info("[TrashPurge] 物理删除 %s 条软删任务（>%s 天）", len(ids), older_than_days)
    return len(ids)
