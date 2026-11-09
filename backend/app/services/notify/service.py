"""统一入队 notify_jobs"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notify import NotifyJob, NotifyPolicy

DEFAULT_CHANNELS = ["in_app", "wechat", "email"]


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

        # sms reserved: skip actual unless explicitly only
        job_ids: list[int] = []
        for uid in user_ids:
            for ch in chs:
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
