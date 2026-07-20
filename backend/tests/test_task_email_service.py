"""Test TaskEmailService（同步服务，调度器侧使用 SyncSessionLocal）"""
from datetime import datetime

from app.services.task_email_service import TaskEmailService
from app.models.email_reply_record import EmailReplyRecord
from app.models.category import Category
from app.models.task import Task
from app.models.user import User


def _seed(db, email="test@example.com"):
    user = User(id=1, username="test", email=email, password_hash="x")
    category = Category(id=1, user_id=1, name="默认", is_default=True)
    task = Task(id=1, title="Test Task", user_id=1, category_id=1, status=0)
    db.add(user)
    db.add(category)
    db.add(task)
    db.commit()
    return user, task


def test_process_done_command(mocker, sync_db_session):
    """完成命令走 TaskService.complete_task"""
    _, task = _seed(sync_db_session)

    mock_complete = mocker.patch(
        "app.services.task_service.TaskService.complete_task",
        return_value=task,
    )
    mocker.patch("app.services.task_email_service.send_email")

    result = TaskEmailService().process_email_reply(
        task_id=1,
        sender_email="test@example.com",
        raw_content="完成",
        db=sync_db_session,
    )

    assert result["success"] is True
    assert result["command"] == "done"
    mock_complete.assert_called_once()


def test_process_cancel_uses_soft_delete(mocker, sync_db_session):
    """取消命令走软删除"""
    _, task = _seed(sync_db_session)

    mock_soft_delete = mocker.patch(
        "app.services.task_service.TaskService.soft_delete_task",
        return_value=task,
    )
    mocker.patch("app.services.task_email_service.send_email")

    result = TaskEmailService().process_email_reply(
        task_id=1,
        sender_email="test@example.com",
        raw_content="取消",
        db=sync_db_session,
    )

    assert result["success"] is True
    assert result["command"] == "cancel"
    mock_soft_delete.assert_called_once()


def test_process_note_updates_completion_comment(mocker, sync_db_session):
    """备注命令追加到 completion_comment"""
    _, task = _seed(sync_db_session)
    mocker.patch("app.services.task_email_service.send_email")

    result = TaskEmailService().process_email_reply(
        task_id=1,
        sender_email="test@example.com",
        raw_content="回复 你好，已收到",
        db=sync_db_session,
    )

    assert result["success"] is True
    assert result["command"] == "note"
    assert "你好，已收到" in task.completion_comment


def test_idempotent_protection(mocker, sync_db_session):
    """幂等保护：30 分钟内相同 task_id+command 拒绝"""
    _seed(sync_db_session)
    sync_db_session.add(
        EmailReplyRecord(
            task_id=1,
            user_id=1,
            command="done",
            raw_content="完成",
            reply_type="success",
            created_at=datetime.utcnow(),
        )
    )
    sync_db_session.commit()

    result = TaskEmailService().process_email_reply(
        task_id=1,
        sender_email="test@example.com",
        raw_content="完成",
        db=sync_db_session,
    )

    assert result["success"] is False
    assert "重复" in result["message"]


def test_rate_limiting(mocker, sync_db_session):
    """频率限制：每任务每小时最多 10 条"""
    _seed(sync_db_session)
    for i in range(10):
        sync_db_session.add(
            EmailReplyRecord(
                task_id=1,
                user_id=1,
                command="note",
                raw_content=f"备注{i}",
                reply_type="success",
                created_at=datetime.utcnow(),
            )
        )
    sync_db_session.commit()

    # 用与既有记录不同的命令，避开幂等检查、命中频率限制
    result = TaskEmailService().process_email_reply(
        task_id=1,
        sender_email="test@example.com",
        raw_content="完成",
        db=sync_db_session,
    )

    assert result["success"] is False
    assert "频率" in result["message"]


def test_sender_email_verification(mocker, sync_db_session):
    """发件人必须是任务所有者邮箱"""
    _seed(sync_db_session, email="real_owner@example.com")

    result = TaskEmailService().process_email_reply(
        task_id=1,
        sender_email="wrong@example.com",
        raw_content="完成",
        db=sync_db_session,
    )

    assert result["success"] is False
    assert "邮箱" in result["message"]
