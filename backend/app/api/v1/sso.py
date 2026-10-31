"""SSO start/callback — 仅已入会成员可登录；禁止自动加公司 / 自动注册

授权 URL / client_id / redirect 优先读公司「集成配置」(IntegrationAccount)。
"""
import json

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.core.collab_errors import CollabError
from app.core.dependencies import DbSession
from app.core.security import create_access_token
from app.models.company import Company, CompanyMembership
from app.models.integration import IntegrationAccount
from app.models.user import User
from app.schemas.common import ResponseData
from app.services.policy_presets import DEFAULT_LOGIN_METHODS
from app.services.secret_box import decrypt_str
from app.services.sso.oidc import get_sso_provider

router = APIRouter(prefix="/sso", tags=["单点登录"])

PROVIDER_LOGIN_KEY = {
    "wecom": "wecom",
    "dingtalk": "dingtalk",
    "feishu": "feishu",
    "oidc": "oidc",
}


def _login_enabled(company: Company, provider: str) -> bool:
    lm = company.login_methods_json or DEFAULT_LOGIN_METHODS
    key = PROVIDER_LOGIN_KEY.get(provider, provider)
    if key == "oidc":
        return bool(lm.get("oidc", False))
    return bool(lm.get(key, False))


async def _integration_sso_config(db, company_id: int, provider: str) -> dict:
    """合并 IntegrationAccount 的 config + 非密钥凭据，供 authorize_url 使用。"""
    q = await db.execute(
        select(IntegrationAccount)
        .where(
            IntegrationAccount.company_id == company_id,
            IntegrationAccount.provider == provider,
        )
        .order_by(IntegrationAccount.id.desc())
        .limit(1)
    )
    acc = q.scalar_one_or_none()
    if not acc:
        return {}
    cfg = dict(acc.config_json or {})
    try:
        creds = json.loads(decrypt_str(acc.credentials_encrypted))
        if isinstance(creds, dict):
            for k in ("client_id", "corp_id", "app_id", "app_key", "agent_id"):
                if creds.get(k) and not cfg.get(k):
                    cfg[k] = creds[k]
    except Exception:
        pass
    return cfg


@router.get("/{provider}/start", response_model=ResponseData)
async def sso_start(
    provider: str,
    db: DbSession,
    company_id: int = Query(...),
):
    """发起单点登录跳转"""
    if provider not in PROVIDER_LOGIN_KEY:
        raise CollabError(404, 40400, f"未知 SSO provider: {provider}")
    company = await db.get(Company, company_id)
    if not company:
        raise CollabError(404, 40400, "公司不存在")
    if not _login_enabled(company, provider):
        raise CollabError(403, 40300, "公司未启用该登录方式")

    integ = await _integration_sso_config(db, company_id, provider)
    sp = get_sso_provider(provider, config=integ)
    default_redir = integ.get("redirect_uri") or f"/api/v1/sso/{provider}/callback"
    url = sp.authorize_url(
        company_id=company_id,
        state=f"{company_id}:{provider}",
        redirect_uri=default_redir,
    )
    return ResponseData(
        data={
            "authorize_url": url,
            "provider": provider,
            "configured": bool(integ),
        }
    )


@router.get("/{provider}/callback", response_model=ResponseData)
async def sso_callback(
    provider: str,
    db: DbSession,
    code: str = Query(...),
    state: str = Query(""),
    company_id: int | None = Query(None),
):
    """单点登录回调"""
    if provider not in PROVIDER_LOGIN_KEY:
        raise CollabError(404, 40400, f"未知 SSO provider: {provider}")

    cid = company_id
    if not cid and state and ":" in state:
        try:
            cid = int(state.split(":")[0])
        except ValueError:
            cid = None
    if not cid:
        raise CollabError(422, 42200, "缺少 company_id")

    company = await db.get(Company, cid)
    if not company:
        raise CollabError(404, 40400, "公司不存在")
    if not _login_enabled(company, provider):
        raise CollabError(403, 40300, "公司未启用该登录方式")

    integ = await _integration_sso_config(db, cid, provider)
    sp = get_sso_provider(provider, config=integ)
    try:
        ident = await sp.exchange_code(code)
    except ValueError as e:
        msg = str(e)
        if msg == "sso_stub_disabled":
            raise CollabError(403, 40300, "SSO 桩已禁用，请配置真实 IdP") from e
        raise CollabError(422, 42200, "无效的 SSO code") from e

    user = None
    if ident.email:
        uq = await db.execute(select(User).where(User.email == ident.email))
        user = uq.scalar_one_or_none()
    if not user and ident.external_id:
        mq_ext = await db.execute(
            select(CompanyMembership).where(
                CompanyMembership.company_id == company.id,
                CompanyMembership.external_user_id == ident.external_id,
            )
        )
        m_ext = mq_ext.scalar_one_or_none()
        if m_ext:
            user = await db.get(User, m_ext.user_id)

    if not user:
        raise CollabError(403, 40302, "账号未注册或不属于该公司，请联系管理员邀请")

    mq = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.user_id == user.id,
        )
    )
    membership = mq.scalar_one_or_none()
    if not membership or membership.status != "active":
        raise CollabError(403, 40302, "非本公司成员，请先被邀请加入")
    if membership.employment_status != "active":
        raise CollabError(403, 40314, "在职状态无效，禁止登录协作域")

    membership.external_user_id = ident.external_id
    await db.flush()

    token = create_access_token(data={"sub": user.id})
    return ResponseData(
        data={
            "access_token": token,
            "token_type": "bearer",
            "user_id": user.id,
            "company_id": company.id,
        }
    )
