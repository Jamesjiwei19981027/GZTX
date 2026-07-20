"""开发态短信桩：验证码打日志，不真发。

DEBUG=true 时 send_sms_code 的返回还会带 debug_code 便于联调。
"""
import logging

logger = logging.getLogger(__name__)


class FakeSmsProvider:
    async def send_code(self, phone: str, code: str) -> bool:
        logger.info("[FakeSMS] send code %s to %s", code, phone)
        return True
