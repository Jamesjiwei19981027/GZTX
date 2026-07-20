"""注册/绑定验证码服务。

流程：
1. send_code：生成 6 位数字码，哈希落库（明文只进邮件/短信），60 秒重发间隔、10 分钟有效。
2. verify_code / consume_code：校验并核销；每条码最多试错 5 次。

注册双验证：注册接口对 email+phone 各调 consume_code，两个都过才建号。
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import re
import secrets
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.verification import VerificationCode

logger = logging.getLogger(__name__)

CODE_TTL_MINUTES = 10
RESEND_INTERVAL_SECONDS = 60
MAX_ATTEMPTS = 5

PHONE_RE = re.compile(r"^1[3-9]\d{9}$")


class VerificationError(ValueError):
    """业务校验错误，message 直接可展示给用户"""


def normalize_target(channel: str, target: str) -> str:
    t = (target or "").strip()
    if channel == "email":
        return t.lower()
    return t


def validate_target(channel: str, target: str) -> None:
    if channel == "email":
        if "@" not in target or len(target) > 100:
            raise VerificationError("邮箱格式不正确")
    elif channel == "sms":
        if not PHONE_RE.match(target):
            raise VerificationError("手机号格式不正确（仅支持中国大陆 11 位号码）")
    else:
        raise VerificationError(f"不支持的验证通道: {channel}")


def _hash_code(code: str) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode(), code.encode(), hashlib.sha256
    ).hexdigest()


def generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


async def send_code(
    db: AsyncSession,
    *,
    channel: str,
    target: str,
    purpose: str = "register",
    user_id: int | None = None,
) -> dict:
    """生成并发送验证码。返回 {sent, resend_after}；DEBUG 时附 debug_code。"""
    target = normalize_target(channel, target)
    validate_target(channel, target)

    now = datetime.utcnow()
    q = await db.execute(
        select(VerificationCode)
        .where(
            VerificationCode.channel == channel,
            VerificationCode.target == target,
            VerificationCode.purpose == purpose,
            VerificationCode.consumed_at.is_(None),
        )
        .order_by(VerificationCode.id.desc())
        .limit(1)
    )
    last = q.scalar_one_or_none()
    if last is not None and last.created_at is not None:
        created = last.created_at
        if created.tzinfo is not None:
            created = created.replace(tzinfo=None)
        elapsed = (now - created).total_seconds()
        if elapsed < RESEND_INTERVAL_SECONDS:
            raise VerificationError(
                f"发送过于频繁，请 {int(RESEND_INTERVAL_SECONDS - elapsed)} 秒后重试"
            )

    code = generate_code()
    db.add(
        VerificationCode(
            channel=channel,
            target=target,
            purpose=purpose,
            code_hash=_hash_code(code),
            user_id=user_id,
            attempts=0,
            expires_at=now + timedelta(minutes=CODE_TTL_MINUTES),
        )
    )
    await db.flush()

    delivered = await _deliver(channel, target, code)
    if not delivered:
        raise VerificationError("验证码发送失败，请稍后重试")

    result: dict = {"sent": True, "resend_after": RESEND_INTERVAL_SECONDS}
    if settings.DEBUG:
        # 仅开发联调可见；生产 DEBUG=false 不回显
        result["debug_code"] = code
    return result


async def _deliver(channel: str, target: str, code: str) -> bool:
    if channel == "email":
        from app.utils.email import send_email

        subject = "WorkTodo 验证码"
        body = f"您的验证码是 {code}，{CODE_TTL_MINUTES} 分钟内有效。若非本人操作请忽略。"
        ok = send_email(target, subject, body)
        if not ok and settings.DEBUG:
            # 开发环境未配 SMTP：打日志放行（debug_code 已回显）
            logger.info("[DevEmail] code %s for %s (SMTP not configured)", code, target)
            return True
        return ok
    if channel == "sms":
        from app.services.sms import send_sms_code

        return await send_sms_code(target, code)
    return False


async def consume_code(
    db: AsyncSession,
    *,
    channel: str,
    target: str,
    code: str,
    purpose: str = "register",
) -> None:
    """校验并核销验证码；失败抛 VerificationError。"""
    target = normalize_target(channel, target)
    q = await db.execute(
        select(VerificationCode)
        .where(
            VerificationCode.channel == channel,
            VerificationCode.target == target,
            VerificationCode.purpose == purpose,
            VerificationCode.consumed_at.is_(None),
        )
        .order_by(VerificationCode.id.desc())
        .limit(1)
    )
    rec = q.scalar_one_or_none()
    label = "邮箱" if channel == "email" else "短信"
    if rec is None:
        raise VerificationError(f"{label}验证码不存在或已使用，请重新获取")

    now = datetime.utcnow()
    expires = rec.expires_at
    if expires is not None and expires.tzinfo is not None:
        expires = expires.replace(tzinfo=None)
    if expires is not None and expires < now:
        raise VerificationError(f"{label}验证码已过期，请重新获取")

    if rec.attempts >= MAX_ATTEMPTS:
        raise VerificationError(f"{label}验证码错误次数过多，请重新获取")

    if not hmac.compare_digest(rec.code_hash, _hash_code((code or "").strip())):
        rec.attempts += 1
        await db.flush()
        raise VerificationError(f"{label}验证码错误")

    rec.consumed_at = now
    await db.flush()
