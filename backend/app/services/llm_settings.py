"""公司级 LLM 配置：前端可改 provider / base_url / model / api_key。

密钥经 secret_box 加密；公开接口永不回显 api_key。
同时写入 ModelBinding，供 bindings 列表与策略校验。
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

logger = logging.getLogger(__name__)

PROVIDER_LLM = "llm"

# 前端可选 provider 预设
LLM_PROVIDER_PRESETS: dict[str, dict[str, Any]] = {
    "fake": {
        "label": "Fake（本地桩，无需密钥）",
        "default_base_url": "",
        "default_model": "fake",
        "needs_key": False,
    },
    "openai": {
        "label": "OpenAI",
        "default_base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o-mini",
        "needs_key": True,
    },
    "openai_compatible": {
        "label": "OpenAI 兼容（DeepSeek / 通义 / 自建）",
        "default_base_url": "https://api.deepseek.com/v1",
        "default_model": "deepseek-chat",
        "needs_key": True,
    },
    "azure_openai": {
        "label": "Azure OpenAI",
        "default_base_url": "https://YOUR_RESOURCE.openai.azure.com",
        "default_model": "gpt-4o-mini",
        "needs_key": True,
    },
    "ollama": {
        "label": "Ollama（本地）",
        "default_base_url": "http://127.0.0.1:11434/v1",
        "default_model": "llama3.2",
        "needs_key": False,
    },
    "custom": {
        "label": "自定义",
        "default_base_url": "",
        "default_model": "",
        "needs_key": True,
    },
}


@dataclass
class ResolvedLlm:
    provider: str
    base_url: str
    model: str
    api_key: str
    temperature: float = 0.2
    max_tokens: int = 1024
    enabled: bool = True
    use_for_judge: bool = True
    use_for_agent: bool = True
    extra: dict[str, Any] = field(default_factory=dict)
    source: str = "company"  # company | env | fake

    def is_usable(self) -> bool:
        if not self.enabled:
            return False
        if self.provider in ("fake", ""):
            return True
        if self.provider == "ollama":
            return bool((self.base_url or "").strip() and (self.model or "").strip())
        return bool(
            (self.base_url or "").strip()
            and (self.model or "").strip()
            and (self.api_key or "").strip()
        )


def _load_blob(acc) -> dict[str, Any]:
    from app.services.secret_box import decrypt_str

    if not acc or not getattr(acc, "credentials_encrypted", None):
        return {}
    try:
        raw = decrypt_str(acc.credentials_encrypted)
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception as e:
        logger.warning("decrypt company llm failed: %s", e)
        return {}


async def get_company_llm_account(db: AsyncSession, company_id: int):
    from app.models.integration import IntegrationAccount

    q = await db.execute(
        select(IntegrationAccount)
        .where(
            IntegrationAccount.company_id == company_id,
            IntegrationAccount.provider == PROVIDER_LLM,
        )
        .order_by(IntegrationAccount.id.desc())
        .limit(1)
    )
    return q.scalar_one_or_none()


def _merge_public(blob: dict, conf: dict) -> dict[str, Any]:
    provider = (blob.get("provider") or conf.get("provider") or "fake").strip()
    return {
        "provider": provider,
        "base_url": (blob.get("base_url") or conf.get("base_url") or "").strip(),
        "model": (blob.get("model") or conf.get("model") or "").strip(),
        "temperature": float(blob.get("temperature") if blob.get("temperature") is not None else conf.get("temperature") or 0.2),
        "max_tokens": int(blob.get("max_tokens") if blob.get("max_tokens") is not None else conf.get("max_tokens") or 1024),
        "enabled": bool(
            blob.get("enabled") if "enabled" in blob else conf.get("enabled", True)
        ),
        "use_for_judge": bool(
            blob.get("use_for_judge")
            if "use_for_judge" in blob
            else conf.get("use_for_judge", True)
        ),
        "use_for_agent": bool(
            blob.get("use_for_agent")
            if "use_for_agent" in blob
            else conf.get("use_for_agent", True)
        ),
        "has_api_key": bool(blob.get("api_key")),
        "configured": False,  # filled below
        "source": "company",
    }


def _configured(view: dict, blob: dict) -> bool:
    provider = view.get("provider") or "fake"
    if provider == "fake":
        return True
    if provider == "ollama":
        return bool(view.get("base_url") and view.get("model"))
    return bool(view.get("base_url") and view.get("model") and blob.get("api_key"))


async def company_llm_public(db: AsyncSession, company_id: int) -> dict[str, Any]:
    acc = await get_company_llm_account(db, company_id)
    if not acc:
        return {
            "provider": "fake",
            "base_url": "",
            "model": "fake",
            "temperature": 0.2,
            "max_tokens": 1024,
            "enabled": True,
            "use_for_judge": True,
            "use_for_agent": True,
            "has_api_key": False,
            "configured": True,
            "source": "company",
            "presets": LLM_PROVIDER_PRESETS,
        }
    blob = _load_blob(acc)
    conf = dict(acc.config_json or {})
    view = _merge_public(blob, conf)
    view["configured"] = _configured(view, blob)
    view["presets"] = LLM_PROVIDER_PRESETS
    return view


async def _sync_model_binding(
    db: AsyncSession,
    company_id: int,
    *,
    provider: str,
    base_url: str,
    model: str,
    enabled: bool,
) -> None:
    from app.models.bindings import ModelBinding

    q = await db.execute(
        select(ModelBinding).where(
            ModelBinding.company_id == company_id,
            ModelBinding.user_id.is_(None),
        )
    )
    for row in q.scalars().all():
        row.is_default = False

    # provider_id 用于策略白名单：openai:gpt-4o-mini 或 fake
    provider_id = f"{provider}:{model}" if model and provider != "fake" else provider
    binding = ModelBinding(
        company_id=company_id,
        user_id=None,
        provider_id=provider_id[:64],
        config_json={
            "provider": provider,
            "base_url": base_url,
            "model": model,
            "enabled": enabled,
            # 不含 api_key
        },
        is_default=True,
    )
    db.add(binding)
    await db.flush()


async def save_company_llm(
    db: AsyncSession,
    company_id: int,
    *,
    provider: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    enabled: bool | None = None,
    use_for_judge: bool | None = None,
    use_for_agent: bool | None = None,
) -> dict[str, Any]:
    """保存公司 LLM；api_key 空字符串表示不改动已有密钥。"""
    from app.models.integration import IntegrationAccount
    from app.services.secret_box import encrypt_str

    acc = await get_company_llm_account(db, company_id)
    prev = _load_blob(acc) if acc else {}
    conf = dict(acc.config_json or {}) if acc else {}

    def pick(key: str, new_val, default=None):
        if new_val is not None:
            return new_val
        if key in prev and prev[key] is not None:
            return prev[key]
        if key in conf and conf[key] is not None:
            return conf[key]
        return default

    prov = str(pick("provider", provider, "fake") or "fake").strip()
    if prov not in LLM_PROVIDER_PRESETS:
        prov = "custom"

    burl = str(pick("base_url", base_url, LLM_PROVIDER_PRESETS.get(prov, {}).get("default_base_url", "")) or "").strip()
    mname = str(pick("model", model, LLM_PROVIDER_PRESETS.get(prov, {}).get("default_model", "")) or "").strip()
    temp = float(pick("temperature", temperature, 0.2) or 0.2)
    mtok = int(pick("max_tokens", max_tokens, 1024) or 1024)
    en = bool(pick("enabled", enabled, True))
    u_judge = bool(pick("use_for_judge", use_for_judge, True))
    u_agent = bool(pick("use_for_agent", use_for_agent, True))

    if api_key is not None and str(api_key) != "":
        key = str(api_key)
    else:
        key = str(prev.get("api_key") or "")

    blob = {
        "provider": prov,
        "base_url": burl,
        "model": mname,
        "api_key": key,
        "temperature": temp,
        "max_tokens": mtok,
        "enabled": en,
        "use_for_judge": u_judge,
        "use_for_agent": u_agent,
    }
    config_public = {
        "provider": prov,
        "base_url": burl,
        "model": mname,
        "temperature": temp,
        "max_tokens": mtok,
        "enabled": en,
        "use_for_judge": u_judge,
        "use_for_agent": u_agent,
    }
    enc = encrypt_str(json.dumps(blob, sort_keys=True))
    if acc:
        acc.credentials_encrypted = enc
        acc.config_json = config_public
    else:
        acc = IntegrationAccount(
            company_id=company_id,
            provider=PROVIDER_LLM,
            credentials_encrypted=enc,
            config_json=config_public,
        )
        db.add(acc)
    await db.flush()
    await _sync_model_binding(
        db, company_id, provider=prov, base_url=burl, model=mname, enabled=en
    )
    return await company_llm_public(db, company_id)


async def llm_from_company(db: AsyncSession, company_id: int | None) -> ResolvedLlm | None:
    if not company_id:
        return None
    acc = await get_company_llm_account(db, company_id)
    if not acc:
        return None
    blob = _load_blob(acc)
    conf = dict(acc.config_json or {})
    view = _merge_public(blob, conf)
    return ResolvedLlm(
        provider=view["provider"],
        base_url=view["base_url"],
        model=view["model"],
        api_key=str(blob.get("api_key") or ""),
        temperature=view["temperature"],
        max_tokens=view["max_tokens"],
        enabled=view["enabled"],
        use_for_judge=view["use_for_judge"],
        use_for_agent=view["use_for_agent"],
        source="company",
    )


def _user_llm_channel(user) -> dict[str, Any]:
    if not user:
        return {}
    pref = getattr(user, "notify_pref", None) or {}
    channels = pref.get("channels") or {}
    llm = channels.get("llm") or {}
    return dict(llm) if isinstance(llm, dict) else {}


def llm_from_user(user) -> ResolvedLlm | None:
    """个人前端配置：notify_pref.channels.llm。"""
    from app.services.user_secrets import unseal

    cfg = _user_llm_channel(user)
    if not cfg:
        return None
    provider = (cfg.get("provider") or "fake").strip()
    base_url = (cfg.get("base_url") or "").strip()
    model = (cfg.get("model") or "").strip()
    api_key = unseal(cfg.get("api_key"))
    enabled = bool(cfg.get("enabled", True))
    if not enabled:
        return ResolvedLlm(
            provider=provider or "fake",
            base_url=base_url,
            model=model or "fake",
            api_key=api_key,
            temperature=float(cfg.get("temperature") or 0.2),
            max_tokens=int(cfg.get("max_tokens") or 1024),
            enabled=False,
            use_for_judge=bool(cfg.get("use_for_judge", False)),
            use_for_agent=bool(cfg.get("use_for_agent", True)),
            source="user",
        )
    # 未填 provider 或仅空壳 → 视为未配置
    if provider in ("", "none"):
        return None
    if provider == "fake":
        return ResolvedLlm(
            provider="fake",
            base_url="",
            model="fake",
            api_key="",
            temperature=float(cfg.get("temperature") or 0.2),
            max_tokens=int(cfg.get("max_tokens") or 1024),
            enabled=True,
            use_for_judge=bool(cfg.get("use_for_judge", False)),
            use_for_agent=bool(cfg.get("use_for_agent", True)),
            source="user",
        )
    if not (base_url and model):
        return None
    if provider != "ollama" and not api_key:
        return None
    return ResolvedLlm(
        provider=provider,
        base_url=base_url,
        model=model,
        api_key=api_key,
        temperature=float(cfg.get("temperature") or 0.2),
        max_tokens=int(cfg.get("max_tokens") or 1024),
        enabled=True,
        use_for_judge=bool(cfg.get("use_for_judge", False)),
        use_for_agent=bool(cfg.get("use_for_agent", True)),
        source="user",
    )


def user_llm_public(user) -> dict[str, Any]:
    cfg = _user_llm_channel(user)
    if not cfg:
        return {
            "provider": "fake",
            "base_url": "",
            "model": "fake",
            "temperature": 0.2,
            "max_tokens": 1024,
            "enabled": False,
            "use_for_judge": False,
            "use_for_agent": True,
            "has_api_key": False,
            "configured": False,
            "source": "user",
            "presets": LLM_PROVIDER_PRESETS,
        }
    provider = (cfg.get("provider") or "fake").strip()
    view = {
        "provider": provider,
        "base_url": (cfg.get("base_url") or "").strip(),
        "model": (cfg.get("model") or "").strip(),
        "temperature": float(cfg.get("temperature") or 0.2),
        "max_tokens": int(cfg.get("max_tokens") or 1024),
        "enabled": bool(cfg.get("enabled", False)),
        "use_for_judge": bool(cfg.get("use_for_judge", False)),
        "use_for_agent": bool(cfg.get("use_for_agent", True)),
        "has_api_key": bool(cfg.get("api_key")),
        "configured": False,
        "source": "user",
        "presets": LLM_PROVIDER_PRESETS,
    }
    blob = {"api_key": cfg.get("api_key") or ""}
    view["configured"] = _configured(view, blob) if view["enabled"] else False
    return view


def save_user_llm(
    user,
    *,
    provider: str | None = None,
    base_url: str | None = None,
    model: str | None = None,
    api_key: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
    enabled: bool | None = None,
    use_for_judge: bool | None = None,
    use_for_agent: bool | None = None,
) -> dict[str, Any]:
    """写入 user.notify_pref.channels.llm；api_key 空串表示不改。"""
    pref = dict(getattr(user, "notify_pref", None) or {})
    channels = dict(pref.get("channels") or {})
    prev = dict(channels.get("llm") or {})

    def pick(key: str, new_val, default=None):
        if new_val is not None:
            return new_val
        if key in prev and prev[key] is not None:
            return prev[key]
        return default

    prov = str(pick("provider", provider, "fake") or "fake").strip()
    if prov not in LLM_PROVIDER_PRESETS:
        prov = "custom"
    burl = str(
        pick(
            "base_url",
            base_url,
            LLM_PROVIDER_PRESETS.get(prov, {}).get("default_base_url", ""),
        )
        or ""
    ).strip()
    mname = str(
        pick(
            "model",
            model,
            LLM_PROVIDER_PRESETS.get(prov, {}).get("default_model", ""),
        )
        or ""
    ).strip()
    temp = float(pick("temperature", temperature, 0.2) or 0.2)
    mtok = int(pick("max_tokens", max_tokens, 1024) or 1024)
    en = bool(pick("enabled", enabled, False))
    u_judge = bool(pick("use_for_judge", use_for_judge, False))
    u_agent = bool(pick("use_for_agent", use_for_agent, True))

    if api_key is not None and str(api_key) != "":
        # 个人凭证加密落库（与公司级 secret_box 对齐）；读取侧走 user_secrets.unseal
        from app.services.user_secrets import seal

        key = seal(str(api_key))
    else:
        key = str(prev.get("api_key") or "")

    channels["llm"] = {
        "provider": prov,
        "base_url": burl,
        "model": mname,
        "api_key": key,
        "temperature": temp,
        "max_tokens": mtok,
        "enabled": en,
        "use_for_judge": u_judge,
        "use_for_agent": u_agent,
    }
    pref["channels"] = channels
    user.notify_pref = pref
    # 触发 SQLAlchemy JSON 变更检测
    from sqlalchemy.orm.attributes import flag_modified

    try:
        flag_modified(user, "notify_pref")
    except Exception:
        pass
    return user_llm_public(user)


def llm_from_env() -> ResolvedLlm | None:
    """环境变量兜底（可选）：LLM_BASE_URL / LLM_API_KEY / LLM_MODEL。"""
    base = (getattr(settings, "LLM_BASE_URL", None) or "").strip()
    key = (getattr(settings, "LLM_API_KEY", None) or "").strip()
    model = (getattr(settings, "LLM_MODEL", None) or "").strip()
    provider = (getattr(settings, "LLM_PROVIDER", None) or "openai_compatible").strip()
    if not (base and model):
        return None
    return ResolvedLlm(
        provider=provider,
        base_url=base,
        model=model,
        api_key=key,
        source="env",
    )


async def resolve_llm(
    db: AsyncSession | None = None,
    *,
    company_id: int | None = None,
    user=None,
) -> ResolvedLlm:
    """个人前端配置 > 公司前端配置 > 环境变量 > fake。"""
    u = llm_from_user(user)
    if u and u.enabled and u.is_usable():
        return u
    if db is not None and company_id:
        c = await llm_from_company(db, company_id)
        if c and c.enabled and c.is_usable():
            return c
    if db is not None and not company_id:
        try:
            from app.services.register_join import get_default_company

            co = await get_default_company(db)
            if co:
                c = await llm_from_company(db, co.id)
                if c and c.enabled and c.is_usable():
                    return c
        except Exception:
            pass
    env = llm_from_env()
    if env and env.is_usable():
        return env
    return ResolvedLlm(
        provider="fake",
        base_url="",
        model="fake",
        api_key="",
        source="fake",
    )


async def chat_completion(
    llm: ResolvedLlm,
    *,
    messages: list[dict[str, str]],
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> dict[str, Any]:
    """OpenAI-compatible chat/completions；fake 本地回声。"""
    if llm.provider == "fake" or not llm.is_usable():
        last = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
        return {
            "ok": True,
            "provider": "fake",
            "content": f"[FakeLLM] 已收到：{(last or '')[:200]}",
            "raw": None,
        }

    base = llm.base_url.rstrip("/")
    url = f"{base}/chat/completions"
    headers = {"Content-Type": "application/json"}
    if llm.api_key:
        headers["Authorization"] = f"Bearer {llm.api_key}"
    body = {
        "model": llm.model,
        "messages": messages,
        "temperature": temperature if temperature is not None else llm.temperature,
        "max_tokens": max_tokens if max_tokens is not None else llm.max_tokens,
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, headers=headers, json=body)
            data = resp.json() if resp.content else {}
            if resp.status_code >= 400:
                err = data.get("error") if isinstance(data, dict) else None
                msg = (
                    err.get("message")
                    if isinstance(err, dict)
                    else (str(err) if err else resp.text[:300])
                )
                return {
                    "ok": False,
                    "provider": llm.provider,
                    "content": "",
                    "error": f"HTTP {resp.status_code}: {msg}",
                    "raw": data,
                }
            choice = (data.get("choices") or [{}])[0]
            content = (choice.get("message") or {}).get("content") or ""
            return {
                "ok": True,
                "provider": llm.provider,
                "content": content,
                "raw": data,
            }
    except Exception as e:
        logger.warning("llm chat_completion failed: %s", e)
        return {
            "ok": False,
            "provider": llm.provider,
            "content": "",
            "error": str(e),
            "raw": None,
        }


async def test_company_llm(db: AsyncSession, company_id: int) -> dict[str, Any]:
    llm = await llm_from_company(db, company_id)
    if not llm:
        return {"ok": False, "error": "未配置公司 LLM"}
    if not llm.enabled:
        return {"ok": False, "error": "公司 LLM 已禁用"}
    result = await chat_completion(
        llm,
        messages=[
            {"role": "system", "content": "You are a health-check assistant. Reply with exactly: OK"},
            {"role": "user", "content": "ping"},
        ],
        max_tokens=32,
        temperature=0,
    )
    result["source"] = llm.source
    result["model"] = llm.model
    result["base_url"] = llm.base_url
    result["provider"] = llm.provider
    # 永不回传 key
    return result
