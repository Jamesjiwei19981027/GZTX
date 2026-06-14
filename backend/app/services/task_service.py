from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session

from app.models.task import Task
from app.models.reminder import Reminder


class TaskService:
    """Service for task-related business logic."""

    @staticmethod
    def get_task(task_id: int, db: Session) -> Optional[Task]:
        """Get task by ID"""
        return db.query(Task).filter(Task.id == task_id, Task.is_deleted == False).first()

    @staticmethod
    def soft_delete_task(task: Task, db: Session) -> Task:
        """Soft delete a task."""
        from datetime import datetime
        task.is_deleted = True
        task.deleted_at = datetime.now()
        db.commit()
        return task

    @staticmethod
    def generate_recurring_instance(
        task: Task,
        instance_date: str,
        db: Session
    ) -> Optional[Task]:
        """Generate a recurring task instance for a specific date.

        This is used when a recurring task needs to have custom
        modifications for a specific occurrence.
        """
        # Check if instance already exists
        existing = db.query(Task).filter(
            Task.parent_task_id == task.id,
            Task.due_date == instance_date
        ).first()

        if existing:
            return existing

        # Create new instance as a copy of parent
        instance = Task(
            user_id=task.user_id,
            category_id=task.category_id,
            title=task.title,
            description=task.description,
            priority=task.priority,
            status=0,
            due_date=instance_date,
            is_recurring=False,
            parent_task_id=task.id
        )
        db.add(instance)
        db.commit()
        return instance

    @staticmethod
    def complete_task(task: Task, db: Session) -> Task:
        """Mark a task as completed and handle recurring logic."""
        from datetime import datetime

        task.status = 2
        task.completed_at = datetime.now()

        # If this is a recurring task instance, don't create next instance
        # If this is a recurring task template, generate next instance
        if task.is_recurring and not task.parent_task_id:
            next_date = TaskService._calculate_next_occurrence(
                task.due_date,
                task.recurrence_rule
            )
            if next_date:
                TaskService.generate_recurring_instance(task, next_date, db)

        db.commit()
        return task

    @staticmethod
    def _calculate_next_occurrence(
        current_date,
        recurrence_rule: Dict[str, Any]
    ) -> Optional[str]:
        """Calculate next occurrence date based on recurrence rule."""
        if not recurrence_rule:
            return None

        frequency = recurrence_rule.get("frequency", "daily")
        interval = recurrence_rule.get("interval", 1)

        from datetime import timedelta

        if frequency == "daily":
            next_date = current_date + timedelta(days=interval)
        elif frequency == "weekly":
            next_date = current_date + timedelta(weeks=interval)
        elif frequency == "monthly":
            # Simple month addition
            month = current_date.month + interval
            year = current_date.year + (month - 1) // 12
            month = (month - 1) % 12 + 1
            next_date = current_date.replace(year=year, month=month)
        elif frequency == "yearly":
            next_date = current_date.replace(year=current_date.year + interval)
        else:
            return None

        return next_date