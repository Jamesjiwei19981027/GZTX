"""SMS sending utility (Aliyun)."""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.core.config import settings


def send_sms_aliyun(
    phone_number: str,
    template_param: dict,
    template_code: Optional[str] = None,
    sign_name: Optional[str] = None
) -> bool:
    """Send SMS via Aliyun.

    Args:
        phone_number: Recipient phone number
        template_param: Template parameters dict
        template_code: SMS template code
        sign_name: SMS signature name

    Returns:
        True if sent successfully
    """
    if not settings.ALIYUN_ACCESS_KEY_ID or not settings.ALIYUN_ACCESS_KEY_SECRET:
        print("[SMS] Aliyun SMS not configured, skipping")
        return False

    try:
        # 阿里云 SDK 导入（需要安装 alibabacloud_dysmsapi20170525）
        # pip install alibabacloud_dysmsapi20170525
        from alibabacloud_dysmsapi20170525 import models as dysmsapi_models
        from alibabacloud_tea_openapi import models as open_api_models
        from alibabacloud_dysmsapi20170525.client import Client

        config = open_api_models.Config(
            access_key_id=settings.ALIYUN_ACCESS_KEY_ID,
            access_key_secret=settings.ALIYUN_ACCESS_KEY_SECRET
        )
        config.endpoint = "dysmsapi.aliyuncs.com"
        client = Client(config)

        send_req = dysmsapi_models.SendSmsRequest(
            phone_numbers=phone_number,
            sign_name=sign_name or settings.ALIYUN_SMS_SIGN_NAME,
            template_code=template_code or settings.ALIYUN_SMS_TEMPLATE_CODE,
            template_param=json.dumps(template_param)
        )

        resp = client.send_sms(send_req)
        if resp.body.code == "OK":
            print(f"[SMS] Sent to {phone_number}")
            return True
        else:
            print(f"[SMS] Failed: {resp.body.message}")
            return False

    except ImportError:
        print("[SMS] Aliyun SDK not installed, run: pip install alibabacloud_dysmsapi20170525")
        return False
    except Exception as e:
        print(f"[SMS] Error: {e}")
        return False


def send_sms_mock(phone_number: str, content: str) -> bool:
    """Mock SMS sender for testing."""
    print(f"[SMS MOCK] To: {phone_number}, Content: {content}")
    return True
