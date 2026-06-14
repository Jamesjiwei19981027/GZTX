"""Notification API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, get_current_user
from app.core.config import settings
from app.models.user import User
from app.schemas.common import ResponseModel
from app.utils.web_push import save_subscription, get_subscriptions

router = APIRouter(prefix="/notifications", tags=["通知"])


@router.get("/vapid-public-key", response_model=ResponseModel)
async def get_vapid_public_key():
    """Get VAPID public key for Web Push subscription (public endpoint)."""
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": 503, "message": "Web Push 未配置"}
        )
    return ResponseModel(data={"publicKey": settings.VAPID_PUBLIC_KEY})


@router.post("/subscribe", response_model=ResponseModel)
async def subscribe_push(
    subscription: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Subscribe to Web Push notifications."""
    success = save_subscription(current_user.id, subscription)
    if success:
        return ResponseModel(message="订阅成功")
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": 500, "message": "订阅失败"}
        )


@router.get("/subscriptions", response_model=ResponseModel)
async def get_push_subscriptions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's Web Push subscriptions."""
    subs = get_subscriptions(current_user.id)
    return ResponseModel(data={"subscriptions": subs})


@router.delete("/unsubscribe", response_model=ResponseModel)
async def unsubscribe_push(
    endpoint: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unsubscribe from Web Push notifications."""
    from app.utils.web_push import remove_subscription
    remove_subscription(current_user.id, endpoint)
    return ResponseModel(message="取消订阅成功")


@router.post("/send-test-email", response_model=ResponseModel)
async def send_test_email_notification(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send a test email notification to the current user."""
    if not current_user.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": 400, "message": "您尚未设置邮箱地址，请先在个人资料中填写邮箱。"}
        )

    from app.utils.email import send_email

    subject = "🔔 Flow 生产力 - 通知测试"
    html_content = f"""
    <html>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 560px; margin: 0 auto; padding: 32px 24px;">
            <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-block; background: #0058be; color: #fff; width: 56px; height: 56px; border-radius: 50%; line-height: 56px; font-size: 28px;">
                    🔔
                </div>
            </div>
            <h2 style="text-align: center; color: #0058be; margin: 0 0 8px;">通知测试成功</h2>
            <p style="text-align: center; color: #666; margin: 0 0 24px;">
                您好，{current_user.nickname or current_user.username}！这是一封测试邮件，说明 Flow 生产力的邮件通知功能已正常工作。
            </p>
            <div style="background: #f5f7fa; padding: 20px; border-radius: 12px; margin: 20px 0;">
                <h3 style="margin: 0 0 12px; font-size: 15px; color: #333;">您将收到以下类型的邮件通知：</h3>
                <ul style="margin: 0; padding-left: 20px; color: #555;">
                    <li style="margin-bottom: 8px;">⏰ <strong>任务即将到期</strong> — 截止前提醒您及时处理</li>
                    <li style="margin-bottom: 8px;">🔴 <strong>任务已逾期</strong> — 超过截止日期时发出警告</li>
                    <li style="margin-bottom: 8px;">🔔 <strong>定时提醒</strong> — 按您设定的提醒时间发送</li>
                    <li>📊 <strong>每日摘要</strong> — 每天汇总当天待办任务</li>
                </ul>
            </div>
            <p style="color: #999; font-size: 12px; text-align: center; margin: 24px 0 0;">
                此邮件由 Flow 生产力系统自动发送，请勿回复。<br>
                如需关闭邮件通知，请前往「设置 → 通知偏好」中管理。
            </p>
        </div>
    </body>
    </html>
    """

    plain_content = (
        f"您好，{current_user.nickname or current_user.username}！\n\n"
        "这是一封测试邮件，说明 Flow 生产力的邮件通知功能已正常工作。\n\n"
        "您将收到以下类型的邮件通知：\n"
        "- 任务即将到期提醒\n"
        "- 任务已逾期警告\n"
        "- 定时提醒\n"
        "- 每日摘要\n\n"
        "如需关闭邮件通知，请前往「设置 → 通知偏好」中管理。"
    )

    success = send_email(
        to_email=current_user.email,
        subject=subject,
        content=plain_content,
        html_content=html_content
    )

    if success:
        return ResponseModel(message=f"测试邮件已发送至 {current_user.email}")
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": 500, "message": "邮件发送失败，SMTP 服务可能未配置或连接失败。请联系管理员检查 SMTP 设置。"}
        )


@router.get("/email-status", response_model=ResponseModel)
async def get_email_notification_status(
    current_user: User = Depends(get_current_user),
):
    """Check if email notifications are configured and available."""
    has_email = bool(current_user.email)
    smtp_configured = bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD)

    return ResponseModel(data={
        "has_email": has_email,
        "email_address": current_user.email or "",
        "smtp_configured": smtp_configured,
    })
