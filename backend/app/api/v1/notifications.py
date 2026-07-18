"""Notification API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_current_user
from app.core.config import settings
from app.models.user import User
from app.schemas.common import ResponseData
from app.utils.web_push import save_subscription, get_subscriptions

router = APIRouter(prefix="/notifications", tags=["通知"])


class SmtpConfigUpdate(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from: Optional[str] = None


@router.get("/vapid-public-key", response_model=ResponseData)
async def get_vapid_public_key():
    """Get VAPID public key for Web Push subscription (public endpoint)."""
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": 503, "message": "Web Push 未配置"}
        )
    return ResponseData(data={"publicKey": settings.VAPID_PUBLIC_KEY})


@router.post("/subscribe", response_model=ResponseData)
async def subscribe_push(
    subscription: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Subscribe to Web Push notifications."""
    print(f"[SUBSCRIBE] User {current_user.id} subscription: {subscription}")
    success = save_subscription(current_user.id, subscription)
    if success:
        return ResponseData(message="订阅成功")
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": 500, "message": "订阅失败"}
        )


@router.get("/subscriptions", response_model=ResponseData)
async def get_push_subscriptions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's Web Push subscriptions."""
    subs = get_subscriptions(current_user.id)
    return ResponseData(data={"subscriptions": subs})


@router.delete("/unsubscribe", response_model=ResponseData)
async def unsubscribe_push(
    endpoint: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unsubscribe from Web Push notifications."""
    from app.utils.web_push import remove_subscription
    remove_subscription(current_user.id, endpoint)
    return ResponseData(message="取消订阅成功")


@router.post("/test-push", response_model=ResponseData)
async def test_push_notification(
    current_user: User = Depends(get_current_user),
):
    """Send a test Web Push notification to the current user."""
    from app.utils.web_push import send_web_push, get_subscriptions

    subscriptions = get_subscriptions(current_user.id)
    if not subscriptions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": 400, "message": "尚未订阅推送，请先在浏览器中允许通知权限。"}
        )

    result = send_web_push(
        user=current_user,
        title="🔔 烂笔头PM - 通知测试",
        body="网页弹窗提醒功能已正常工作！您将在任务提醒时收到此类通知。",
        url="/tasks",
        priority=1
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
    db: Session = Depends(get_db)
):
    """Send a test email notification to the current user. Uses user-level SMTP first, falls back to global."""
    if not current_user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": 400, "message": "您尚未设置邮箱地址，请先在个人资料中填写邮箱。"}
        )

    from app.utils.email import _send_smtp

    # Determine SMTP config: user-level first, then global
    notify_pref = current_user.notify_pref or {}
    channels = notify_pref.get("channels", {})
    email_config = channels.get("email", {})

    smtp_host = email_config.get("smtp_host") or settings.SMTP_HOST
    smtp_user = email_config.get("smtp_user") or settings.SMTP_USER
    smtp_password = email_config.get("smtp_password") or settings.SMTP_PASSWORD
    smtp_port = int(email_config.get("smtp_port", settings.SMTP_PORT))
    smtp_from = email_config.get("smtp_from") or settings.SMTP_FROM or smtp_user

    if not all([smtp_host, smtp_user, smtp_password]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": 400, "message": "SMTP 未配置，请先在设置中填写邮件服务器信息。"}
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
        from_addr=smtp_from,
        subject=subject,
        text_body=plain_content,
        html_body=html_content,
        smtp_host=smtp_host,
        smtp_port=smtp_port,
        smtp_user=smtp_user,
        smtp_password=smtp_password,
    )

    if success:
        source = "用户配置" if email_config.get("smtp_host") else "系统配置"
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
    """Check if email notifications are configured and available."""
    has_email = bool(current_user.email)

    # Check user-level SMTP config
    notify_pref = current_user.notify_pref or {}
    channels = notify_pref.get("channels", {})
    email_config = channels.get("email", {})
    user_smtp_configured = bool(
        email_config.get("smtp_host")
        and email_config.get("smtp_user")
        and email_config.get("smtp_password")
    )

    # Check global SMTP config
    global_smtp_configured = bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD)

    return ResponseData(data={
        "has_email": has_email,
        "email_address": current_user.email or "",
        "smtp_configured": user_smtp_configured or global_smtp_configured,
        "user_smtp_configured": user_smtp_configured,
        "global_smtp_configured": global_smtp_configured,
        "smtp_source": "user" if user_smtp_configured else ("global" if global_smtp_configured else "none"),
    })


@router.get("/smtp-config", response_model=ResponseData)
async def get_smtp_config(
    current_user: User = Depends(get_current_user),
):
    """Get user's SMTP configuration (password masked)."""
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
    db: Session = Depends(get_db)
):
    """Save user's SMTP configuration (merged into notify_pref.channels.email)."""
    notify_pref = current_user.notify_pref or {}
    channels = notify_pref.get("channels", {})
    email_config = channels.get("email", {})

    update_data = data.model_dump(exclude_unset=True)

    # If password is empty string, don't overwrite existing password
    if "smtp_password" in update_data and update_data["smtp_password"] == "":
        del update_data["smtp_password"]

    email_config.update(update_data)
    channels["email"] = email_config
    notify_pref["channels"] = channels
    current_user.notify_pref = notify_pref

    db.commit()

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
