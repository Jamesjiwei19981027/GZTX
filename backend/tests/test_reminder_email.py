"""Test reminder email modifications"""
import hmac
import hashlib
from app.utils.email import build_reminder_email
from app.core.config import settings


def test_reminder_email_has_reply_to():
    """Test reminder email includes Reply-To with HMAC signature"""
    msg = build_reminder_email(
        task_id=42,
        task_title="测试任务",
        remind_message="该完成任务了"
    )
    reply_to = msg.get("Reply-To")
    assert reply_to is not None

    # Verify Reply-To address format
    sig = hmac.new(
        settings.EMAIL_REPLY_SECRET.encode(),
        b"42",
        hashlib.sha256
    ).hexdigest()[:16]
    expected = f"reply-42-{sig}@{settings.EMAIL_REPLY_DOMAIN}"
    assert reply_to == expected


def test_reminder_email_has_message_id():
    """Test reminder email includes Message-ID"""
    msg = build_reminder_email(
        task_id=42,
        task_title="测试任务",
        remind_message="该完成任务了"
    )
    message_id = msg.get("Message-ID")
    assert message_id is not None
    # Format: <task-{task_id}-{timestamp}@{EMAIL_REPLY_DOMAIN}>
    assert "task-42-" in message_id
    assert settings.EMAIL_REPLY_DOMAIN in message_id


def test_reminder_email_instructions():
    """Test reminder email includes operation instructions instead of '请勿回复'"""
    msg = build_reminder_email(
        task_id=42,
        task_title="测试任务",
        remind_message="该完成任务了"
    )

    # Get body content from multipart message
    body = ""
    for part in msg.walk():
        if part.get_content_type() == "text/plain":
            payload = part.get_payload(decode=True)
            if payload:
                body = payload.decode("utf-8")
                break

    # Should include operation instructions
    assert "直接回复此邮件即可操作任务" in body
    # Should NOT include "请勿回复"
    assert "请勿回复" not in body


def test_reminder_email_no_duplication():
    """Test reminder email subject is not duplicated"""
    msg = build_reminder_email(
        task_id=1,
        task_title="Test Task",
        remind_message="Remember to do this"
    )
    subject = msg.get("Subject")
    # Subject should only contain the title once
    assert subject.count("Test Task") == 1