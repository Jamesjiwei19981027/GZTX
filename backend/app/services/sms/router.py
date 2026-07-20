"""按 SMS_PROVIDER 路由到具体短信服务商。

当前实现：fake（开发桩）。接入阿里云/腾讯云时在此注册新 provider，
风格与 asr/storage router 一致。
"""
from app.core.config import settings
from app.services.sms.fake import FakeSmsProvider

_PROVIDERS = {
    "fake": FakeSmsProvider,
}


def resolve_provider():
    key = (getattr(settings, "SMS_PROVIDER", "fake") or "fake").lower()
    cls = _PROVIDERS.get(key)
    if cls is None:
        raise ValueError(f"不支持的 SMS_PROVIDER: {key}")
    return cls()


async def send_sms_code(phone: str, code: str) -> bool:
    provider = resolve_provider()
    return await provider.send_code(phone, code)
