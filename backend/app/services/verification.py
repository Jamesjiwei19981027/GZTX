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

from pydantic import EmailStr, TypeAdapter
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.models.verification import VerificationCode

logger = logging.getLogger(__name__)

CODE_TTL_MINUTES = 10
RESEND_INTERVAL_SECONDS = 60
MAX_ATTEMPTS = 5

PHONE_RE = re.compile(r"^1[3-9]\d{9}$")

# 与注册接口（UserRegister.email: EmailStr）同一套邮箱校验，
# 保证 send-code 与 register 的接受口径一致（如均拒绝 .local 等保留域名）。
_EMAIL_VALIDATOR: TypeAdapter[EmailStr] = TypeAdapter(EmailStr)


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
        try:
            _EMAIL_VALIDATOR.validate_python(target)
        except PydanticValidationError as e:
            raise VerificationError("邮箱格式不正确") from e
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


async def _register_failed_attempt(db: AsyncSession, code_id: int) -> int:
    """在独立事务中原子自增试错次数，返回自增后的值。

    必须走独立会话：调用方随后抛 VerificationError，路由层转成 HTTPException，
    而 get_db 对任何冒泡异常都 `rollback()`，在请求会话内自增会被一并回滚，
    MAX_ATTEMPTS 将永远不触发（防爆破形同虚设）。

    自增用 SQL 侧 `attempts + 1` 保证并发原子；一旦用尽立即把该码置为已核销，
    避免并发请求在计数落库前集体通过前置检查。
    """
    bind = db.bind
    factory = async_sessionmaker(bind, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        await s.execute(
            update(VerificationCode)
            .where(VerificationCode.id == code_id)
            .values(attempts=VerificationCode.attempts + 1)
        )
        attempts = int(
            (
                await s.execute(
                    select(VerificationCode.attempts).where(
                        VerificationCode.id == code_id
                    )
                )
            ).scalar_one_or_none()
            or 0
        )
        if attempts >= MAX_ATTEMPTS:
            await s.execute(
                update(VerificationCode)
                .where(
                    VerificationCode.id == code_id,
                    VerificationCode.consumed_at.is_(None),
                )
                .values(consumed_at=datetime.utcnow())
            )
        await s.commit()
    return attempts


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
        attempts = await _register_failed_attempt(db, rec.id)
        if attempts >= MAX_ATTEMPTS:
            raise VerificationError(f"{label}验证码错误次数过多，请重新获取")
        raise VerificationError(f"{label}验证码错误")

    rec.consumed_at = now
    await db.flush()
