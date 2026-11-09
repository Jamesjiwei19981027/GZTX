"""处理 notify_jobs"""
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notify import NotifyJob
from app.models.user import User
from app.services.notify import channels as ch


async def process_one_job(db: AsyncSession, job_id: int) -> NotifyJob | None:
    job = await db.get(NotifyJob, job_id)
    # processing = 调用方（drain）已原子认领；pending 保留给直接调用的场景
    if not job or job.status not in ("pending", "processing"):
        return job

    user = await db.get(User, job.user_id)
    payload = job.payload_json or {}
    ok = False
    err: str | None = None
    try:
        if job.channel == "in_app":
            ok = await ch.send_in_app(
                db,
                company_id=job.company_id,
                user_id=job.user_id,
                template_key=job.template_key,
                payload=payload,
            )
        elif job.channel == "email":
            ok = await ch.send_email_channel(user, job.template_key, payload, db=db, company_id=job.company_id)
        elif job.channel == "wechat":
            ok = await ch.send_wechat_channel(user, job.template_key, payload)
        elif job.channel == "sms":
            ok = await ch.send_sms_channel(user, job.template_key, payload)
        else:
            err = f"unknown channel: {job.channel}"
            ok = False
    except Exception as e:
        ok = False
        err = str(e)

    if ok:
        job.status = "sent"
        job.sent_at = datetime.now(timezone.utc)
        job.error_message = None
        job.claimed_at = None
    else:
        job.status = "failed"
        job.error_message = err or "send failed"
    await db.flush()
    return job
