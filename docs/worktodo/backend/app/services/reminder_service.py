from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.reminder import Reminder
from app.models.task import Task
from app.models.user import User


class ReminderService:
    """提醒服务 - 处理定时任务检查和通知发送"""

    def __init__(self, db: Session):
        self.db = db

    def get_pending_reminders(self, limit: int = 100) -> List[Reminder]:
        """获取待发送的提醒"""
        now = datetime.now(timezone.utc)
        return self.db.query(Reminder).filter(
            Reminder.is_sent == False,
            Reminder.remind_at <= now
        ).limit(limit).all()

    def send_reminder(self, reminder: Reminder) -> bool:
        """发送提醒（模拟实现）"""
        try:
            # 获取任务信息
            task = self.db.query(Task).filter(Task.id == reminder.task_id).first()
            if not task:
                return False

            # 获取用户信息
            user = self.db.query(User).filter(User.id == reminder.user_id).first()
            if not user:
                return False

            # 根据用户偏好发送通知
            # 这里只是标记为已发送，实际实现需要调用微信/邮件等服务
            reminder.is_sent = True
            reminder.sent_at = datetime.now(timezone.utc)

            # 触发通知（实际实现时调用相应的通知服务）
            self._notify_user(user, task, reminder)

            self.db.commit()
            return True
        except Exception as e:
            self.db.rollback()
            print(f"发送提醒失败: {e}")
            return False

    def _notify_user(self, user: User, task: Task, reminder: Reminder) -> None:
        """通知用户（实际实现时调用相应的通知服务）"""
        notify_pref = user.notify_pref or {}

        # 这里只是打印日志，实际实现需要：
        # 1. 发送微信订阅消息
        # 2. 发送邮件
        # 3. 发送 Web 推送
        print(f"[通知] 用户 {user.username}: 任务 '{task.title}' 的提醒时间到了")

    def process_reminders(self) -> int:
        """处理所有待发送的提醒"""
        pending = self.get_pending_reminders()
        success_count = 0

        for reminder in pending:
            if self.send_reminder(reminder):
                success_count += 1

        return success_count


def check_and_send_reminders(db: Session) -> int:
    """检查并发送提醒（供 APScheduler 调用）"""
    service = ReminderService(db)
    return service.process_reminders()