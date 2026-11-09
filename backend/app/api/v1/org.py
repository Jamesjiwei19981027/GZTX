"""组织树 · 集成账号（前端可配置） · 同步 · 登录方式"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps_collab import get_company, require_company_member, require_super_admin
from app.core.collab_errors import CollabError
from app.core.config import settings
from app.core.dependencies import CurrentUser, DbSession
from app.models.company import Company, OrgUnit
from app.models.integration import IntegrationAccount
from app.schemas.common import ResponseData
from app.services.org_sync.generic import GenericSnapshotProvider
from app.services.org_sync.runner import run_org_sync
from app.services.org_sync.wecom import WeComProvider
from app.services.org_sync.dingtalk import DingTalkOrgProvider
from app.services.org_sync.dingtalk_runner import run_dingtalk_sync
from app.services.policy_presets import DEFAULT_LOGIN_METHODS
from app.services.secret_box import decrypt_str, encrypt_str

router = APIRouter(prefix="/companies", tags=["组织架构"])

# 支持在公司设置页配置的集成类型
KNOWN_PROVIDERS = frozenset(
    {"dingtalk", "oidc", "generic_scim", "generic"}
)

# 写入时若为空串则保留库中旧密钥（避免前端回显占位符覆盖）
SECRET_PLACEHOLDER = "********"


class IntegrationCreate(BaseModel):
    provider: str = Field(..., min_length=1, max_length=32)
    credentials: dict = Field(default_factory=dict)
    config: dict | None = None


class IntegrationUpsert(BaseModel):
    """按 provider 幂等保存（前端表单主路径）。"""

    provider: str = Field(..., min_length=1, max_length=32)
    credentials: dict = Field(default_factory=dict)
    config: dict | None = None
    # 非密钥的公开配置也可只放 config；credentials 只放 secret/token


class LoginMethodsPatch(BaseModel):
    password: bool | None = None
    wechat: bool | None = None
    wecom: bool | None = None
    dingtalk: bool | None = None
    feishu: bool | None = None
    oidc: bool | None = None
    saml: bool | None = None


def _unit_dto(u: OrgUnit) -> dict:
    return {
        "id": u.id,
        "parent_id": u.parent_id,
        "name": u.name,
        "external_id": u.external_id,
        "source": u.source or "manual",
        "leader_user_id": u.leader_user_id,
        "path": u.path or "/",
        "is_active": bool(u.is_active),
    }


def _load_credentials(acc: IntegrationAccount) -> dict:
    try:
        raw = decrypt_str(acc.credentials_encrypted)
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _redact_credentials(creds: dict) -> dict:
    """列表接口不回传真实密钥，仅告知是否已配置。"""
    out: dict = {}
    secret_keys = {
        "secret",
        "corp_secret",
        "client_secret",
        "app_secret",
        "token",
        "password",
        "private_key",
        "aes_key",
    }
    for k, v in (creds or {}).items():
        kl = str(k).lower()
        if kl in secret_keys or "secret" in kl or "password" in kl or "token" in kl:
            out[k] = SECRET_PLACEHOLDER if v else ""
            out[f"{k}_configured"] = bool(v)
        else:
            out[k] = v
    return out


def _merge_credentials(old: dict, new: dict) -> dict:
    """新值为占位符或空时保留旧密钥。"""
    merged = dict(old or {})
    for k, v in (new or {}).items():
        if v is None:
            continue
        if isinstance(v, str) and (v == SECRET_PLACEHOLDER or v == ""):
            if k not in merged:
                merged[k] = old.get(k, "")
            continue
        merged[k] = v
    return merged


def _integration_dto(acc: IntegrationAccount, *, include_redacted_creds: bool = True) -> dict:
    creds = _load_credentials(acc) if include_redacted_creds else {}
    return {
        "id": acc.id,
        "provider": acc.provider,
        "config": acc.config_json or {},
        "credentials": _redact_credentials(creds) if include_redacted_creds else {},
        "has_credentials": bool(creds),
        "last_sync_at": acc.last_sync_at.isoformat() if acc.last_sync_at else None,
        "last_sync_report": (acc.config_json or {}).get("last_sync_report"),
        "callback_uri": f"{settings.APP_URL.rstrip('/')}/api/v1/sso/{acc.provider}/callback",
        "created_at": acc.created_at.isoformat() if acc.created_at else None,
    }


def _provider_form_schema(provider: str) -> dict:
    """前端动态表单：字段定义（无密钥明文）。"""
    common_note = "密钥仅保存加密，列表接口以 ******** 表示已配置"
    schemas = {
        "wecom": {
            "label": "企业微信",
            "credential_fields": [
                {"key": "corp_id", "label": "企业 ID (corpId)", "secret": False},
                {"key": "secret", "label": "应用 Secret", "secret": True},
                {"key": "agent_id", "label": "应用 AgentId", "secret": False},
            ],
            "config_fields": [
                {
                    "key": "api_base",
                    "label": "API 基址（可选）",
                    "placeholder": "https://qyapi.weixin.qq.com",
                },
                {
                    "key": "redirect_uri",
                    "label": "OAuth 回调 URL",
                    "placeholder": "https://你的域名/api/v1/sso/wecom/callback",
                },
                {
                    "key": "trusted_domain",
                    "label": "可信域名（展示用）",
                    "placeholder": "app.example.com",
                },
                {
                    "key": "auto_create_users",
                    "label": "同步时自动创建用户",
                    "type": "boolean",
                },
            ],
            "note": common_note,
        },
        "oidc": {
            "label": "通用 OIDC",
            "credential_fields": [
                {"key": "client_id", "label": "Client ID", "secret": False},
                {"key": "client_secret", "label": "Client Secret", "secret": True},
            ],
            "config_fields": [
                {
                    "key": "issuer",
                    "label": "Issuer",
                    "placeholder": "https://idp.example.com",
                },
                {
                    "key": "authorize_url",
                    "label": "授权 URL",
                    "placeholder": "https://idp.example.com/authorize",
                },
                {
                    "key": "token_url",
                    "label": "Token URL",
                    "placeholder": "https://idp.example.com/token",
                },
                {
                    "key": "redirect_uri",
                    "label": "回调 URL",
                    "placeholder": "https://你的域名/api/v1/sso/oidc/callback",
                },
                {"key": "scopes", "label": "Scopes", "placeholder": "openid profile email"},
            ],
            "note": common_note,
        },
        "dingtalk": {
            "label": "钉钉",
            "credential_fields": [
                {"key": "app_key", "label": "AppKey", "secret": False},
                {"key": "app_secret", "label": "AppSecret", "secret": True},
            ],
            "config_fields": [
                {
                    "key": "redirect_uri",
                    "label": "回调 URL",
                    "placeholder": "https://你的域名/api/v1/sso/dingtalk/callback",
                },
                {"key": "auto_create_users", "label": "同步时自动创建用户", "type": "boolean"},
            ],
            "note": common_note,
        },
        "feishu": {
            "label": "飞书",
            "credential_fields": [
                {"key": "app_id", "label": "App ID", "secret": False},
                {"key": "app_secret", "label": "App Secret", "secret": True},
            ],
            "config_fields": [
                {
                    "key": "redirect_uri",
                    "label": "回调 URL",
                    "placeholder": "https://你的域名/api/v1/sso/feishu/callback",
                },
                {"key": "auto_create_users", "label": "同步时自动创建用户", "type": "boolean"},
            ],
            "note": common_note,
        },
        "generic_scim": {
            "label": "通用快照 / SCIM 桩",
            "credential_fields": [
                {"key": "token", "label": "Bearer Token（可选）", "secret": True},
            ],
            "config_fields": [
                {
                    "key": "static_snapshot",
                    "label": "static_snapshot（JSON，高级）",
                    "type": "json",
                },
                {"key": "auto_create_users", "label": "同步时自动创建用户", "type": "boolean"},
            ],
            "note": "内测可用 static_snapshot 模拟组织；真 SCIM 后续扩展",
        },
    }
    return schemas.get(
        provider,
        {
            "label": provider,
            "credential_fields": [],
            "config_fields": [],
            "note": common_note,
        },
    )


@router.get("/{company_id}/org-tree", response_model=ResponseData)
async def org_tree(
    db: DbSession,
    user: CurrentUser,
    company: Company = Depends(get_company),
    _m=Depends(require_company_member),
):
    """获取企业组织架构树"""
    q = await db.execute(
        select(OrgUnit).where(OrgUnit.company_id == company.id, OrgUnit.is_active.is_(True))
    )
    units = list(q.scalars().all())
    return ResponseData(data={"nodes": [_unit_dto(u) for u in units]})


@router.get("/{company_id}/integrations/schemas", response_model=ResponseData)
async def list_integration_schemas(
    db: DbSession,
    user: CurrentUser,
    company: Company = Depends(get_company),
    _admin=Depends(require_super_admin),
):
    """前端渲染「集成配置」表单用的字段 schema。"""
    return ResponseData(
        data={
            "providers": {
                p: _provider_form_schema(p)
                for p in ("wecom", "oidc", "dingtalk", "feishu", "generic_scim")
            }
        }
    )


@router.get("/{company_id}/integrations", response_model=ResponseData)
async def list_integrations(
    db: DbSession,
    user: CurrentUser,
    company: Company = Depends(get_company),
    _admin=Depends(require_super_admin),
    provider: str | None = Query(None),
):
    """列出组织同步集成"""
    q = select(IntegrationAccount).where(IntegrationAccount.company_id == company.id)
    if provider:
        q = q.where(IntegrationAccount.provider == provider)
    q = q.order_by(IntegrationAccount.id.desc())
    rows = list((await db.execute(q)).scalars().all())
    # 同 provider 只返回最新一条（前端配置一页一项）
    seen: set[str] = set()
    items = []
    for acc in rows:
        if acc.provider in seen:
            continue
        seen.add(acc.provider)
        items.append(_integration_dto(acc))
    return ResponseData(data={"items": items})


async def _upsert_integration(
    db,
    *,
    company_id: int,
    provider: str,
    credentials: dict,
    config: dict | None,
) -> IntegrationAccount:
    if provider not in KNOWN_PROVIDERS:
        raise CollabError(422, 42200, "该集成下一期支持，当前不可保存")
    config = dict(config) if config is not None else None
    credentials = dict(credentials or {})
    # 密钥即使误放在 config 也移入加密凭据，绝不落入公开配置。
    if config is not None:
        for key in list(config):
            if any(word in key.lower() for word in ("secret", "password", "token", "private_key")):
                credentials[key] = config.pop(key)
        config.pop("last_sync_report", None)
        if provider == "dingtalk":
            config.pop("static_snapshot", None)
            config["auto_create_users"] = False
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
    old_creds = _load_credentials(acc) if acc else {}
    merged = _merge_credentials(old_creds, credentials or {})
    cfg = {**(acc.config_json or {} if acc else {}), **(config or {}), **merged}
    required = {"dingtalk": ("corp_id", "app_key", "app_secret", "agent_id"),
                "oidc": ("issuer", "client_id", "client_secret")}.get(provider, ())
    if not all(isinstance(cfg.get(k), str) and cfg[k].strip() for k in required):
        raise CollabError(422, 42200, "请填写完整的企业应用配置，首次保存必须填写密钥")
    if provider == "oidc":
        from app.services.sso.oidc import _https_url
        try:
            _https_url(cfg["issuer"])
        except ValueError as exc:
            raise CollabError(422, 42200, str(exc)) from exc
    enc = encrypt_str(json.dumps(merged, sort_keys=True))
    if acc:
        acc.credentials_encrypted = enc
        if config is not None:
            # 合并 config，避免清空未提交字段
            prev = dict(acc.config_json or {})
            prev.update(config)
            acc.config_json = prev
    else:
        acc = IntegrationAccount(
            company_id=company_id,
            provider=provider,
            credentials_encrypted=enc,
            config_json=config or {},
        )
        db.add(acc)
    await db.flush()
    return acc


@router.post("/{company_id}/integrations", response_model=ResponseData)
async def create_integration(
    body: IntegrationCreate,
    db: DbSession,
    user: CurrentUser,
    company: Company = Depends(get_company),
    _admin=Depends(require_super_admin),
):
    """兼容旧接口：创建或更新同 provider。"""
    acc = await _upsert_integration(
        db,
        company_id=company.id,
        provider=body.provider,
        credentials=body.credentials or {},
        config=body.config,
    )
    return ResponseData(data=_integration_dto(acc))


@router.put("/{company_id}/integrations/{provider}", response_model=ResponseData)
async def put_integration(
    provider: str,
    body: IntegrationUpsert,
    db: DbSession,
    user: CurrentUser,
    company: Company = Depends(get_company),
    _admin=Depends(require_super_admin),
):
    """前端主路径：保存某一集成的域名/回调/密钥（密钥加密存储）。"""
    if body.provider and body.provider != provider:
        raise CollabError(422, 42200, "路径 provider 与 body 不一致")
    acc = await _upsert_integration(
        db,
        company_id=company.id,
        provider=provider,
        credentials=body.credentials or {},
        config=body.config,
    )
    return ResponseData(data=_integration_dto(acc))


ORG_SYNC_PROVIDERS = ("wecom", "dingtalk", "feishu", "generic_scim", "generic")


@router.post("/{company_id}/org-sync", response_model=ResponseData)
async def trigger_org_sync(
    db: DbSession,
    user: CurrentUser,
    company: Company = Depends(get_company),
    _admin=Depends(require_super_admin),
    provider: str | None = Query(None, description="指定集成；默认取最近一条可同步账号"),
):
    """触发组织架构同步"""
    if provider in {"wecom", "feishu", "saml"}:
        raise CollabError(422, 42200, "该组织集成下一期支持")
    # 只在组织类集成里选，绝不能取到发信/AI 等同表记录
    if provider and provider not in ORG_SYNC_PROVIDERS:
        raise CollabError(422, 42200, f"provider={provider} 不支持组织同步（仅 SSO）")
    q = select(IntegrationAccount).where(
        IntegrationAccount.company_id == company.id,
        IntegrationAccount.provider.in_(ORG_SYNC_PROVIDERS),
    )
    if provider:
        q = q.where(IntegrationAccount.provider == provider)
    else:
        q = q.where(IntegrationAccount.provider.in_(["dingtalk", "generic_scim", "generic"]))
    q = q.order_by(IntegrationAccount.id.desc()).limit(1)
    acc = (await db.execute(q)).scalar_one_or_none()
    if not acc:
        raise CollabError(404, 40400, "未配置组织集成，请先保存钉钉企业应用配置")

    config = dict(acc.config_json or {})
    creds = _load_credentials(acc)
    snapshot = config.get("static_snapshot") or {}

    if acc.provider == "dingtalk":
        try:
            # 拉取与写入同一保存点，外部失败不污染已有组织数据。
            async with db.begin_nested():
                report = await run_dingtalk_sync(db, company.id, DingTalkOrgProvider(creds), creds.get("corp_id", ""))
            status = "completed"
        except ValueError as exc:
            status = "failed"
            report = {"created": 0, "updated": 0, "failed": 1, "dept_upserted": 0, "users_matched": 0,
                      "users_unmatched": 0, "errors": [str(exc)]}
        acc.last_sync_at = datetime.now(timezone.utc)
        report.update(status=status, synced_at=acc.last_sync_at.isoformat())
        acc.config_json = {**config, "last_sync_report": report}
        await db.flush()
        return ResponseData(data={"job_id": str(acc.id), "provider": "dingtalk", "status": status, "report": report})

    if acc.provider in ("generic_scim", "generic"):
        sync_provider = GenericSnapshotProvider(snapshot)
        source = "generic"
    elif acc.provider == "wecom":
        # 真 API 未接前：有 snapshot 则用 snapshot；凭证已解密供后续 httpx 使用
        sync_provider = WeComProvider(creds, config)
        source = "wecom"
    elif acc.provider in ("dingtalk", "feishu"):
        # 真 API 未接前：仅 static_snapshot；凭证已落库供后续使用
        sync_provider = GenericSnapshotProvider(snapshot or {"depts": [], "users": []})
        source = acc.provider
    else:
        # oidc 等不走 org-sync
        raise CollabError(422, 42200, f"provider={acc.provider} 不支持组织同步（仅 SSO）")

    report = await run_org_sync(
        db,
        company.id,
        sync_provider,
        source=source,
        auto_create_users=bool(config.get("auto_create_users")),
    )
    acc.last_sync_at = datetime.now(timezone.utc)
    await db.flush()
    return ResponseData(
        data={
            "job_id": str(acc.id),
            "provider": acc.provider,
            "status": "completed",
            "credentials_loaded": bool(creds),
            "report": {
                "dept_upserted": report.dept_upserted,
                "users_matched": report.users_matched,
                "left_count": report.left_count,
            },
        }
    )


@router.get("/{company_id}/login-methods", response_model=ResponseData, summary="读取企业允许的登录方式")
async def get_login_methods(db: DbSession, user: CurrentUser, company: Company = Depends(get_company),
                            _m=Depends(require_company_member)):
    return ResponseData(data={**DEFAULT_LOGIN_METHODS, **(company.login_methods_json or {})})


@router.patch("/{company_id}/login-methods", response_model=ResponseData, summary="保存企业登录方式开关")
async def patch_login_methods(
    body: LoginMethodsPatch,
    db: DbSession,
    user: CurrentUser,
    company: Company = Depends(get_company),
    _admin=Depends(require_super_admin),
):
    """修改企业可用的登录方式"""
    from app.services.login_methods import validate_login_methods
    validate_login_methods(body.model_dump(exclude_unset=True))
    lm = dict(company.login_methods_json or DEFAULT_LOGIN_METHODS)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            lm[k] = v
    company.login_methods_json = lm
    await db.flush()
    return ResponseData(data=lm)
