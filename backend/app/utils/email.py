"""Email sending utility."""

import smtplib
import hmac
import hashlib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.header import Header
from email.utils import formataddr
from typing import Optional

from app.core.config import settings


def send_email(
    to_email: str,
    subject: str,
    content: str,
    html_content: Optional[str] = None
) -> bool:
    """Send email via SMTP.

    Args:
        to_email: Recipient email address
        subject: Email subject
        content: Plain text content
        html_content: Optional HTML content

    Returns:
        True if sent successfully
    """
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        print("[EMAIL] SMTP not configured, skipping email send")
        return False

    try:
        msg = MIMEMultipart("alternative")
        from_addr = settings.SMTP_FROM or settings.SMTP_USER
        msg["From"] = formataddr(("Flow 生产力", from_addr))
        msg["To"] = formataddr(("", to_email))
        msg["Subject"] = Header(subject, "utf-8")

        # Attach plain text
        msg.attach(MIMEText(content, "plain", "utf-8"))

        # Attach HTML if provided
        if html_content:
            msg.attach(MIMEText(html_content, "html", "utf-8"))

        # Connect to SMTP server
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
        server.starttls()  # Enable TLS
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)

        # Send email
        server.sendmail(
            from_addr,
            [to_email],
            msg.as_string()
        )
        server.quit()

        print(f"[EMAIL] Sent to {to_email}: {subject}")
        return True

    except Exception as e:
        print(f"[EMAIL] Failed to send: {e}")
        return False


def build_reminder_email(task_id: int, task_title: str, remind_message: str) -> MIMEMultipart:
    """Build reminder email with Reply-To and Message-ID headers.

    Returns:
        MIMEMultipart email message with Reply-To, Message-ID, and operation instructions
    """
    import time as time_mod

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"提醒：{task_title}"

    # Generate Message-ID: <task-{task_id}-{timestamp}@{EMAIL_REPLY_DOMAIN}>
    timestamp = int(time_mod.time())
    message_id = f"<task-{task_id}-{timestamp}@{settings.EMAIL_REPLY_DOMAIN}>"
    msg["Message-ID"] = message_id

    # Generate Reply-To address with HMAC signature
    sig = hmac.new(
        settings.EMAIL_REPLY_SECRET.encode(),
        str(task_id).encode(),
        hashlib.sha256
    ).hexdigest()[:16]
    reply_to_addr = f"reply-{task_id}-{sig}@{settings.EMAIL_REPLY_DOMAIN}"
    msg["Reply-To"] = reply_to_addr

    # Plain text body with operation instructions
    text_body = f"""{remind_message}

---
任务：{task_title}

直接回复此邮件即可操作任务（支持：完成 / 取消 / 回复 xxx / 提醒 时间 频次 次数）
"""

    # HTML body
    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #409EFF;">⏰ 任务提醒</h2>
            <p>{remind_message}</p>
            <div style="background: #f5f7fa; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <h3 style="margin: 0 0 10px 0;">{task_title}</h3>
            </div>
            <p style="color: #666; font-size: 14px;">
                直接回复此邮件即可操作任务（支持：完成 / 取消 / 回复 xxx / 提醒 时间 频次 次数）
            </p>
            <p style="color: #999; font-size: 12px;">
                此邮件由 WorkTodo 自动发送。
            </p>
        </div>
    </body>
    </html>
    """

    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    return msg
