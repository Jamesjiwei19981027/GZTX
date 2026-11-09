"""SMTP 配置解析：用户前端配置 > 公司前端配置 > 环境变量。

密码不得回显；公司级凭证经 secret_box 加密落库。
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

logger = logging.getLogger(__name__)

PROVIDER_SMTP = "smtp"


@dataclass
class ResolvedSmtp:
    host: str
    port: int
    user: str
    password: str
    from_addr: str
    source: str  # user | company | env

    def is_complete(self) -> bool:
        return bool(
            (self.host or "").strip()
            and (self.user or "").strip()
            and (self.password or "").strip()
        )


def _user_email_channel(user) -> dict[str, Any]:
    if not user:
        return {}
    pref = getattr(user, "notify_pref", None) or {}
    channels = pref.get("channels") or {}
    email = channels.get("email") or {}
    return dict(email) if isinstance(email, dict) else {}


def smtp_from_user(user) -> ResolvedSmtp | None:
    from app.services.user_secrets import unseal

    cfg = _user_email_channel(user)
    host = (cfg.get("smtp_host") or "").strip()
    user_name = (cfg.get("smtp_user") or "").strip()
    password = unseal(cfg.get("smtp_password"))
    if not (host and user_name and password):
        return None
    port = int(cfg.get("smtp_port") or 465)
    from_addr = (cfg.get("smtp_from") or user_name or "").strip()
    return ResolvedSmtp(
        host=host,
        port=port,
        user=user_name,
        password=str(password),
        from_addr=from_addr,
        source="user",
    )


def smtp_from_env() -> ResolvedSmtp | None:
    host = (settings.SMTP_HOST or "").strip()
    user_name = (settings.SMTP_USER or "").strip()
    password = settings.SMTP_PASSWORD or ""
    if not (host and user_name and password):
        return None
    from_addr = (settings.SMTP_FROM or user_name or "").strip()
    return ResolvedSmtp(
        host=host,
        port=int(settings.SMTP_PORT or 465),
        user=user_name,
        password=str(password),
        from_addr=from_addr,
        source="env",
    )


def _load_company_blob(acc) -> dict[str, Any]:
    from app.services.secret_box import decrypt_str

    if not acc or not acc.credentials_encrypted:
        return {}
    try:
        raw = decrypt_str(acc.credentials_encrypted)
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception as e:
        logger.warning("decrypt company smtp failed: %s", e)
        return {}


async def get_company_smtp_account(db: AsyncSession, company_id: int):
    from app.models.integration import IntegrationAccount

    q = await db.execute(
        select(IntegrationAccount)
        .where(
            IntegrationAccount.company_id == company_id,
            IntegrationAccount.provider == PROVIDER_SMTP,
        )
        .order_by(IntegrationAccount.id.desc())
        .limit(1)
    )
    return q.scalar_one_or_none()


def _resolved_from_account(acc) -> ResolvedSmtp | None:
    if not acc:
        return None
    cfg = _load_company_blob(acc)
    # 非密字段也可在 config_json
    conf = dict(acc.config_json or {})
    host = (cfg.get("smtp_host") or conf.get("smtp_host") or "").strip()
    user_name = (cfg.get("smtp_user") or conf.get("smtp_user") or "").strip()
    password = cfg.get("smtp_password") or ""
    if not (host and user_name and password):
        return None
    port = int(cfg.get("smtp_port") or conf.get("smtp_port") or 465)
    from_addr = (
        cfg.get("smtp_from") or conf.get("smtp_from") or user_name or ""
    ).strip()
    return ResolvedSmtp(
        host=host,
        port=port,
        user=user_name,
        password=str(password),
        from_addr=from_addr,
        source="company",
    )


async def smtp_from_company(db: AsyncSession, company_id: int | None) -> ResolvedSmtp | None:
    if not company_id:
        return None
    return _resolved_from_account(await get_company_smtp_account(db, company_id))


async def smtp_for_system(db: AsyncSession, company_id: int | None = None) -> ResolvedSmtp | None:
    """系统发信（验证码等，没有“当前用户”）：指定公司 > 默认公司 > 环境变量。"""
    if company_id:
        c = await smtp_from_company(db, company_id)
        if c and c.is_complete():
            return c
    try:
        from app.services.register_join import get_default_company

        co = await get_default_company(db)
        if co and co.id != company_id:
            c = await smtp_from_company(db, co.id)
            if c and c.is_complete():
                return c
    except Exception as e:  # pragma: no cover - 防御：解析失败退回环境变量
        logger.warning("resolve default company smtp failed: %s", e)
    return smtp_from_env()


def smtp_for_system_sync(db, company_id: int | None = None) -> ResolvedSmtp | None:
    """同步会话版（提醒调度用）：指定公司 > 默认公司 > 环境变量。"""
    from app.models.company import Company
    from app.models.integration import IntegrationAccount

    def _acc(cid: int):
        return (
            db.execute(
                select(IntegrationAccount)
                .where(
                    IntegrationAccount.company_id == cid,
                    IntegrationAccount.provider == PROVIDER_SMTP,
                )
                .order_by(IntegrationAccount.id.desc())
                .limit(1)
            )
            .scalars()
            .first()
        )

    try:
        ids: list[int] = []
        if company_id:
            ids.append(company_id)
        slug = (settings.DEFAULT_COMPANY_SLUG or "default").strip()
        if slug:
            co = db.execute(select(Company).where(Company.slug == slug)).scalars().first()
            if co and co.id not in ids:
                ids.append(co.id)
        for cid in ids:
            c = _resolved_from_account(_acc(cid))
            if c and c.is_complete():
                return c
    except Exception as e:  # pragma: no cover
        logger.warning("resolve company smtp (sync) failed: %s", e)
    return smtp_from_env()


async def resolve_smtp(
    db: AsyncSession | None = None,
    *,
    user=None,
    company_id: int | None = None,
) -> ResolvedSmtp | None:
    """优先级：用户前端 SMTP > 公司前端 SMTP > 环境变量。"""
    u = smtp_from_user(user)
    if u and u.is_complete():
        return u
    if db is not None and company_id:
        c = await smtp_from_company(db, company_id)
        if c and c.is_complete():
            return c
    # 无 company_id 时尝试默认公司（单公司部署欢迎信）
    if db is not None and not company_id:
        try:
            from app.services.register_join import get_default_company

            co = await get_default_company(db)
            if co:
                c = await smtp_from_company(db, co.id)
                if c and c.is_complete():
                    return c
        except Exception:
            pass
    return smtp_from_env()


def public_smtp_view(cfg: dict[str, Any] | None) -> dict[str, Any]:
    """脱敏视图：永不返回密码明文。"""
    cfg = cfg or {}
    return {
        "smtp_host": cfg.get("smtp_host") or "",
        "smtp_port": int(cfg.get("smtp_port") or 465),
        "smtp_user": cfg.get("smtp_user") or "",
        "smtp_from": cfg.get("smtp_from") or "",
        "has_password": bool(cfg.get("smtp_password")),
    }


async def company_smtp_public(db: AsyncSession, company_id: int) -> dict[str, Any]:
    acc = await get_company_smtp_account(db, company_id)
    if not acc:
        return {
            "smtp_host": "",
            "smtp_port": 465,
            "smtp_user": "",
            "smtp_from": "",
            "has_password": False,
            "configured": False,
            "source": "company",
        }
    blob = _load_company_blob(acc)
    conf = dict(acc.config_json or {})
    merged = {
        "smtp_host": blob.get("smtp_host") or conf.get("smtp_host") or "",
        "smtp_port": blob.get("smtp_port") or conf.get("smtp_port") or 465,
        "smtp_user": blob.get("smtp_user") or conf.get("smtp_user") or "",
        "smtp_from": blob.get("smtp_from") or conf.get("smtp_from") or "",
        "smtp_password": blob.get("smtp_password") or "",
    }
    view = public_smtp_view(merged)
    view["configured"] = bool(
        view["smtp_host"] and view["smtp_user"] and view["has_password"]
    )
    view["source"] = "company"
    return view


async def save_company_smtp(
    db: AsyncSession,
    company_id: int,
    *,
    smtp_host: str | None = None,
    smtp_port: int | None = None,
    smtp_user: str | None = None,
    smtp_password: str | None = None,
    smtp_from: str | None = None,
) -> dict[str, Any]:
    """保存公司 SMTP；密码空字符串表示不改动已有密码。"""
    from app.models.integration import IntegrationAccount
    from app.services.secret_box import encrypt_str

    acc = await get_company_smtp_account(db, company_id)
    prev = _load_company_blob(acc) if acc else {}
    conf = dict(acc.config_json or {}) if acc else {}

    def pick(key: str, new_val, default=""):
        if new_val is not None:
            return new_val
        return prev.get(key) or conf.get(key) or default

    host = str(pick("smtp_host", smtp_host, "")).strip()
    user_name = str(pick("smtp_user", smtp_user, "")).strip()
    from_addr = str(pick("smtp_from", smtp_from, "")).strip()
    port = int(pick("smtp_port", smtp_port, 465) or 465)

    if smtp_password is not None and str(smtp_password) != "":
        password = str(smtp_password)
    else:
        password = str(prev.get("smtp_password") or "")

    blob = {
        "smtp_host": host,
        "smtp_port": port,
        "smtp_user": user_name,
        "smtp_password": password,
        "smtp_from": from_addr or user_name,
    }
    # 非密字段副本便于排查（密码仅密文）
    config_public = {
        "smtp_host": host,
        "smtp_port": port,
        "smtp_user": user_name,
        "smtp_from": from_addr or user_name,
    }
    enc = encrypt_str(json.dumps(blob, sort_keys=True))
    if acc:
        acc.credentials_encrypted = enc
        acc.config_json = config_public
    else:
        acc = IntegrationAccount(
            company_id=company_id,
            provider=PROVIDER_SMTP,
            credentials_encrypted=enc,
            config_json=config_public,
        )
        db.add(acc)
    await db.flush()
    return await company_smtp_public(db, company_id)


def env_smtp_public() -> dict[str, Any]:
    r = smtp_from_env()
    if not r:
        return {
            "smtp_host": (settings.SMTP_HOST or "").strip(),
            "smtp_port": int(settings.SMTP_PORT or 465),
            "smtp_user": (settings.SMTP_USER or "").strip(),
            "smtp_from": (settings.SMTP_FROM or "").strip(),
            "has_password": bool(settings.SMTP_PASSWORD),
            "configured": False,
            "source": "env",
        }
    return {
        "smtp_host": r.host,
        "smtp_port": r.port,
        "smtp_user": r.user,
        "smtp_from": r.from_addr,
        "has_password": True,
        "configured": True,
        "source": "env",
    }
