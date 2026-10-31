"""通知通道发送（开发桩 + 复用现有工具）"""
import html
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notify import CollabInboxMessage

logger = logging.getLogger(__name__)

TEMPLATES = {
    "evidence.adopted": "你的材料「{node_title}」已采纳，正式进度已更新。",
    "evidence.rejected": "你的材料「{node_title}」未采纳：{reason}",
    "progress.auto_write_alert": "节点「{node_title}」在 1 小时内自动写入进度次数过多，请关注。",
    "review.awaiting_pm": "有复核待你确认：{summary}",
    "auth.welcome": "欢迎加入 {company_name}！请使用账号 {username} 登录 {app_url}。",
    "agent.report.submitted": "项目 {project_id} 收到下属智能体汇报：{summary}",
    "project.report.aggregated": "项目 {project_id} 已汇总 {report_count} 份智能体汇报。",
}


def render_template(template_key: str, payload: dict[str, Any]) -> str:
    tpl = TEMPLATES.get(template_key, "{template_key}")
    try:
        return tpl.format(template_key=template_key, **{k: (v if v is not None else "") for k, v in payload.items()})
    except Exception:
        return f"{template_key}: {payload}"


async def send_in_app(
    db: AsyncSession,
    *,
    company_id: int,
    user_id: int,
    template_key: str,
    payload: dict,
    sender_user_id: int | None = None,
    recipient_user_ids: list[int] | None = None,
    attachments: list[dict] | None = None,
    requires_reply: bool = False,
) -> bool:
    body = render_template(template_key, payload)
    db.add(
        CollabInboxMessage(
            company_id=company_id,
            user_id=user_id,
            template_key=template_key,
            payload_json=payload,
            body_text=body,
            is_read=False,
            sender_user_id=sender_user_id,
            recipient_user_ids=list(recipient_user_ids or [user_id]),
            attachments_json=list(attachments or []),
            requires_reply=requires_reply,
        )
    )
    await db.flush()
    return True


def smtp_configured() -> bool:
    """兼容旧调用：仅看环境变量。完整解析请用 resolve_smtp。"""
    from app.services.smtp_settings import smtp_from_env

    r = smtp_from_env()
    return bool(r and r.is_complete())


async def send_email_channel(
    user,
    template_key: str,
    payload: dict,
    *,
    db: AsyncSession | None = None,
    company_id: int | None = None,
) -> bool:
    """发送邮件：用户 SMTP > 公司 SMTP > 环境变量。

    - 已配置：调用真实 _send_smtp
    - 未配置 + DEBUG/测试：dry-run 返回 True
    - 未配置 + 生产：记 error 返回 False
    """
    body = render_template(template_key, payload)
    email = getattr(user, "email", None) if user else None
    if not email:
        logger.info("[notify.email] skip no email user template=%s", template_key)
        return True
    try:
        from app.core.config import settings
        from app.services.smtp_settings import resolve_smtp
        from app.utils.email import _send_smtp

        resolved = await resolve_smtp(db, user=user, company_id=company_id)
        if not resolved or not resolved.is_complete():
            if settings.DEBUG:
                logger.info(
                    "[notify.email] SMTP not configured, dry-run to %s: %s", email, body
                )
                return True
            logger.error(
                "[notify.email] SMTP not configured in production; skip send to %s template=%s",
                email,
                template_key,
            )
            return False
        safe_html = html.escape(body)
        ok = bool(
            _send_smtp(
                to_email=email,
                from_addr=resolved.from_addr or resolved.user,
                subject=f"[WorkTodo] {template_key}",
                text_body=body,
                html_body=f"<p>{safe_html}</p>",
                smtp_host=resolved.host,
                smtp_port=int(resolved.port or 465),
                smtp_user=resolved.user,
                smtp_password=resolved.password,
            )
        )
        if ok:
            logger.info(
                "[notify.email] sent via %s to %s template=%s",
                resolved.source,
                email,
                template_key,
            )
        return ok
    except Exception as e:
        logger.warning("[notify.email] failed: %s", e)
        return False


async def send_welcome_email(
    user,
    *,
    company_name: str = "",
    company_slug: str = "",
    db: AsyncSession | None = None,
    company_id: int | None = None,
) -> bool:
    """注册欢迎信：优先公司/用户前端 SMTP。"""
    from app.core.config import settings

    if not getattr(user, "email", None):
        return True
    payload = {
        "company_name": company_name or company_slug or "公司",
        "username": getattr(user, "username", "") or "",
        "app_url": settings.APP_URL or "http://localhost",
    }
    return await send_email_channel(
        user, "auth.welcome", payload, db=db, company_id=company_id
    )


async def send_wechat_channel(user, template_key: str, payload: dict) -> bool:
    """微信订阅/客服消息桩"""
    body = render_template(template_key, payload)
    logger.info(
        "[notify.wechat] dry-run user=%s template=%s body=%s",
        getattr(user, "id", None),
        template_key,
        body,
    )
    return True


async def send_sms_channel(user, template_key: str, payload: dict) -> bool:
    logger.info("[notify.sms] not implemented template=%s", template_key)
    return False
