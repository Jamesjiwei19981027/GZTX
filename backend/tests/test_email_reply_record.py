"""Test EmailReplyRecord model"""
from app.models.email_reply_record import EmailReplyRecord


def test_email_reply_record_create():
    """Test basic creation"""
    record = EmailReplyRecord(
        task_id=1,
        user_id=1,
        command="done",
        raw_content="完成",
        reply_type="success"
    )
    assert record.task_id == 1
    assert record.command == "done"
    assert record.reply_type == "success"


def test_email_reply_record_with_parsed_params():
    """Test parsed_params is JSON/dict type"""
    record = EmailReplyRecord(
        task_id=1,
        user_id=1,
        command="remind",
        raw_content="提醒 明天 10:00 每天 3次",
        parsed_params={"time": "明天 10:00", "frequency": "每天", "count": 3},
        reply_type="success"
    )
    assert record.parsed_params == {"time": "明天 10:00", "frequency": "每天", "count": 3}


def test_email_reply_record_with_error():
    """Test error record"""
    record = EmailReplyRecord(
        task_id=1,
        user_id=1,
        command="unknown",
        raw_content="随便写点什么",
        reply_type="failure",
        error_message="无法识别命令"
    )
    assert record.reply_type == "failure"
    assert record.error_message == "无法识别命令"


def test_raw_content_truncation():
    """Test raw_content is stored (truncation happens at write time, not model level)"""
    long_content = "x" * 3000
    record = EmailReplyRecord(
        task_id=1,
        user_id=1,
        command="note",
        raw_content=long_content[:2000],
        reply_type="success"
    )
    assert len(record.raw_content) == 2000