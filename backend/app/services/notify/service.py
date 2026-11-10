"""统一入队 notify_jobs"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notify import NotifyJob, NotifyPolicy

DEFAULT_CHANNELS = ["in_app", "wechat", "email", "push"]


class NotificationService:
    async def enqueue(
        self,
        db: AsyncSession,
        *,
        company_id: int,
        user_ids: list[int],
        template_key: str,
        payload: dict,
        channels: list[str] | None = None,
        project_id: int | None = None,
    ) -> list[int]:
        if project_id is not None and "project_id" not in (payload or {}):
            payload = {**(payload or {}), "project_id": project_id}  # 前端据此跳转到对应项目
        chs = channels
        if chs is None:
            # resolve policy
            q = await db.execute(
                select(NotifyPolicy).where(
                    NotifyPolicy.company_id == company_id,
                    NotifyPolicy.event_key == template_key,
                    NotifyPolicy.enabled.is_(True),
                )
            )
            policies = list(q.scalars().all())
            # prefer project-specific
            chosen = None
            if project_id is not None:
                for p in policies:
                    if p.project_id == project_id:
                        chosen = p
                        break
            if chosen is None:
                for p in policies:
                    if p.project_id is None:
                        chosen = p
                        break
            chs = list(chosen.channels_json) if chosen and chosen.channels_json else list(DEFAULT_CHANNELS)

        # 既有业务显式列出 in_app/email 的调用同样获得系统推送伴随通道。
        # 只发邮件等非站内任务不额外推送；用户级开关仍在入队/消费时复查。
        chs = list(chs)
        if 'in_app' in chs and 'push' not in chs:
            chs.append('push')
        # sms reserved: skip actual unless explicitly only
        job_ids: list[int] = []
        for uid in user_ids:
            for ch in chs:
                if ch == "push":
                    from app.core.config import settings
                    from app.models.user import User
                    from app.services.notify_pref_gate import channel_enabled
                    if not settings.jpush_enabled:
                        continue
                    user = await db.get(User, uid)
                    if not user or not user.is_active or not channel_enabled(user.notify_pref, 'push'):
                        continue
                job = NotifyJob(
                    company_id=company_id,
                    user_id=uid,
                    channel=ch,
                    template_key=template_key,
                    payload_json=payload or {},
                    status="pending",
                )
                db.add(job)
                await db.flush()
                job_ids.append(job.id)
        return job_ids
