"""Test EmailCommandParser"""
from app.services.email_command_parser import EmailCommandParser


def test_parse_done():
    """Test parsing done command"""
    parser = EmailCommandParser()
    result = parser.parse("完成")
    assert result["command"] == "done"
    assert result["params"] == {}


def test_parse_done_english():
    """Test parsing done command in English"""
    parser = EmailCommandParser()
    result = parser.parse("done")
    assert result["command"] == "done"


def test_parse_cancel():
    """Test parsing cancel command"""
    parser = EmailCommandParser()
    result = parser.parse("取消")
    assert result["command"] == "cancel"


def test_parse_note():
    """Test parsing note command"""
    parser = EmailCommandParser()
    result = parser.parse("回复 你好，已收到")
    assert result["command"] == "note"
    assert result["params"]["content"] == "你好，已收到"


def test_parse_note_english():
    """Test parsing note command in English"""
    parser = EmailCommandParser()
    result = parser.parse("note 你好")
    assert result["command"] == "note"


def test_parse_remind():
    """Test parsing remind command"""
    parser = EmailCommandParser()
    result = parser.parse("提醒 明天 10:00 每天 3次")
    assert result["command"] == "remind"
    assert "time" in result["params"]
    assert result["params"]["frequency"] == "每天"
    assert result["params"]["count"] == 3


def test_parse_remind_with_note():
    """Test parsing remind command with note"""
    parser = EmailCommandParser()
    result = parser.parse("提醒 明天 10:00 每天 3次 备注：需要跟进")
    assert result["command"] == "remind"
    assert result["params"]["note"] == "需要跟进"


def test_parse_unknown():
    """Test parsing unknown content becomes note"""
    parser = EmailCommandParser()
    result = parser.parse("随便写点什么")
    assert result["command"] == "note"
    assert result["params"]["content"] == "随便写点什么"


def test_parse_with_email_quotes_filtered():
    """Test parsing content with email quotes already filtered"""
    parser = EmailCommandParser()
    content = """完成

> 原始消息内容
> 更多引用

On 2026-06-13, admin wrote:
> 提醒你完成任务"""
    result = parser.parse(content)
    assert result["command"] == "done"


def test_parse_remind_time_with_dateparser():
    """Test dateparser parses Chinese time correctly"""
    parser = EmailCommandParser()
    result = parser.parse("提醒 后天下午3点 每周")
    assert result["command"] == "remind"
    assert result["params"]["time"] is not None


def test_parse_empty():
    """Test parsing empty content"""
    parser = EmailCommandParser()
    result = parser.parse("")
    assert result["command"] == "note"
    assert result["params"]["content"] == ""


def test_parse_daily_english():
    """Test parsing frequency in English"""
    parser = EmailCommandParser()
    result = parser.parse("remind tomorrow 10:00 daily 3")
    assert result["command"] == "remind"
    assert result["params"]["frequency"] == "daily"
    assert result["params"]["count"] == 3