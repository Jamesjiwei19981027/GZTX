"""Test EmailReceiver"""
import pytest
from app.services.email_receiver import EmailReceiver


def test_email_receiver_init():
    """Test initialization uses correct config names"""
    receiver = EmailReceiver()
    assert receiver.imap_host is not None
    assert receiver.imap_port == 993


def test_extract_task_id_with_hmac():
    """Test extracting task_id from reply-{task_id}-{sig}@domain format with HMAC verification"""
    receiver = EmailReceiver()

    import hmac
    import hashlib
    from app.core.config import settings
    task_id = 42
    sig = hmac.new(
        settings.EMAIL_REPLY_SECRET.encode(),
        str(task_id).encode(),
        hashlib.sha256
    ).hexdigest()[:16]
    to_addr = f"reply-{task_id}-{sig}@{settings.EMAIL_REPLY_DOMAIN}"

    result = receiver.extract_task_id(to_addr)
    assert result == 42


def test_extract_task_id_invalid_signature():
    """Test signature mismatch returns None"""
    receiver = EmailReceiver()
    from app.core.config import settings
    to_addr = f"reply-42-invalidsignature00@{settings.EMAIL_REPLY_DOMAIN}"
    result = receiver.extract_task_id(to_addr)
    assert result is None


def test_extract_task_id_malformed():
    """Test malformed addresses return None"""
    receiver = EmailReceiver()
    assert receiver.extract_task_id("") is None
    assert receiver.extract_task_id("not-a-reply@domain.com") is None
    assert receiver.extract_task_id("reply-abc-def@domain.com") is None


def test_filter_email_quotes():
    """Test filtering email quotes and signatures"""
    receiver = EmailReceiver()
    raw_body = """完成

> 这是引用内容
> 也是引用

On 2026-06-13, someone wrote:
> more quotes

--
这是签名档
"""
    filtered = receiver.filter_email_body(raw_body)
    assert filtered.strip() == "完成"


def test_decode_quoted_printable():
    """Test quoted-printable decoding"""
    receiver = EmailReceiver()
    # =E4=BD=A0=E5=A5=BD is "你好" in QP encoding
    decoded = receiver.decode_body_payload(
        payload=b"=E4=BD=A0=E5=A5=BD",
        encoding="quoted-printable",
        charset="utf-8"
    )
    assert decoded == "你好"


def test_decode_base64():
    """Test base64 decoding"""
    receiver = EmailReceiver()
    import base64
    encoded = base64.b64encode("完成".encode("utf-8"))
    decoded = receiver.decode_body_payload(
        payload=encoded,
        encoding="base64",
        charset="utf-8"
    )
    assert decoded == "完成"


def test_generate_reply_address():
    """Test generating reply address with HMAC signature"""
    receiver = EmailReceiver()
    from app.core.config import settings
    import hmac
    import hashlib

    task_id = 99
    addr = receiver.generate_reply_address(task_id)

    # Verify format
    assert addr.startswith(f"reply-{task_id}-")
    assert addr.endswith(f"@{settings.EMAIL_REPLY_DOMAIN}")

    # Verify the HMAC is correct by extracting and comparing
    local_part = addr.split("@")[0]
    sig = local_part.split("-")[2]
    expected_sig = hmac.new(
        settings.EMAIL_REPLY_SECRET.encode(),
        str(task_id).encode(),
        hashlib.sha256
    ).hexdigest()[:16]
    assert sig == expected_sig