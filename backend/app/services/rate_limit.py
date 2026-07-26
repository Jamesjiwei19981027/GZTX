"""认证类接口限流（固定窗口，DB 支撑）。

两个必须落库的理由：
1. 生产是 gunicorn -w 4，进程内计数会被摊薄成 1/4 并在重启后清零；
2. 计数必须走**独立会话**提交——限流命中后调用方抛 HTTPException，
   get_db 对冒泡异常整体 rollback，写在请求会话里的自增会被一起回滚，
   限流就跟 verification 的 MAX_ATTEMPTS 一样形同虚设。

窗口为固定窗口而非滑动窗口：实现简单、单条 UPDATE 即可原子自增；
代价是窗口交界处最多放行 2 倍额度，对防爆破量级来说可以接受。
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta

from fastapi import HTTPException, Request
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.models.rate_limit import RateLimitCounter

logger = logging.getLogger(__name__)

# 每 N 次限流检查顺手清理一次过期计数行，避免表无限增长
_PURGE_EVERY = 500
_purge_tick = 0


def client_ip(request: Request | None) -> str:
    """取客户端 IP。

    生产经 nginx 反代，真实 IP 在 X-Forwarded-For 首段（nginx 配置里用
    $proxy_add_x_forwarded_for 追加）。仅在 TRUST_PROXY_HEADERS 打开时采信，
    否则外部可伪造该头绕过限流。
    """
    if request is None:
        return "unknown"
    if settings.TRUST_PROXY_HEADERS:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()
        real = request.headers.get("x-real-ip")
        if real:
            return real.strip()
    return request.client.host if request.client else "unknown"


async def _bump(db: AsyncSession, key: str, window_seconds: int) -> int:
    """原子自增 key 的窗口计数并返回自增后的值（独立事务提交）。"""
    global _purge_tick

    factory = async_sessionmaker(db.bind, class_=AsyncSession, expire_on_commit=False)
    expires_at = datetime.utcnow() + timedelta(seconds=window_seconds * 2)
    async with factory() as s:
        result = await s.execute(
            update(RateLimitCounter)
            .where(RateLimitCounter.bucket_key == key)
            .values(count=RateLimitCounter.count + 1)
        )
        if result.rowcount == 0:
            s.add(RateLimitCounter(bucket_key=key, count=1, expires_at=expires_at))
            try:
                await s.commit()
                return 1
            except IntegrityError:
                # 并发插入撞唯一索引：回到自增路径
                await s.rollback()
                await s.execute(
                    update(RateLimitCounter)
                    .where(RateLimitCounter.bucket_key == key)
                    .values(count=RateLimitCounter.count + 1)
                )

        count = int(
            (
                await s.execute(
                    select(RateLimitCounter.count).where(
                        RateLimitCounter.bucket_key == key
                    )
                )
            ).scalar_one_or_none()
            or 1
        )

        _purge_tick += 1
        if _purge_tick % _PURGE_EVERY == 0:
            await s.execute(
                delete(RateLimitCounter).where(
                    RateLimitCounter.expires_at < datetime.utcnow()
                )
            )

        await s.commit()
        return count


async def enforce(
    db: AsyncSession,
    *,
    scope: str,
    identifier: str,
    limit: int,
    window_seconds: int,
) -> None:
    """记一次命中；超过 limit 抛 429。identifier 为空则跳过（无可限流的维度）。"""
    if not settings.RATE_LIMIT_ENABLED or not identifier or limit <= 0:
        return

    bucket = int(time.time()) // window_seconds
    key = f"{scope}:{identifier}:{bucket}"
    try:
        count = await _bump(db, key, window_seconds)
    except Exception:  # noqa: BLE001 — 限流故障不应阻断正常登录
        logger.exception("rate limit backend failed for %s", scope)
        return

    if count > limit:
        retry_after = window_seconds - (int(time.time()) % window_seconds)
        logger.warning("rate limit hit scope=%s identifier=%s count=%s", scope, identifier, count)
        raise HTTPException(
            status_code=429,
            detail=f"操作过于频繁，请 {retry_after} 秒后重试",
            headers={"Retry-After": str(retry_after)},
        )


async def enforce_login(
    db: AsyncSession, request: Request | None, account: str | None
) -> None:
    """登录类接口：IP 与账号双维度限流。

    账号维度防的是分布式撞库（单账号被大量 IP 试），IP 维度防的是单机穷举。
    """
    await enforce(
        db,
        scope="login:ip",
        identifier=client_ip(request),
        limit=settings.RATE_LIMIT_LOGIN_PER_IP,
        window_seconds=settings.RATE_LIMIT_LOGIN_WINDOW,
    )
    if account:
        await enforce(
            db,
            scope="login:account",
            identifier=account.strip().lower(),
            limit=settings.RATE_LIMIT_LOGIN_PER_ACCOUNT,
            window_seconds=settings.RATE_LIMIT_LOGIN_WINDOW,
        )


async def enforce_send_code(
    db: AsyncSession, request: Request | None, target: str | None
) -> None:
    """发码接口：IP 与目标双维度日额度，防短信/邮件轰炸与费用消耗。"""
    await enforce(
        db,
        scope="sendcode:ip",
        identifier=client_ip(request),
        limit=settings.RATE_LIMIT_SEND_CODE_PER_IP,
        window_seconds=settings.RATE_LIMIT_SEND_CODE_WINDOW,
    )
    if target:
        await enforce(
            db,
            scope="sendcode:target",
            identifier=target.strip().lower(),
            limit=settings.RATE_LIMIT_SEND_CODE_PER_TARGET,
            window_seconds=settings.RATE_LIMIT_SEND_CODE_WINDOW,
        )
