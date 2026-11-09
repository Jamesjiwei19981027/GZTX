"""Task email service - orchestration layer for email reply processing"""
from datetime import datetime, timedelta
from typing import Dict, Optional
from sqlalchemy.orm import Session
from app.services.email_command_parser import EmailCommandParser
from app.services.email_receiver import EmailReceiver
from app.models.email_reply_record import EmailReplyRecord
from app.models.task import Task
from app.models.user import User
from app.utils.email import send_email
from app.core.config import settings


class TaskEmailService:
    """Orchestration layer for processing email replies to tasks"""

    def __init__(self):
        self.parser = EmailCommandParser()
        self.receiver = EmailReceiver()

    def process_email_reply(
        self,
        task_id: int,
        sender_email: str,
        raw_content: str,
        db: Session,
        original_message_id: Optional[str] = None
    ) -> Dict:
        """
        Process email reply workflow:
        1. Validate sender email
        2. Check idempotency (30 min same task_id+command)
        3. Check rate limit (10 per hour per task)
        4. Parse command
        5. Execute command
        6. Save reply record
        7. Update task stats
        8. Send confirmation email
        """
        from app.services.task_service import TaskService
        task_service = TaskService()

        # Query task
        task = task_service.get_task(task_id, db)
        if not task:
            return {"success": False, "command": None, "message": "任务不存在"}

        user_id = task.user_id

        # Validate sender email matches task owner
        user = self._get_user_by_id(user_id, db)
        if not user or not user.email:
            return {"success": False, "command": None, "message": "用户邮箱未配置"}
        if user.email.lower() != sender_email.lower():
            return {
                "success": False,
                "command": None,
                "message": f"发件人邮箱不匹配：任务所属用户邮箱为 {user.email}"
            }

        # Parse command
        parsed = self.parser.parse(raw_content)
        command = parsed["command"]
        params = parsed["params"]

        # Idempotency check: 30 min same task_id + command
        if self._check_idempotent(task_id, command, db):
            return {
                "success": False,
                "command": command,
                "message": "重复操作：30分钟内已处理过相同命令"
            }

        # Rate limit check: max 10 per hour per task
        if self._check_rate_limit(task_id, db):
            return {
                "success": False,
                "command": command,
                "message": "频率限制：1小时内已处理超过10条回复"
            }

        # Execute command
        result = self._execute_command(task, db, command, params, task_service)

        # Save reply record
        self._save_reply_record(
            task_id=task_id,
            user_id=user_id,
            command=command,
            raw_content=raw_content[:2000] if raw_content else "",
            params=params,
            result=result,
            db=db
        )

        # Update task stats
        task.email_reply_count = (task.email_reply_count or 0) + 1
        task.last_reply_at = datetime.utcnow()
        task.last_reply_command = command
        db.commit()

        # Send confirmation email
        if user.email:
            self._send_confirmation_email(
                user_email=user.email,
                task_id=task_id,
                task_title=task.title,
                command=command,
                result=result,
                params=params,
                original_message_id=original_message_id,
                db=db, user=user, company_id=task.company_id,
            )

        return result

    def _get_user_by_id(self, user_id: int, db: Session) -> Optional[User]:
        """Query user by ID"""
        return db.query(User).filter(User.id == user_id).first()

    def _check_idempotent(self, task_id: int, command: str, db: Session) -> bool:
        """Check if same task_id+command was processed within 30 minutes"""
        thirty_min_ago = datetime.utcnow() - timedelta(minutes=30)
        count = db.query(EmailReplyRecord).filter(
            EmailReplyRecord.task_id == task_id,
            EmailReplyRecord.command == command,
            EmailReplyRecord.created_at >= thirty_min_ago,
            EmailReplyRecord.reply_type == "success"
        ).count()
        return count > 0

    def _check_rate_limit(self, task_id: int, db: Session) -> bool:
        """Check if more than 10 replies in the last hour for this task"""
        one_hour_ago = datetime.utcnow() - timedelta(hours=1)
        count = db.query(EmailReplyRecord).filter(
            EmailReplyRecord.task_id == task_id,
            EmailReplyRecord.created_at >= one_hour_ago
        ).count()
        return count >= 10

    def _execute_command(
        self,
        task: Task,
        db: Session,
        command: str,
        params: Dict,
        task_service
    ) -> Dict:
        """Execute the parsed command"""
        if command == "done":
            updated_task = task_service.complete_task(task, db)
            return {
                "success": True,
                "command": "done",
                "task": updated_task,
                "message": "任务已完成"
            }

        elif command == "cancel":
            updated_task = task_service.soft_delete_task(task, db)
            return {
                "success": True,
                "command": "cancel",
                "task": updated_task,
                "message": "任务已取消"
            }

        elif command == "note":
            content = params.get("content", "")
            if task.completion_comment:
                task.completion_comment += f"\n{content}"
            else:
                task.completion_comment = content
            db.commit()
            return {
                "success": True,
                "command": "note",
                "task": task,
                "message": "备注已记录"
            }

        elif command == "remind":
            from app.models.reminder import Reminder
            from datetime import datetime

            time_str = params.get("time", "")
            frequency = params.get("frequency", "")
            count = params.get("count", 1)
            note = params.get("note", "")

            # Parse the ISO datetime string back to datetime object
            if time_str:
                try:
                    remind_at = datetime.fromisoformat(time_str)
                except (ValueError, TypeError):
                    remind_at = datetime.now()
            else:
                remind_at = datetime.now()

            # Create reminder record
            reminder = Reminder(
                task_id=task.id,
                user_id=task.user_id,
                remind_at=remind_at,
                remind_type=3,  # custom
                notify_channels="email",
                is_sent=False
            )
            db.add(reminder)
            db.flush()

            # If note exists, append to completion_comment
            if note:
                if task.completion_comment:
                    task.completion_comment += f"\n{note}"
                else:
                    task.completion_comment = note
                db.commit()

            return {
                "success": True,
                "command": "remind",
                "message": f"已设置提醒：{time_str} {frequency} {count}次",
                "reminder": reminder
            }

        return {"success": False, "command": command, "message": "未知命令"}

    def _save_reply_record(
        self,
        task_id: int,
        user_id: int,
        command: str,
        raw_content: str,
        params: Dict,
        result: Dict,
        db: Session
    ):
        """Save email reply record"""
        record = EmailReplyRecord(
            task_id=task_id,
            user_id=user_id,
            command=command,
            raw_content=raw_content,
            parsed_params=params,
            reply_type="success" if result.get("success") else "failure",
            error_message=result.get("message", "")[:500]
        )
        db.add(record)
        db.commit()

    def _send_confirmation_email(
        self,
        user_email: str,
        task_id: int,
        task_title: str,
        command: str,
        result: Dict,
        params: Dict,
        original_message_id: Optional[str] = None,
        db=None, user=None, company_id: int | None = None,
    ):
        """Send confirmation email with threading support"""
        import time as time_mod

        # Build message body
        if command == "done":
            msg_body = f"已完成：{task_title}"
        elif command == "cancel":
            msg_body = f"已取消：{task_title}"
        elif command == "note":
            content = params.get("content", "")
            msg_body = f"已记录备注：{task_title}\n备注内容：{content}"
        elif command == "remind":
            time_str = params.get("time", "")
            frequency = params.get("frequency", "")
            count = params.get("count", 1)
            msg_body = f"已设置提醒：{task_title}\n提醒时间：{time_str}\n频次：{frequency} {count}次"
        else:
            msg_body = f"已处理：{task_title}"

        subject = f"邮件回复确认：{task_title}"

        timestamp = int(time_mod.time())
        message_id = f"<confirm-{task_id}-{timestamp}@{settings.EMAIL_REPLY_DOMAIN}>"

        send_email(
            user_email,
            subject,
            msg_body,
            message_id=message_id,
            in_reply_to=original_message_id,
            db=db, user=user, company_id=company_id,
        )
