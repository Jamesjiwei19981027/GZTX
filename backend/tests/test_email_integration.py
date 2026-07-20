"""Email reply integration tests"""
import hmac
import hashlib
from app.core.config import settings
from app.services.email_receiver import EmailReceiver
from app.services.email_command_parser import EmailCommandParser
from app.utils.email import build_reminder_email


def test_hmac_reply_address_roundtrip():
    """Test HMAC signature address generation and extraction roundtrip"""
    receiver = EmailReceiver()

    # Generate address
    task_id = 99
    addr = receiver.generate_reply_address(task_id)

    # Extract back
    extracted_id = receiver.extract_task_id(addr)
    assert extracted_id == task_id, f"Expected {task_id}, got {extracted_id}"

    # Tampered signature should fail
    parts = addr.split("-")
    tampered = addr.replace(parts[2].split("@")[0], "0" * 16)
    assert receiver.extract_task_id(tampered) is None


def test_command_parser_with_dateparser():
    """Test command parser with dateparser integration"""
    parser = EmailCommandParser()

    # Chinese time
    result = parser.parse("提醒 明天上午10点 每天 3次")
    assert result["command"] == "remind"
    assert result["params"]["time"] is not None
    assert result["params"]["frequency"] == "每天"
    assert result["params"]["count"] == 3


def test_reminder_email_has_reply_to_and_message_id():
    """Test reminder email contains Reply-To and Message-ID"""
    _, _, reply_to, message_id = build_reminder_email(
        task_id=42,
        task_title="测试任务",
        remind_message="该完成任务了"
    )

    assert reply_to is not None
    assert "reply-42-" in reply_to
    assert message_id is not None
    assert "task-42-" in message_id


def test_email_body_quote_filtering():
    """Test email body quote filtering"""
    receiver = EmailReceiver()

    # Original email with quotes and signature
    body = """完成

> 原始消息
> 更多引用

On 2026-06-13, someone wrote:
> 回复此邮件

--
签名档
"""

    filtered = receiver.filter_email_body(body)
    assert filtered.strip() == "完成"
    assert ">" not in filtered
    assert "--" not in filtered


def test_command_parsing_all_commands():
    """Test all command parsing"""
    parser = EmailCommandParser()

    # Done
    result = parser.parse("完成")
    assert result["command"] == "done"

    # Done English
    result = parser.parse("done")
    assert result["command"] == "done"

    # Cancel
    result = parser.parse("取消")
    assert result["command"] == "cancel"

    # Cancel English
    result = parser.parse("cancel")
    assert result["command"] == "cancel"

    # Note
    result = parser.parse("回复 测试内容")
    assert result["command"] == "note"
    assert result["params"]["content"] == "测试内容"

    # Note English
    result = parser.parse("note 测试内容")
    assert result["command"] == "note"

    # Remind
    result = parser.parse("提醒 明天 10:00 每天 3次")
    assert result["command"] == "remind"

    # Unknown becomes note
    result = parser.parse("随便写点什么")
    assert result["command"] == "note"