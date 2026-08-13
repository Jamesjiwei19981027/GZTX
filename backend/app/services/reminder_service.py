import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
import json

from app.core.config import settings

logger = logging.getLogger(__name__)
from app.models.reminder import Reminder
from app.models.task import Task
from app.models.user import User


class ReminderService:
    """Service for reminder-related business logic."""

    # 提醒方式配置
    CHANNEL_CONFIG = {
        "web_push": {"name": "浏览器推送", "icon": "🌐"},
        "web_popup": {"name": "网页弹窗", "icon": "🌐"},
        "email": {"name": "邮件", "icon": "📧"},
        "sms": {"name": "短信", "icon": "📱"},
        "desktop": {"name": "桌面弹窗", "icon": "💻"},
        "alarm": {"name": "闹钟提醒", "icon": "⏰"},
        "wx": {"name": "微信", "icon": "💬"},
        "wechat": {"name": "微信", "icon": "💬"},
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

        if pending_reminders:
            logger.info("[ReminderCheck] Found %s pending reminders (UTC now: %s)", len(pending_reminders), now)

        sent_results = []

        for reminder in pending_reminders:
            # Get user and task info
            task = db.query(Task).filter(Task.id == reminder.task_id).first()
            if not task or task.is_deleted:
                logger.info("[ReminderCheck] Skipping reminder %s: task deleted or not found", reminder.id)
                continue

            # 任务已完成就不该再提醒（status 2 = completed）。
            # 标记 is_sent 是为了不让它每分钟被反复扫出来。
            if task.status == 2 or task.completed_at is not None:
                logger.info("[ReminderCheck] Skipping reminder %s: task already completed", reminder.id)
                reminder.is_sent = True
                db.commit()
                continue

            user = db.query(User).filter(User.id == reminder.user_id).first()
            if not user:
                logger.info("[ReminderCheck] Skipping reminder %s: user not found", reminder.id)
                continue

            logger.info(
                "[ReminderCheck] Processing reminder %s for task '%s' (user %s), channels: %s",
                reminder.id, task.title, user.id, reminder.notify_channels,
            )

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
                    logger.info("[ReminderCheck] Channel '%s' succeeded for reminder %s", channel, reminder.id)
                else:
                    logger.warning("[ReminderCheck] Channel '%s' failed for reminder %s", channel, reminder.id)

            # C4: 如果所有渠道都失败，尝试 fallback 到 email
            if not sent_channels and "email" not in channels:
                fallback_success = ReminderService._send_email(user, task)
                if fallback_success:
                    sent_channels.append("email(fallback)")
                    logger.info("[ReminderCheck] Email fallback succeeded for reminder %s", reminder.id)
                else:
                    logger.error("[ReminderCheck] All channels failed for reminder %s, email fallback also failed", reminder.id)

            # Mark reminder as sent regardless of channel success
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
            logger.info("[ReminderCheck] Committed %s reminder results", len(sent_results))

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

        # Backward compatibility aliases
        channel_aliases = {
            "web_popup": "web_push",
            "wechat": "wx",
            "alarm": "desktop",
        }
        channel = channel_aliases.get(channel, channel)

        try:
            if channel == "email":
                return ReminderService._send_email(user, task)
            elif channel == "sms":
                return ReminderService._send_sms(user, title, content)
            elif channel == "web_push":
                return ReminderService._send_web_push(user, title, content, task)
            elif channel == "desktop":
                return ReminderService._send_desktop_notification(user, title, content, task)
            elif channel == "wx":
                return ReminderService._send_wechat(user, title, content)
            elif channel == "app":
                return ReminderService._send_app_push(user, title, content)
            else:
                return ReminderService._send_web_push(user, title, content, task)
        except Exception:
            logger.exception("Failed to send reminder via %s", channel)
            return False

    @staticmethod
    def _send_email(user: User, task: Task) -> bool:
        """Send email notification for a task using improved template."""
        if not user.email:
            return False

        # Determine SMTP config: user-level first, then global env
        from app.services.user_secrets import unseal

        config = ReminderService._get_channel_config(user, "email")
        smtp_host = config.get("smtp_host") or settings.SMTP_HOST
        smtp_user = config.get("smtp_user") or settings.SMTP_USER
        smtp_password = unseal(config.get("smtp_password")) or settings.SMTP_PASSWORD
        smtp_port = int(config.get("smtp_port", settings.SMTP_PORT))
        smtp_from = config.get("smtp_from") or settings.SMTP_FROM or smtp_user

        if not all([smtp_host, smtp_user, smtp_password]):
            logger.warning("[EMAIL] Not configured (neither user config nor env)")
            return False

        from app.utils.email import build_reminder_email, _send_smtp

        subject, html_body, reply_to, message_id = build_reminder_email(
            task_id=task.id,
            task_title=task.title,
            remind_message=f"您的任务「{task.title}」需要您的关注。",
            priority=task.priority or 1,
            due_date=task.due_date,
            description=task.description or "",
        )

        text_body = (
            f"任务提醒：{task.title}\n"
            f"截止时间：{task.due_date}\n"
            f"回复 done（或“完成”）即可完成该任务；也支持 取消/回复 xxx/提醒 时间"
        )

        return _send_smtp(
            to_email=user.email,
            from_addr=smtp_from,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            smtp_host=smtp_host,
            smtp_port=smtp_port,
            smtp_user=smtp_user,
            smtp_password=smtp_password,
            reply_to=reply_to,
            message_id=message_id,
        )

    @staticmethod
    def _send_sms(user: User, title: str, content: str) -> bool:
        """Send SMS notification using user's channel config."""
        config = ReminderService._get_channel_config(user, "sms")
        access_key_id = config.get("access_key_id")

        if not access_key_id:
            from app.core.config import settings as app_settings
            if not app_settings.ALIYUN_ACCESS_KEY_ID:
                logger.warning("[SMS] Not configured")
                return False

        from app.utils.sms import send_sms_mock
        # Use mock for now; real implementation needs user.phone field
        logger.info("[SMS] Would send to user %s: %s", user.id, title)
        return False

    @staticmethod
    def _send_web_push(user: User, title: str, content: str, task: Task = None) -> bool:
        """Send browser web push notification using user's VAPID config."""
        from app.utils.web_push import send_web_push
        priority = (task.priority or 2) if task else 2
        return send_web_push(
            user=user,
            title=title,
            body=content,
            url="/tasks",
            priority=priority
        )

    @staticmethod
    def _send_desktop_notification(user: User, title: str, content: str, task: Task = None) -> bool:
        """Desktop notifications via frontend Web Notification API."""
        from app.utils.web_push import send_web_push
        priority = (task.priority or 2) if task else 2
        return send_web_push(user=user, title=title, body=content, url="/tasks", priority=priority)

    @staticmethod
    def _send_wechat(user: User, title: str, content: str) -> bool:
        """Send WeChat notification using user's config."""
        if not user.wx_openid:
            return False
        config = ReminderService._get_channel_config(user, "wechat")
        template_id = config.get("template_id", "")
        if not template_id:
            logger.warning("[WECHAT] No template_id configured")
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
