"""Test reminder email modifications.

build_reminder_email 返回 (subject, html_body, reply_to, message_id) 元组，
由 reminder_service 传给 _send_smtp 写入邮件头。
"""
import hmac
import hashlib
from app.utils.email import build_reminder_email
from app.core.config import settings


def _build(task_id=42, title="测试任务", message="该完成任务了"):
    return build_reminder_email(
        task_id=task_id,
        task_title=title,
        remind_message=message,
    )


def test_reminder_email_has_reply_to():
    """Reply-To 地址带 HMAC 签名"""
    _, _, reply_to, _ = _build()
    assert reply_to is not None

    sig = hmac.new(
        settings.EMAIL_REPLY_SECRET.encode(),
        b"42",
        hashlib.sha256
    ).hexdigest()[:16]
    expected = f"reply-42-{sig}@{settings.EMAIL_REPLY_DOMAIN}"
    assert reply_to == expected


def test_reminder_email_has_message_id():
    """Message-ID 格式为 <task-{task_id}-{timestamp}@{EMAIL_REPLY_DOMAIN}>"""
    _, _, _, message_id = _build()
    assert message_id is not None
    assert "task-42-" in message_id
    assert settings.EMAIL_REPLY_DOMAIN in message_id
    assert message_id.startswith("<") and message_id.endswith(">")


def test_reminder_email_instructions():
    """正文包含操作指引，不包含「请勿回复」类文案"""
    _, html_body, _, _ = _build()
    assert "直接回复此邮件" in html_body
    assert "请勿直接回复" not in html_body
    assert "请勿回复" not in html_body


def test_reminder_email_no_duplication():
    """主题中标题只出现一次"""
    subject, _, _, _ = _build(task_id=1, title="Test Task", message="Remember to do this")
    assert subject.count("Test Task") == 1
