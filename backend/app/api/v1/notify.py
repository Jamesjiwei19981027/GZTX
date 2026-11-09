"""通知可靠性：发送记录查询 + 各渠道测试发送。"""
import asyncio
from typing import Literal, Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.core.config import settings
from app.core.dependencies import CurrentUser, DbSession
from app.models.notify import CollabInboxMessage, NotificationRecord
from app.models.task import Task
from app.schemas.common import ResponseData

router = APIRouter(prefix="/notify", tags=["通知可靠性"])


class TestSendBody(BaseModel):
    channel: Literal["email", "webpush", "in_app"]


async def _serialize_records(db, rows, user_names: dict[int, str] | None = None) -> list[dict]:
    task_ids = {r.task_id for r in rows if r.task_id is not None}
    titles: dict[int, str] = {}
    if task_ids:
        pairs = await db.execute(
            select(Task.id, Task.title).where(Task.id.in_(task_ids))
        )
        titles = dict(pairs.all())
    items = []
    for r in rows:
        item = {
            "id": r.id,
            "channel": r.channel,
            "status": r.status,
            "error": r.error,
            "task_id": r.task_id,
            "task_title": titles.get(r.task_id) if r.task_id else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        if user_names is not None:
            item["user_id"] = r.user_id
            item["user_name"] = user_names.get(r.user_id)
        items.append(item)
    return items


@router.get("/records", response_model=ResponseData)
async def get_notification_records(
    db: DbSession,
    user: CurrentUser,
    limit: int = Query(50, ge=1, le=200),
):
    """当前用户最近的通知发送记录（失败带原因，附任务标题若有）。只含本人。"""
    rows = (
        await db.execute(
            select(NotificationRecord)
            .where(NotificationRecord.user_id == user.id)
            .order_by(NotificationRecord.id.desc())
            .limit(limit)
        )
    ).scalars().all()
    return ResponseData(data={"items": await _serialize_records(db, rows)})


@router.get("/company-records", response_model=ResponseData)
async def get_company_notification_records(
    db: DbSession,
    user: CurrentUser,
    company_id: int = Query(..., ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    """全公司最近的通知发送记录：仅该公司超级管理员可看，按公司成员过滤。"""
    from app.core.collab_errors import CollabError
    from app.models.company import CompanyMembership
    from app.models.user import User

    me = (
        await db.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == company_id,
                CompanyMembership.user_id == user.id,
                CompanyMembership.status == "active",
            )
        )
    ).scalar_one_or_none()
    if not me:
        raise CollabError(403, 40302, "非本公司成员")
    if not me.is_super_admin:
        raise CollabError(403, 40303, "需要公司超级管理员")

    member_ids = select(CompanyMembership.user_id).where(
        CompanyMembership.company_id == company_id,
        CompanyMembership.status == "active",
    )
    rows = (
        await db.execute(
            select(NotificationRecord)
            .where(NotificationRecord.user_id.in_(member_ids))
            .order_by(NotificationRecord.id.desc())
            .limit(limit)
        )
    ).scalars().all()
    uids = {r.user_id for r in rows}
    names: dict[int, str] = {}
    if uids:
        for uid, nick, uname in (
            await db.execute(select(User.id, User.nickname, User.username).where(User.id.in_(uids)))
        ).all():
            names[uid] = nick or uname
    return ResponseData(data={"items": await _serialize_records(db, rows, names)})


async def _test_send_email(db, user) -> tuple[bool, Optional[str]]:
    if not user.email:
        return False, "尚未设置邮箱地址，请先在个人资料中填写邮箱"
    if settings.REGISTER_VERIFICATION_REQUIRED and not user.email_verified:
        return False, "邮箱尚未完成验证，请先验证邮箱"

    from app.services.smtp_settings import resolve_smtp
    from app.utils.email import _send_smtp

    resolved = await resolve_smtp(db, user=user)
    if not resolved or not resolved.is_complete():
        return False, "SMTP 未配置：请在「设置 → 邮件」或「公司设置 → SMTP」中填写主机/账号/密码"

    user_name = user.nickname or user.username
    subject = "WorkTodo - 测试通知"
    text_body = f"Hi {user_name}，这是一封测试邮件：邮件提醒通道工作正常。"
    html_body = (
        f"<p>Hi {user_name}，</p>"
        "<p>这是一封测试邮件：<strong>邮件提醒通道工作正常</strong>。</p>"
        "<p>您将通过该邮箱收到任务到期提醒、逾期警告与每日摘要。</p>"
    )

    # 阻塞式 SMTP 必须挪出事件循环
    ok = await asyncio.to_thread(
        _send_smtp,
        to_email=user.email,
        from_addr=resolved.from_addr,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
        smtp_host=resolved.host,
        smtp_port=resolved.port,
        smtp_user=resolved.user,
        smtp_password=resolved.password,
    )
    if ok:
        return True, None
    return False, "邮件发送失败：请检查 SMTP 服务器地址、端口、账号密码是否正确"


async def _test_send_webpush(db, user) -> tuple[bool, Optional[str]]:
    from app.models.notify import PushSubscription
    from app.utils.web_push import send_web_push

    # 订阅存在性走异步会话查库（DB 是订阅的唯一真源）
    subscribed = (
        await db.execute(
            select(PushSubscription.id)
            .where(PushSubscription.user_id == user.id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if subscribed is None:
        return False, "尚未订阅浏览器推送，请先在浏览器中允许通知权限"

    ok = await asyncio.to_thread(
        send_web_push,
        user,
        "WorkTodo - 测试通知",
        "浏览器推送通道工作正常，任务提醒将以此方式送达。",
        "/settings",
        1,
    )
    if ok:
        return True, None
    return False, "推送发送失败：请检查 VAPID 配置是否正确"


@router.post("/test-send", response_model=ResponseData)
async def test_send(data: TestSendBody, db: DbSession, user: CurrentUser):
    """立即向当前用户发一条测试通知，同步返回成败与原因，并写入发送记录。"""
    from app.services.rate_limit import enforce_test_send

    await enforce_test_send(db, user.id)
    if data.channel == "in_app":
        from app.models.company import CompanyMembership

        company_id = await db.scalar(select(CompanyMembership.company_id).where(
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == 'active',
            CompanyMembership.employment_status == 'active',
        ).order_by(CompanyMembership.id).limit(1))
        # 无企业的个人账号也可测试本人通知；0 不对应任何企业，不参与协作授权。
        db.add(CollabInboxMessage(
            company_id=company_id or 0, user_id=user.id,
            template_key='notification.test',
            payload_json={'title': '测试通知', 'text': '这是一条测试通知，站内通知通道工作正常。'},
            body_text='这是一条测试通知，站内通知通道工作正常。',
            recipient_user_ids=[user.id], is_read=False,
        ))
        ok, error = True, None
    elif data.channel == "email":
        ok, error = await _test_send_email(db, user)
    else:
        ok, error = await _test_send_webpush(db, user)

    db.add(
        NotificationRecord(
            user_id=user.id,
            channel=data.channel,
            status="sent" if ok else "failed",
            error=error if not ok else None,
        )
    )

    return ResponseData(data={"ok": ok, "error": error})
