"""Notification API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.core.dependencies import get_db, get_current_user
from app.core.config import settings
from app.models.user import User
from app.schemas.common import ResponseData
from app.models.notify import PushSubscription

router = APIRouter(prefix="/notifications", tags=["通知"])


class SmtpConfigUpdate(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from: Optional[str] = None


class PushSubscriptionBody(BaseModel):
    endpoint: str = Field(..., min_length=8, max_length=2000)
    keys: dict[str, str] = Field(default_factory=dict)
    expirationTime: Optional[int | float] = None


def _subscription_dict(row: PushSubscription) -> dict:
    value = dict(row.subscription_json or {})
    value.setdefault("endpoint", row.endpoint)
    return value


@router.get("/vapid-public-key", response_model=ResponseData)
async def get_vapid_public_key():
    """获取 Web 推送公钥

    Get VAPID public key for Web Push subscription (public endpoint)."""
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": 503, "message": "Web Push 未配置"}
        )
    return ResponseData(data={"publicKey": settings.VAPID_PUBLIC_KEY})


@router.post("/subscribe", response_model=ResponseData)
async def subscribe_push(
    subscription: PushSubscriptionBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """订阅 Web 推送

    Subscribe to Web Push notifications."""
    payload = subscription.model_dump(exclude_none=True)
    endpoint = subscription.endpoint.strip()
    existing = (
        await db.execute(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
    ).scalar_one_or_none()
    if existing and existing.user_id != current_user.id:
        raise HTTPException(status_code=409, detail={"code": 409, "message": "推送订阅已被其他账号使用"})
    if existing is None:
        db.add(PushSubscription(user_id=current_user.id, endpoint=endpoint, subscription_json=payload))
    else:
        existing.subscription_json = payload
    await db.commit()
    return ResponseData(data={"endpoint": endpoint}, message="订阅成功")


@router.get("/subscriptions", response_model=ResponseData)
async def get_push_subscriptions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """列出我的 Web 推送订阅

    Get user's Web Push subscriptions."""
    rows = (
        await db.execute(select(PushSubscription).where(PushSubscription.user_id == current_user.id))
    ).scalars().all()
    return ResponseData(data={"subscriptions": [_subscription_dict(row) for row in rows]})


@router.delete("/unsubscribe", response_model=ResponseData)
async def unsubscribe_push(
    endpoint: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """取消 Web 推送订阅

    Unsubscribe from Web Push notifications."""
    row = (
        await db.execute(
            select(PushSubscription).where(
                PushSubscription.user_id == current_user.id,
                PushSubscription.endpoint == endpoint,
            )
        )
    ).scalar_one_or_none()
    if row:
        await db.delete(row)
        await db.commit()
    return ResponseData(message="取消订阅成功")


@router.post("/test-push", response_model=ResponseData)
async def test_push_notification(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """发送一条测试 Web 推送

    Send a test Web Push notification to the current user."""
    import asyncio

    from app.utils.web_push import send_web_push

    subscribed = (
        await db.execute(
            select(PushSubscription.id).where(
                PushSubscription.user_id == current_user.id
            ).limit(1)
        )
    ).scalar_one_or_none()
    if subscribed is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": 400, "message": "尚未订阅推送，请先在浏览器中允许通知权限。"}
        )

    # send_web_push 是阻塞的（同步 DB + HTTPS 外呼），不能直接在事件循环里跑
    result = await asyncio.to_thread(
        send_web_push,
        current_user,
        "🔔 烂笔头 - 通知测试",
        "网页弹窗提醒功能已正常工作！您将在任务提醒时收到此类通知。",
        "/tasks",
        1,
    )

    if result:
        return ResponseData(message="测试通知已发送，请查看浏览器通知。")
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": 500, "message": "推送发送失败，请检查 VAPID 配置。"}
        )


@router.post("/send-test-email", response_model=ResponseData)
async def send_test_email_notification(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """测试邮件：用户前端 SMTP > 公司 SMTP > 环境变量。"""
    if not current_user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": 400, "message": "您尚未设置邮箱地址，请先在个人资料中填写邮箱。"}
        )

    from app.utils.email import _send_smtp
    from app.services.smtp_settings import resolve_smtp, smtp_from_user, smtp_from_env

    # notifications 路由当前为同步 Session；用户级可直接读，公司级在 async 路径更完整
    resolved = smtp_from_user(current_user) or smtp_from_env()
    if not resolved or not resolved.is_complete():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": 400,
                "message": "SMTP 未配置：请在「设置 → 邮件」或「公司设置 → SMTP」中填写主机/账号/密码。",
            },
        )

    user_name = current_user.nickname or current_user.username
    subject = "工作助理 - 通知测试"
    html_content = f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<div style="background:#f5f5f7;padding:20px 0;">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:24px 30px;">
<div style="color:#fff;font-size:20px;font-weight:700;">📋 工作助理</div>
<div style="color:rgba(255,255,255,0.85);font-size:16px;margin-top:4px;">通知测试成功</div></div>
<div style="padding:30px;">
<p style="font-size:16px;color:#1d1d1f;">Hi {user_name}，</p>
<p style="font-size:14px;color:#555;">这是一封测试邮件，说明邮件通知功能已正常工作。</p>
<div style="background:#f8f9fa;padding:16px;border-radius:8px;margin:16px 0;font-size:14px;color:#495057;">
您将收到以下类型的邮件通知：任务到期提醒、任务逾期警告、定时提醒、每日待办摘要。</div>
</div>
<div style="padding:16px 30px;background:#f8f9fa;border-top:1px solid #e9ecef;">
<p style="font-size:12px;color:#8e8e93;margin:0;">此邮件由「工作助理」自动发送。</p></div>
</div></div></body></html>"""

    plain_content = f"Hi {user_name}，邮件通知功能已正常工作。"

    success = _send_smtp(
        to_email=current_user.email,
        from_addr=resolved.from_addr,
        subject=subject,
        text_body=plain_content,
        html_body=html_content,
        smtp_host=resolved.host,
        smtp_port=resolved.port,
        smtp_user=resolved.user,
        smtp_password=resolved.password,
    )

    if success:
        labels = {"user": "用户配置", "company": "公司配置", "env": "系统环境变量"}
        source = labels.get(resolved.source, resolved.source)
        return ResponseData(message=f"测试邮件已发送至 {current_user.email}（使用{source}）")
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": 500, "message": "邮件发送失败，请检查 SMTP 服务器地址、端口、账号密码是否正确。"}
        )


@router.get("/email-status", response_model=ResponseData)
async def get_email_notification_status(
    current_user: User = Depends(get_current_user),
):
    """邮件通道状态：用户 / 环境（公司级见公司设置页）。"""
    from app.services.smtp_settings import smtp_from_user, smtp_from_env

    has_email = bool(current_user.email)
    user_r = smtp_from_user(current_user)
    env_r = smtp_from_env()
    user_smtp_configured = bool(user_r and user_r.is_complete())
    global_smtp_configured = bool(env_r and env_r.is_complete())
    if user_smtp_configured:
        source = "user"
    elif global_smtp_configured:
        source = "global"
    else:
        source = "none"

    return ResponseData(data={
        "has_email": has_email,
        "email_address": current_user.email or "",
        "smtp_configured": user_smtp_configured or global_smtp_configured,
        "user_smtp_configured": user_smtp_configured,
        "global_smtp_configured": global_smtp_configured,
        "smtp_source": source,
        "hint": "个人 SMTP 在「设置」；公司级 SMTP（欢迎信/协作通知）在「公司设置」前端可配。",
    })


@router.get("/smtp-config", response_model=ResponseData)
async def get_smtp_config(
    current_user: User = Depends(get_current_user),
):
    """获取个人 SMTP 配置

    Get user's SMTP configuration (password masked)."""
    notify_pref = current_user.notify_pref or {}
    channels = notify_pref.get("channels", {})
    email_config = channels.get("email", {})

    has_password = bool(email_config.get("smtp_password"))
    safe_config = {
        "smtp_host": email_config.get("smtp_host", ""),
        "smtp_port": email_config.get("smtp_port", 465),
        "smtp_user": email_config.get("smtp_user", ""),
        "smtp_from": email_config.get("smtp_from", ""),
        "has_password": has_password,
    }
    return ResponseData(data=safe_config)


@router.put("/smtp-config", response_model=ResponseData)
async def update_smtp_config(
    data: SmtpConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """保存个人 SMTP 配置

    Save user's SMTP configuration (merged into notify_pref.channels.email)."""
    notify_pref = current_user.notify_pref or {}
    channels = notify_pref.get("channels", {})
    email_config = channels.get("email", {})

    update_data = data.model_dump(exclude_unset=True)

    # If password is empty string, don't overwrite existing password
    if "smtp_password" in update_data and update_data["smtp_password"] == "":
        del update_data["smtp_password"]

    # 个人凭证加密落库（与公司级 secret_box 对齐）；读取侧统一走 user_secrets.unseal
    if update_data.get("smtp_password"):
        from app.services.user_secrets import seal

        update_data["smtp_password"] = seal(update_data["smtp_password"])

    email_config.update(update_data)
    channels["email"] = email_config
    notify_pref["channels"] = channels
    current_user.notify_pref = notify_pref
    # 原地修改 JSON dict 不会触发 SQLAlchemy 变更检测，须显式标记
    flag_modified(current_user, "notify_pref")

    await db.commit()

    # Return masked config
    has_password = bool(email_config.get("smtp_password"))
    safe_config = {
        "smtp_host": email_config.get("smtp_host", ""),
        "smtp_port": email_config.get("smtp_port", 465),
        "smtp_user": email_config.get("smtp_user", ""),
        "smtp_from": email_config.get("smtp_from", ""),
        "has_password": has_password,
    }
    return ResponseData(data=safe_config, message="邮件服务器配置已保存")


class LlmConfigUpdate(BaseModel):
    provider: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    enabled: Optional[bool] = None
    use_for_judge: Optional[bool] = None
    use_for_agent: Optional[bool] = None


@router.get("/llm-config", response_model=ResponseData)
async def get_llm_config(
    current_user: User = Depends(get_current_user),
):
    """个人 LLM 配置（api_key 脱敏）。"""
    from app.services.llm_settings import user_llm_public

    return ResponseData(data=user_llm_public(current_user))


@router.put("/llm-config", response_model=ResponseData)
async def update_llm_config(
    data: LlmConfigUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """保存个人 LLM；空 api_key 表示不改动。"""
    from app.services.llm_settings import save_user_llm

    body = data.model_dump(exclude_unset=True)
    view = save_user_llm(
        current_user,
        provider=body.get("provider"),
        base_url=body.get("base_url"),
        model=body.get("model"),
        api_key=body.get("api_key"),
        temperature=body.get("temperature"),
        max_tokens=body.get("max_tokens"),
        enabled=body.get("enabled"),
        use_for_judge=body.get("use_for_judge"),
        use_for_agent=body.get("use_for_agent"),
    )
    await db.commit()
    return ResponseData(data=view, message="个人 LLM 已保存")


@router.post("/llm-test", response_model=ResponseData)
async def test_user_llm(
    current_user: User = Depends(get_current_user),
):
    """用个人 LLM 发 ping；未配则失败提示。"""
    from app.services.llm_settings import chat_completion, llm_from_user

    llm = llm_from_user(current_user)
    if not llm or not llm.enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": 400, "message": "请先在设置中启用并保存个人 LLM"},
        )
    if not llm.is_usable() and llm.provider != "fake":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": 400, "message": "个人 LLM 配置不完整（Base URL / Model / API Key）"},
        )
    result = await chat_completion(
        llm,
        messages=[
            {
                "role": "system",
                "content": "You are a health-check assistant. Reply with exactly: OK",
            },
            {"role": "user", "content": "ping"},
        ],
        max_tokens=32,
        temperature=0,
    )
    if not result.get("ok"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": 400, "message": result.get("error") or "LLM 测试失败"},
        )
    return ResponseData(
        data={
            "provider": result.get("provider"),
            "model": llm.model,
            "base_url": llm.base_url,
            "content": (result.get("content") or "")[:500],
            "source": "user",
        },
        message="个人 LLM 连通性测试成功",
    )
