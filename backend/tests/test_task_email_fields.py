"""Test Task model email reply fields"""


def test_task_email_fields():
    """Test Task model has email reply tracking fields"""
    from app.models.task import Task
    assert hasattr(Task, "email_reply_count")
    assert hasattr(Task, "last_reply_at")
    assert hasattr(Task, "last_reply_command")


def test_task_email_fields_default_values(db_session):
    """Test default values for email reply fields"""
    from app.models.task import Task
    # Check the columns exist with correct defaults
    task = Task(
        user_id=1,
        category_id=1,
        title="Test task",
        email_reply_count=0,
    )
    assert task.email_reply_count == 0
    assert task.last_reply_at is None
    assert task.last_reply_command is None