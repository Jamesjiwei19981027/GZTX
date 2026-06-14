"""Test TaskEmailService"""
import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch


def test_process_done_command(mocker, db_session):
    """Test processing done command"""
    from app.services.task_email_service import TaskEmailService
    from app.models.task import Task
    from app.models.user import User

    # Create test user and task
    user = User(id=1, username="test", email="test@example.com")
    task = Task(id=1, title="Test Task", user_id=1, category_id=1, status=0)
    db_session.add(user)
    db_session.add(task)
    db_session.commit()

    # Mock TaskService.complete_task
    mock_complete = mocker.patch(
        "app.services.task_email_service.TaskService.complete_task",
        return_value=task
    )
    # Mock send_email to avoid actual sending
    mocker.patch("app.services.task_email_service.send_email")

    service = TaskEmailService()
    result = service.process_email_reply(
        task_id=1,
        sender_email="test@example.com",
        raw_content="完成",
        db=db_session
    )

    assert result["success"] is True
    assert result["command"] == "done"
    mock_complete.assert_called_once()


def test_process_cancel_uses_soft_delete(mocker, db_session):
    """Test cancel command uses soft_delete_task"""
    from app.services.task_email_service import TaskEmailService
    from app.models.task import Task
    from app.models.user import User

    user = User(id=1, username="test", email="test@example.com")
    task = Task(id=1, title="Test Task", user_id=1, category_id=1, status=0)
    db_session.add(user)
    db_session.add(task)
    db_session.commit()

    mock_soft_delete = mocker.patch(
        "app.services.task_email_service.TaskService.soft_delete_task",
        return_value=task
    )
    mocker.patch("app.services.task_email_service.send_email")

    service = TaskEmailService()
    result = service.process_email_reply(
        task_id=1,
        sender_email="test@example.com",
        raw_content="取消",
        db=db_session
    )

    assert result["success"] is True
    assert result["command"] == "cancel"
    mock_soft_delete.assert_called_once()


def test_process_note_updates_completion_comment(mocker, db_session):
    """Test note command appends to completion_comment"""
    from app.services.task_email_service import TaskEmailService
    from app.models.task import Task
    from app.models.user import User

    user = User(id=1, username="test", email="test@example.com")
    task = Task(id=1, title="Test Task", user_id=1, category_id=1, status=0, completion_comment=None)
    db_session.add(user)
    db_session.add(task)
    db_session.commit()

    mocker.patch("app.services.task_email_service.TaskService.get_task", return_value=task)
    mocker.patch("app.services.task_email_service.send_email")

    service = TaskEmailService()
    result = service.process_email_reply(
        task_id=1,
        sender_email="test@example.com",
        raw_content="回复 你好，已收到",
        db=db_session
    )

    assert result["success"] is True
    assert result["command"] == "note"
    assert "你好，已收到" in task.completion_comment


def test_idempotent_protection(mocker, db_session):
    """Test idempotent protection: 30 min same task_id+command"""
    from app.services.task_email_service import TaskEmailService
    from app.models.email_reply_record import EmailReplyRecord
    from app.models.task import Task
    from app.models.user import User

    user = User(id=1, username="test", email="test@example.com")
    task = Task(id=1, title="Test Task", user_id=1, category_id=1, status=0)
    db_session.add(user)
    db_session.add(task)

    # Add a recent record with same command
    recent_record = EmailReplyRecord(
        task_id=1,
        user_id=1,
        command="done",
        raw_content="完成",
        reply_type="success",
        created_at=datetime.utcnow()
    )
    db_session.add(recent_record)
    db_session.commit()

    service = TaskEmailService()
    result = service.process_email_reply(
        task_id=1,
        sender_email="test@example.com",
        raw_content="完成",
        db=db_session
    )

    assert result["success"] is False
    assert "重复" in result["message"]


def test_rate_limiting(mocker, db_session):
    """Test rate limiting: max 10 per hour per task"""
    from app.services.task_email_service import TaskEmailService
    from app.models.email_reply_record import EmailReplyRecord
    from app.models.task import Task
    from app.models.user import User

    user = User(id=1, username="test", email="test@example.com")
    task = Task(id=1, title="Test Task", user_id=1, category_id=1, status=0)
    db_session.add(user)
    db_session.add(task)

    # Add 10 recent records
    for i in range(10):
        record = EmailReplyRecord(
            task_id=1,
            user_id=1,
            command="note",
            raw_content=f"备注{i}",
            reply_type="success",
            created_at=datetime.utcnow()
        )
        db_session.add(record)
    db_session.commit()

    service = TaskEmailService()
    result = service.process_email_reply(
        task_id=1,
        sender_email="test@example.com",
        raw_content="回复 新备注",
        db=db_session
    )

    assert result["success"] is False
    assert "频率" in result["message"]


def test_sender_email_verification(mocker, db_session):
    """Test sender email must match task owner"""
    from app.services.task_email_service import TaskEmailService
    from app.models.task import Task
    from app.models.user import User

    user = User(id=1, username="test", email="real_owner@example.com")
    task = Task(id=1, title="Test Task", user_id=1, category_id=1, status=0)
    db_session.add(user)
    db_session.add(task)
    db_session.commit()

    mocker.patch("app.services.task_email_service.TaskService.get_task", return_value=task)

    service = TaskEmailService()
    result = service.process_email_reply(
        task_id=1,
        sender_email="wrong@example.com",
        raw_content="完成",
        db=db_session
    )

    assert result["success"] is False
    assert "邮箱" in result["message"]