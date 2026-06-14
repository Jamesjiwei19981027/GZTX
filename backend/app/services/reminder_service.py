from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
import json

from app.models.reminder import Reminder
from app.models.task import Task
from app.models.user import User


class ReminderService:
    """Service for reminder-related business logic."""

    # 提醒方式配置
    CHANNEL_CONFIG = {
        "web_push": {"name": "浏览器推送", "icon": "🌐"},
        "email": {"name": "邮件", "icon": "📧"},
        "sms": {"name": "短信", "icon": "📱"},
        "desktop": {"name": "桌面弹窗", "icon": "💻"},
        "wx": {"name": "微信", "icon": "💬"},
        "app": {"name": "手机APP", "icon": "📲"},
    }

    @staticmethod
    def check_and_send_reminders(db: Session) -> List[Dict[str, Any]]:
        """Check pending reminders and send them.

        Returns list of reminder info that were sent.
        """
        # SQLite 存储为无时区字符串，使用 naive UTC 确保字符串比较一致
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        # Find all reminders that should be sent
        pending_reminders = db.query(Reminder).filter(
            Reminder.is_sent == False,
            Reminder.remind_at <= now
        ).all()

        sent_results = []

        for reminder in pending_reminders:
            # Get user and task info
            task = db.query(Task).filter(Task.id == reminder.task_id).first()
            if not task or task.is_deleted:
                continue

            user = db.query(User).filter(User.id == reminder.user_id).first()
            if not user:
                continue

            # 根据提醒方式发送通知
            channels = reminder.notify_channels.split(",") if reminder.notify_channels else ["web_push"]
            sent_channels = []

            # 构建通知内容（供 fallback 使用）
            title = f"任务提醒: {task.title}"
            content = f"您的任务 '{task.title}' 即将到期，请注意处理。"
            if task.description:
                content += f"\n任务描述: {task.description}"

            for channel in channels:
                channel = channel.strip()
                success = ReminderService._send_by_channel(
                    channel=channel,
                    user=user,
                    task=task,
                    reminder=reminder
                )
                if success:
                    sent_channels.append(channel)

            # C4: 如果所有渠道都失败，尝试 fallback 到 email
            if not sent_channels and "email" not in channels:
                fallback_success = ReminderService._send_email(user, title, content)
                if fallback_success:
                    sent_channels.append("email(fallback)")

            # Mark reminder as sent
            reminder.is_sent = True
            reminder.sent_at = datetime.now(timezone.utc).replace(tzinfo=None)

            sent_results.append({
                "reminder_id": reminder.id,
                "task_id": task.id,
                "task_title": task.title,
                "user_id": user.id,
                "channels": sent_channels,
                "sent_at": reminder.sent_at.isoformat()
            })

        if sent_results:
            db.commit()

        return sent_results

    @staticmethod
    def _get_channel_config(user: User, channel_name: str) -> dict:
        """Get channel config from user's notify_pref, fallback to env settings."""
        notify_pref = user.notify_pref or {}
        channels = notify_pref.get("channels", {})
        config = channels.get(channel_name, {})
        return config if isinstance(config, dict) else {}

    @staticmethod
    def _send_by_channel(channel: str, user: User, task: Task, reminder: Reminder) -> bool:
        """Send notification by specific channel.

        Returns True if sent successfully.
        """
        title = f"任务提醒: {task.title}"
        content = f"您的任务 '{task.title}' 即将到期，请注意处理。"
        if task.description:
            content += f"\n任务描述: {task.description}"

        try:
            if channel == "email":
                return ReminderService._send_email(user, title, content)
            elif channel == "sms":
                return ReminderService._send_sms(user, title, content)
            elif channel == "web_push":
                return ReminderService._send_web_push(user, title, content)
            elif channel == "desktop":
                return ReminderService._send_desktop_notification(user, title, content)
            elif channel == "wx":
                return ReminderService._send_wechat(user, title, content)
            elif channel == "app":
                return ReminderService._send_app_push(user, title, content)
            else:
                return ReminderService._send_web_push(user, title, content)
        except Exception as e:
            print(f"Failed to send reminder via {channel}: {e}")
            return False

    @staticmethod
    def _send_email(user: User, title: str, content: str) -> bool:
        """Send email notification using user's channel config."""
        if not user.email:
            return False

        config = ReminderService._get_channel_config(user, "email")
        smtp_host = config.get("smtp_host")
        smtp_user = config.get("smtp_user")
        smtp_password = config.get("smtp_password")

        if not all([smtp_host, smtp_user, smtp_password]):
            # Fallback to global settings
            from app.core.config import settings as app_settings
            smtp_host = app_settings.SMTP_HOST
            smtp_user = app_settings.SMTP_USER
            smtp_password = app_settings.SMTP_PASSWORD
            if not all([smtp_host, smtp_user, smtp_password]):
                print("[EMAIL] Not configured (neither user config nor env)")
                return False

        from app.utils.email import build_reminder_email
        subject, html = build_reminder_email(title, content, "")

        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        from email.header import Header

        try:
            msg = MIMEMultipart("alternative")
            smtp_from = config.get("smtp_from", smtp_user)
            msg["From"] = Header(f"WorkTodo <{smtp_from}>", "utf-8")
            msg["To"] = Header(user.email, "utf-8")
            msg["Subject"] = Header(subject, "utf-8")
            msg.attach(MIMEText(content, "plain", "utf-8"))
            msg.attach(MIMEText(html, "html", "utf-8"))

            port = int(config.get("smtp_port", 587))
            server = smtplib.SMTP(smtp_host, port)
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_from, [user.email], msg.as_string())
            server.quit()
            print(f"[EMAIL] Sent to {user.email}: {subject}")
            return True
        except Exception as e:
            print(f"[EMAIL] Failed: {e}")
            return False

    @staticmethod
    def _send_sms(user: User, title: str, content: str) -> bool:
        """Send SMS notification using user's channel config."""
        config = ReminderService._get_channel_config(user, "sms")
        access_key_id = config.get("access_key_id")

        if not access_key_id:
            from app.core.config import settings as app_settings
            if not app_settings.ALIYUN_ACCESS_KEY_ID:
                print("[SMS] Not configured")
                return False

        from app.utils.sms import send_sms_mock
        # Use mock for now; real implementation needs user.phone field
        print(f"[SMS] Would send to user {user.id}: {title}")
        return False

    @staticmethod
    def _send_web_push(user: User, title: str, content: str) -> bool:
        """Send browser web push notification using user's VAPID config."""
        from app.utils.web_push import send_web_push
        return send_web_push(
            user=user,
            title=title,
            body=content,
            url="/tasks"
        )

    @staticmethod
    def _send_desktop_notification(user: User, title: str, content: str) -> bool:
        """Desktop notifications via frontend Web Notification API."""
        from app.utils.web_push import send_web_push
        return send_web_push(user=user, title=title, body=content, url="/tasks")

    @staticmethod
    def _send_wechat(user: User, title: str, content: str) -> bool:
        """Send WeChat notification using user's config."""
        if not user.wx_openid:
            return False
        config = ReminderService._get_channel_config(user, "wechat")
        template_id = config.get("template_id", "")
        if not template_id:
            print("[WECHAT] No template_id configured")
            return False
        from app.utils.wechat import send_subscribe_message, build_reminder_template_data
        template_data = build_reminder_template_data(title, "")
        return send_subscribe_message(
            openid=user.wx_openid,
            template_id=template_id,
            data=template_data,
            page="pages/index/index"
        )

    @staticmethod
    def _send_app_push(user: User, title: str, content: str) -> bool:
        """Send mobile APP push notification."""
        from app.utils.jpush import send_push
        return send_push(alias=str(user.id), title=title, content=content)

    @staticmethod
    def get_upcoming_reminders(
        user_id: int,
        db: Session,
        hours: int = 24
    ) -> List[Reminder]:
        """Get upcoming reminders for a user within specified hours."""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        end_time = now + timedelta(hours=hours)

        reminders = db.query(Reminder).filter(
            Reminder.user_id == user_id,
            Reminder.is_sent == False,
            Reminder.remind_at > now,
            Reminder.remind_at <= end_time
        ).order_by(Reminder.remind_at.asc()).all()

        return reminders

    @staticmethod
    def create_default_reminders(
        task_id: int,
        user_id: int,
        due_date: datetime,
        db: Session,
        default_remind_before: int = 15,
        notify_channels: str = "web_push"
    ) -> List[Reminder]:
        """Create default reminders for a task based on due date.

        Args:
            task_id: The task ID
            user_id: The user ID
            due_date: The task due date
            db: Database session
            default_remind_before: Minutes before due date to remind
            notify_channels: Notification channels (comma-separated)

        Returns:
            List of created reminders
        """
        reminders = []

        # Create reminder for default time (e.g., 15 minutes before)
        remind_at = due_date - timedelta(minutes=default_remind_before)

        if remind_at > datetime.now(timezone.utc).replace(tzinfo=None):
            reminder = Reminder(
                task_id=task_id,
                user_id=user_id,
                remind_at=remind_at,
                remind_type=0,  # before deadline
                notify_channels=notify_channels
            )
            db.add(reminder)
            reminders.append(reminder)

        db.flush()
        return reminders
