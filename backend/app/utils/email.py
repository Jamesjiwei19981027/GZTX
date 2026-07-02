"""Email sending utility with SSL/STARTTLS support."""

import smtplib
import hmac
import hashlib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.header import Header
from email.utils import formataddr
from typing import Optional, List, Dict, Any
from datetime import datetime

from app.core.config import settings


def _send_smtp(
    to_email: str,
    from_addr: str,
    subject: str,
    text_body: str,
    html_body: str,
    smtp_host: str,
    smtp_port: int,
    smtp_user: str,
    smtp_password: str,
    reply_to: Optional[str] = None,
    message_id: Optional[str] = None,
) -> bool:
    """Low-level SMTP send helper. Supports both SSL (port 465) and STARTTLS (port 587)."""
    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = formataddr(("工作助理", from_addr))
        msg["To"] = formataddr(("", to_email))
        msg["Subject"] = Header(subject, "utf-8")
        if reply_to:
            msg["Reply-To"] = reply_to
        if message_id:
            msg["Message-ID"] = message_id

        msg.attach(MIMEText(text_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        # Connect: SSL for port 465, STARTTLS for others
        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=30)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=30)
            server.starttls()

        server.login(smtp_user, smtp_password)
        server.sendmail(from_addr, [to_email], msg.as_string())
        server.quit()

        print(f"[EMAIL] Sent to {to_email}: {subject}")
        return True

    except Exception as e:
        print(f"[EMAIL] Failed to send: {e}")
        return False


# ─── Priority / status helpers ──────────────────────────────────────────────

_PRIORITY_MAP = {0: ("低", "#34c759"), 1: ("中", "#ff9500"), 2: ("高", "#ff3b30")}


def _priority_info(priority: int):
    label, color = _PRIORITY_MAP.get(priority, ("中", "#ff9500"))
    return label, color


def _format_due_date(due_date) -> str:
    """Format a due_date to a readable string like '2026-07-05 14:30'."""
    if not due_date:
        return ""
    if isinstance(due_date, datetime):
        return due_date.strftime("%Y-%m-%d %H:%M")
    return str(due_date)


def _calc_remaining(due_date) -> str:
    """Return a human-readable remaining time string."""
    if not due_date:
        return ""
    if isinstance(due_date, str):
        try:
            due_date = datetime.fromisoformat(due_date.replace("Z", ""))
        except Exception:
            return ""
    now = datetime.utcnow()
    diff = due_date - now
    total_seconds = int(diff.total_seconds())
    if total_seconds < 0:
        days = abs(total_seconds) // 86400
        return f"已逾期 {days} 天" if days > 0 else "已逾期"
    days = total_seconds // 86400
    hours = (total_seconds % 86400) // 3600
    minutes = (total_seconds % 3600) // 60
    if days > 0:
        return f"{days} 天 {hours} 小时"
    if hours > 0:
        return f"{hours} 小时 {minutes} 分钟"
    return f"{minutes} 分钟"


# ─── Generic send wrapper ──────────────────────────────────────────────────

def send_email(
    to_email: str,
    subject: str,
    content: str,
    html_content: Optional[str] = None,
) -> bool:
    """Send email via SMTP using global settings.

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

    from_addr = settings.SMTP_FROM or settings.SMTP_USER
    return _send_smtp(
        to_email=to_email,
        from_addr=from_addr,
        subject=subject,
        text_body=content,
        html_body=html_content or content,
        smtp_host=settings.SMTP_HOST,
        smtp_port=settings.SMTP_PORT,
        smtp_user=settings.SMTP_USER,
        smtp_password=settings.SMTP_PASSWORD,
    )


# ─── Reminder email ────────────────────────────────────────────────────────

def build_reminder_email(
    task_id: int,
    task_title: str,
    remind_message: str,
    priority: int = 1,
    due_date=None,
    description: str = "",
) -> tuple:
    """Build reminder email with Reply-To for email-reply support.

    Returns:
        (subject, html_body) tuple
    """
    import time as time_mod

    # Generate Reply-To address with HMAC signature for email reply processing
    sig = hmac.new(
        settings.EMAIL_REPLY_SECRET.encode(),
        str(task_id).encode(),
        hashlib.sha256,
    ).hexdigest()[:16]
    reply_to_addr = f"reply-{task_id}-{sig}@{settings.EMAIL_REPLY_DOMAIN}"

    subject = f"提醒：{task_title}"

    # Determine status
    is_overdue = False
    remaining_text = ""
    if due_date:
        remaining_text = _calc_remaining(due_date)
        if isinstance(due_date, datetime):
            is_overdue = due_date < datetime.utcnow()
        elif isinstance(due_date, str):
            try:
                dd = datetime.fromisoformat(due_date.replace("Z", ""))
                is_overdue = dd < datetime.utcnow()
            except Exception:
                pass

    due_date_text = _format_due_date(due_date)
    priority_label, priority_color = _priority_info(priority)

    # Overdue alert block
    overdue_html = ""
    if is_overdue:
        overdue_html = f"""
        <div style="background:#fff0f0;color:#c0392b;padding:12px 16px;border-radius:8px;margin:12px 0;font-size:14px;">
            ⚠️ 该任务已逾期！请尽快处理。
        </div>
        """

    # Description block
    desc_html = ""
    if description:
        desc_html = f'<p style="color:#6c757d;font-size:14px;margin:8px 0 0;">{description}</p>'

    # Due date row
    due_date_row = ""
    if due_date_text:
        due_date_row = f"""
            <tr>
                <td style="padding:4px 0;color:#8e8e93;font-size:13px;width:80px;">截止时间</td>
                <td style="padding:4px 0;font-size:14px;">📅 {due_date_text}</td>
            </tr>
        """

    # Remaining time row
    remaining_row = ""
    if remaining_text:
        icon = "🔴" if is_overdue else "⏰"
        remaining_row = f"""
            <tr>
                <td style="padding:4px 0;color:#8e8e93;font-size:13px;">剩余时间</td>
                <td style="padding:4px 0;font-size:14px;color:{'#c0392b' if is_overdue else '#1d1d1f'};">{icon} {remaining_text}</td>
            </tr>
        """

    html_body = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<div style="background-color:#f5f5f7;padding:20px 0;">
<div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:20px 30px;">
    <div style="color:#ffffff;font-size:20px;font-weight:700;">📋 工作助理</div>
    <div style="color:rgba(255,255,255,0.85);font-size:16px;font-weight:600;margin-top:4px;">{'⚠️ 任务已逾期' if is_overdue else '您有一个任务提醒'}</div>
  </div>

  <!-- Content -->
  <div style="padding:30px;">
    <p style="font-size:16px;color:#1d1d1f;margin:0 0 16px;">Hi，</p>
    <p style="font-size:14px;color:#555;margin:0 0 16px;">{remind_message or '以下任务需要您的关注：'}</p>

    <!-- Task card -->
    <div style="background-color:#f8f9fa;border-radius:10px;padding:20px;border-left:4px solid {priority_color};">
      <div style="font-size:18px;font-weight:600;color:#1d1d1f;">{task_title}</div>
      {desc_html}
      <table style="width:100%;margin-top:12px;border-collapse:collapse;">
        {due_date_row}
        <tr>
          <td style="padding:4px 0;color:#8e8e93;font-size:13px;">优先级</td>
          <td style="padding:4px 0;">
            <span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:12px;font-weight:600;background-color:{priority_color};color:#fff;">{priority_label}</span>
          </td>
        </tr>
        {remaining_row}
      </table>
    </div>

    {overdue_html}

    <!-- Reply instructions -->
    <div style="background-color:#f0f4ff;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px;color:#4a5568;">
      💡 直接回复此邮件可操作任务（支持：<b>完成</b> / <b>取消</b> / <b>回复 xxx</b> / <b>提醒 时间</b>）
    </div>
  </div>

  <!-- Footer -->
  <div style="padding:16px 30px;background-color:#f8f9fa;border-top:1px solid #e9ecef;">
    <p style="font-size:12px;color:#8e8e93;margin:0;line-height:1.8;">
      此邮件由「工作助理」自动发送，请勿直接回复（回复内容将自动处理）。
    </p>
  </div>

</div>
</div>
</body>
</html>"""

    return subject, html_body


# ─── Daily digest email ────────────────────────────────────────────────────

def build_daily_digest_email(
    user_name: str,
    today_tasks: List[Dict[str, Any]],
    overdue_tasks: List[Dict[str, Any]],
    completed_count: int = 0,
    date_text: str = "",
) -> tuple:
    """Build daily digest email showing today's tasks and overdue items.

    Returns:
        (subject, html_body) tuple
    """
    total = len(today_tasks)
    urgent = sum(1 for t in today_tasks if t.get("priority", 1) >= 2)
    overdue_count = len(overdue_tasks)

    subject = f"📋 今日待办摘要 · {date_text}"

    def _task_row(t: Dict[str, Any], show_overdue: bool = False) -> str:
        title = t.get("title", "未命名任务")
        priority = t.get("priority", 1)
        _, pcolor = _priority_info(priority)
        due = _format_due_date(t.get("due_date"))
        extra = f'<span style="color:#c0392b;font-size:12px;margin-left:8px;">逾期</span>' if show_overdue else ""
        time_cell = f'<span style="color:#8e8e93;font-size:13px;">{due}</span>' if due else ""
        return f"""
        <div style="padding:12px 0;border-bottom:1px solid #f0f0f0;">
          <div style="font-size:15px;font-weight:500;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:{pcolor};margin-right:6px;"></span>
            {title}{extra}
          </div>
          <div style="font-size:13px;color:#8e8e93;margin-top:4px;margin-left:14px;">{time_cell}</div>
        </div>
        """

    # Build task sections
    overdue_section = ""
    if overdue_tasks:
        rows = "".join(_task_row(t, show_overdue=True) for t in overdue_tasks[:20])
        overdue_section = f"""
        <div style="font-size:15px;font-weight:600;color:#c0392b;margin:20px 0 8px;padding-bottom:8px;border-bottom:2px solid #fee;">
          🔴 已逾期 ({overdue_count})
        </div>
        {rows}
        """

    today_section = ""
    if today_tasks:
        rows = "".join(_task_row(t) for t in today_tasks[:20])
        today_section = f"""
        <div style="font-size:15px;font-weight:600;color:#1d1d1f;margin:20px 0 8px;padding-bottom:8px;border-bottom:2px solid #f0f0f0;">
          📋 今日待办 ({total})
        </div>
        {rows}
        """

    no_tasks_html = ""
    if not today_tasks and not overdue_tasks:
        no_tasks_html = """
        <div style="text-align:center;padding:40px 0;color:#8e8e93;">
          <div style="font-size:48px;margin-bottom:12px;">🎉</div>
          <div style="font-size:16px;">今天没有待办任务，享受清闲吧！</div>
        </div>
        """

    html_body = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<div style="background-color:#f5f5f7;padding:20px 0;">
<div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:24px 30px;">
    <div style="color:rgba(255,255,255,0.8);font-size:13px;">📅 {date_text}</div>
    <div style="color:#ffffff;font-size:20px;font-weight:600;margin-top:4px;">今日待办摘要</div>
  </div>

  <!-- Content -->
  <div style="padding:30px;">
    <p style="font-size:14px;color:#555;margin:0 0 20px;">Hi {user_name}，这是你今天的待办事项概览：</p>

    <!-- Stats -->
    <div style="display:flex;text-align:center;margin-bottom:24px;">
      <div style="flex:1;padding:12px;">
        <div style="font-size:28px;font-weight:700;color:#667eea;">{total}</div>
        <div style="font-size:12px;color:#8e8e93;margin-top:4px;">今日待办</div>
      </div>
      <div style="flex:1;padding:12px;">
        <div style="font-size:28px;font-weight:700;color:#ff3b30;">{urgent}</div>
        <div style="font-size:12px;color:#8e8e93;margin-top:4px;">紧急任务</div>
      </div>
      <div style="flex:1;padding:12px;">
        <div style="font-size:28px;font-weight:700;color:#ff9500;">{overdue_count}</div>
        <div style="font-size:12px;color:#8e8e93;margin-top:4px;">已逾期</div>
      </div>
      <div style="flex:1;padding:12px;">
        <div style="font-size:28px;font-weight:700;color:#34c759;">{completed_count}</div>
        <div style="font-size:12px;color:#8e8e93;margin-top:4px;">昨日完成</div>
      </div>
    </div>

    {overdue_section}
    {today_section}
    {no_tasks_html}
  </div>

  <!-- Footer -->
  <div style="padding:16px 30px;background-color:#f8f9fa;border-top:1px solid #e9ecef;">
    <p style="font-size:12px;color:#8e8e93;margin:0;line-height:1.8;">
      此邮件由「工作助理」每日自动发送。
    </p>
  </div>

</div>
</div>
</body>
</html>"""

    return subject, html_body
