"""真实企业单点登录；一次性 state 绑定发起浏览器，账号仅限受邀成员。"""
import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlparse

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError

from app.core.collab_errors import CollabError
from app.core.config import settings
from app.core.dependencies import DbSession
from app.models.company import Company, CompanyMembership
from app.models.integration import IntegrationAccount
from app.models.sso import SsoLoginAttempt
from app.models.user import User
from app.schemas.common import ResponseData
from app.services.login_methods import login_enabled
from app.services.secret_box import decrypt_str
from app.services.sso.matching import assert_member_can_login, bind_identity, match_member
from app.services.sso.oidc import get_sso_provider

router = APIRouter(prefix="/sso", tags=["单点登录"])
SUPPORTED = {"dingtalk", "oidc"}
COOKIE = "worktodo_sso_browser"


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _callback_uri(provider: str):
    base = settings.APP_URL.rstrip("/")
    parsed = urlparse(base)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.query or parsed.fragment:
        raise ValueError("请配置完整的应用访问地址")
    return f"{base}/api/v1/sso/{provider}/callback"


def _return_path(value: str):
    parsed = urlparse(value)
    if (not value.startswith("/") or value.startswith("//") or "\\" in value
        or parsed.netloc or parsed.scheme or parsed.fragment or any(ord(c) < 32 for c in value)):
        raise CollabError(422, 42200, "返回页面地址无效")
    return value


async def _single_company(db, company_id: int | None = None):
    """全局 User 令牌不能把一个租户的 IdP 当作其他租户的身份权威。"""
    if settings.DEPLOY_MODE != "single_company":
        return None
    companies = list((await db.scalars(select(Company))).all())
    default = next((c for c in companies if c.slug == settings.DEFAULT_COMPANY_SLUG), None)
    canonical = default or (companies[0] if len(companies) == 1 else None)
    return canonical if canonical and (company_id is None or canonical.id == company_id) else None


async def _assert_single_company(db, company_id: int, user_id: int | None = None):
    if not await _single_company(db, company_id):
        raise CollabError(403, 40300, "当前单点登录仅支持单企业部署的默认企业")
    if user_id is not None:
        other = await db.scalar(select(CompanyMembership.id).where(CompanyMembership.user_id == user_id,
            CompanyMembership.company_id != company_id, CompanyMembership.status == "active",
            CompanyMembership.employment_status == "active").limit(1))
        if other:
            raise CollabError(403, 40300, "跨企业任职账号暂不支持单点登录，请联系管理员")


async def _integration_sso_config(db, company_id: int, provider: str) -> dict:
    acc = await db.scalar(select(IntegrationAccount).where(IntegrationAccount.company_id == company_id,
        IntegrationAccount.provider == provider).order_by(IntegrationAccount.id.desc()).limit(1))
    if not acc:
        return {}
    try:
        creds = json.loads(decrypt_str(acc.credentials_encrypted))
        return {**(acc.config_json or {}), **creds} if isinstance(creds, dict) else {}
    except (ValueError, TypeError):
        return {}


def _check_provider(provider):
    if provider not in SUPPORTED:
        raise CollabError(403, 40300, "该登录方式下一期支持")


@router.get("/options", response_model=ResponseData, summary="获取已启用的企业单点登录入口")
async def sso_options(db: DbSession, company_id: int | None = Query(None)):
    """登录页只暴露已配置、已启用的入口，不公开应用凭据。"""
    canonical = await _single_company(db, company_id)
    companies = [canonical] if canonical else []
    items = []
    for company in companies:
        for provider in sorted(SUPPORTED):
            if not login_enabled(company, provider):
                continue
            cfg = await _integration_sso_config(db, company.id, provider)
            required = ("corp_id", "app_key", "app_secret") if provider == "dingtalk" else ("issuer", "client_id", "client_secret")
            if all(cfg.get(key) for key in required):
                items.append({"provider": provider, "company_id": company.id, "company_name": company.name})
    return ResponseData(data={"items": items})


class CompleteBody(BaseModel):
    ticket: str = Field(min_length=20, max_length=256)


def _token_response(user, company_id):
    from app.api.v1.auth import _issue_tokens
    data = _issue_tokens(user).data.model_dump()
    data.update(user_id=user.id, company_id=company_id)
    return ResponseData(data=data)


@router.post("/complete", response_model=ResponseData, summary="兑换一次性企业登录凭据")
async def sso_complete(body: CompleteBody, request: Request, response: Response, db: DbSession):
    now = _now()
    attempt = await db.scalar(select(SsoLoginAttempt).where(SsoLoginAttempt.ticket_hash == _hash(body.ticket)))
    cookie = request.cookies.get(COOKIE, "")
    if not attempt or not cookie or not secrets.compare_digest(attempt.browser_hash, _hash(cookie)):
        raise CollabError(422, 42200, "登录凭据无效，请重新发起单点登录")
    result = await db.execute(update(SsoLoginAttempt).where(SsoLoginAttempt.state_hash == attempt.state_hash,
        SsoLoginAttempt.completed_at.is_(None), SsoLoginAttempt.ticket_expires_at > now).values(completed_at=now))
    await db.commit()
    if result.rowcount != 1:
        raise CollabError(422, 42200, "登录凭据已过期或已使用，请重新登录")
    company = await db.get(Company, attempt.company_id)
    if not company or not login_enabled(company, attempt.provider):
        raise CollabError(403, 40300, "公司未启用该登录方式")
    user = await db.get(User, attempt.user_id)
    member = await db.scalar(select(CompanyMembership).where(CompanyMembership.company_id == attempt.company_id,
        CompanyMembership.user_id == attempt.user_id))
    if not user or not member:
        raise CollabError(403, 40302, "请联系管理员邀请你加入")
    assert_member_can_login(member, user)
    await _assert_single_company(db, company.id, user.id)
    response.headers["Cache-Control"] = "no-store"
    return _token_response(user, company.id)


@router.get("/{provider}/start", response_model=ResponseData, summary="发起企业单点登录授权")
async def sso_start(provider: str, request: Request, response: Response, db: DbSession, company_id: int = Query(...),
                    return_to: str = Query("/", max_length=2048)):
    _check_provider(provider)
    return_to = _return_path(return_to)
    company = await db.get(Company, company_id)
    if not company:
        raise CollabError(404, 40400, "公司不存在")
    if not login_enabled(company, provider):
        raise CollabError(403, 40300, "公司未启用该登录方式")
    await _assert_single_company(db, company.id)
    config = await _integration_sso_config(db, company_id, provider)
    state, nonce = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    browser = request.cookies.get(COOKIE) or secrets.token_urlsafe(32)
    try:
        sp = get_sso_provider(provider, config=config)
        url = await sp.authorize_url(company_id=company_id, state=state, redirect_uri=_callback_uri(provider), nonce=nonce)
    except ValueError as exc:
        raise CollabError(422, 42200, str(exc)) from exc
    await db.execute(delete(SsoLoginAttempt).where(SsoLoginAttempt.expires_at < _now() - timedelta(days=1)))
    db.add(SsoLoginAttempt(state_hash=_hash(state), browser_hash=_hash(browser), company_id=company_id,
                           provider=provider, nonce=nonce, return_to=return_to, expires_at=_now() + timedelta(minutes=10)))
    await db.flush()
    response.set_cookie(COOKIE, browser, httponly=True, secure=settings.APP_URL.startswith("https://"), samesite="lax", max_age=900, path="/api/v1/sso")
    response.headers["Cache-Control"] = "no-store"
    return ResponseData(data={"authorize_url": url, "provider": provider, "configured": True})


@router.get("/{provider}/callback", response_model=ResponseData, summary="处理企业单点登录回调")
async def sso_callback(provider: str, request: Request, response: Response, db: DbSession,
                       code: str | None = Query(None), authCode: str | None = Query(None),
                       state: str = Query("", max_length=256), company_id: int | None = Query(None),
                       error: str | None = Query(None)):
    _check_provider(provider)
    now = _now()
    attempt = await db.get(SsoLoginAttempt, _hash(state)) if state else None
    cookie = request.cookies.get(COOKIE, "")
    if (not attempt or attempt.provider != provider or not cookie
        or not secrets.compare_digest(attempt.browser_hash, _hash(cookie))
        or (company_id is not None and company_id != attempt.company_id)):
        raise CollabError(422, 42200, "登录状态校验失败，请重新发起单点登录")
    result = await db.execute(update(SsoLoginAttempt).where(SsoLoginAttempt.state_hash == attempt.state_hash,
        SsoLoginAttempt.consumed_at.is_(None), SsoLoginAttempt.expires_at > now).values(consumed_at=now))
    # 消费必须独立持久化；后续供应商拒绝/超时也不能重用同一 state。
    await db.commit()
    if result.rowcount != 1:
        raise CollabError(422, 42200, "登录状态已过期或已使用，请重新发起单点登录")
    company = await db.get(Company, attempt.company_id)
    if not company or not login_enabled(company, provider):
        raise CollabError(403, 40300, "公司未启用该登录方式")
    await _assert_single_company(db, company.id)
    if error or not (authCode or code):
        raise CollabError(422, 42200, "授权未完成，请返回登录页重试")
    cfg = await _integration_sso_config(db, company.id, provider)
    try:
        sp = get_sso_provider(provider, config=cfg)
        ident = await sp.exchange_code(authCode or code, redirect_uri=_callback_uri(provider), nonce=attempt.nonce)
    except ValueError as exc:
        raise CollabError(422, 42200, str(exc)) from exc
    matched = await match_member(db, company.id, provider=provider, issuer=ident.issuer,
        external_id=ident.external_id, email=ident.email, mobile=ident.mobile)
    if not matched:
        raise CollabError(403, 40302, "请联系管理员邀请你加入")
    membership, user = matched
    assert_member_can_login(membership, user)
    await _assert_single_company(db, company.id, user.id)
    try:
        await bind_identity(db, company.id, user.id, ident)
    except IntegrityError as exc:
        await db.rollback()
        raise CollabError(403, 40302, "企业身份绑定冲突，请联系管理员") from exc
    response.headers["Cache-Control"] = "no-store"
    if "text/html" in request.headers.get("accept", ""):
        ticket = secrets.token_urlsafe(32)
        attempt.ticket_hash = _hash(ticket)
        attempt.user_id = user.id
        attempt.ticket_expires_at = now + timedelta(minutes=1)
        await db.flush()
        app_origin = urlparse(settings.APP_URL)
        return_url = f"{app_origin.scheme}://{app_origin.netloc}{_return_path(attempt.return_to)}"
        return RedirectResponse(return_url + "#" + urlencode({"sso_ticket": ticket}),
                                status_code=303, headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})
    return _token_response(user, company.id)
