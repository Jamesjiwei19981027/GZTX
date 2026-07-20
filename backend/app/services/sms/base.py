"""短信通道抽象"""
from __future__ import annotations

from typing import Protocol


class SmsProvider(Protocol):
    async def send_code(self, phone: str, code: str) -> bool:
        """发送验证码短信，成功返回 True"""
        ...
