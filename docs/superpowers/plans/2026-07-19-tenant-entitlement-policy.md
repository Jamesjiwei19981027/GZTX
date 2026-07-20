# Tenant · Entitlement · Policy Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.  
> **Task board ID:** `P0-BE-01`  
> **HTTP 真源:** [`2026-07-19-api-contracts-v1.md`](./2026-07-19-api-contracts-v1.md) **§1**  
> **工程拍板:** [`2026-07-19-dev-handoff-patch.md`](./2026-07-19-dev-handoff-patch.md)

**Goal:** 落地公司租户、License/SaaS 开通态、权益配额与策略引擎中间件，使后续项目/智能体 API 能统一做公司隔离与功能开关校验。

**Architecture:** `companies` 为隔离根；`company_memberships` 绑定用户（含 `is_org_leader`）；`entitlement_json` + `policy_json` 由 `EntitlementService` / `PolicyGuard` 读取；部署模式 `DEPLOY_MODE=single_company|saas`；单公司用签名 License，SaaS 用 `service_activations`。依赖注入：`require_company_member`、`require_feature("project_tree")`、`require_super_admin`、`require_org_leader`。

**Tech Stack:** FastAPI · SQLAlchemy 2 · pydantic · HMAC license（P0）· pytest · 现有 `ResponseData` / JWT auth · `fail()` 信封见 handoff §3

## Global Constraints

- Spec: `docs/团队协作与智能体-最终实现方案.md` §3、§8.5  
- **HTTP/DTO:** api-contracts-v1 §1（路径与字段以契约为准，本计划代码示例若冲突以契约为准）  
- Contracts DB: 附录 §B.1、§C.1–C.2、§C.4、§H、§I + membership.`is_org_leader`  
- 未授权：公司/项目 API → code `40310`/`40311`/`40312`（handoff 错误码表）  
- 个人 `/tasks` **不**强制公司 membership  
- 中文错误文案；真源仅 `backend/`  
- settings: `DEPLOY_MODE`, `LICENSE_PUBLIC_KEY`, `LICENSE_VERIFY_MODE=hmac`

**Prerequisites:** 无（本计划为依赖图第 1 步）

**Downstream consumers:** project-tree-acl、evidence、agent、org 均调用 membership + `EntitlementService.has_feature`

---

## File Map

```
backend/app/models/company.py          # Company, CompanyLicense, CompanyMembership, ServiceActivation
backend/app/schemas/company.py
backend/app/services/entitlement.py    # EntitlementService
backend/app/services/license_verify.py
backend/app/services/policy_guard.py   # PolicyGuard
backend/app/api/v1/companies.py
backend/app/core/config.py             # DEPLOY_MODE, LICENSE_PUBLIC_KEY
backend/app/api/deps_collab.py         # require_company_member, require_feature
backend/tests/collab/test_tenant_entitlement.py
backend/tests/collab/test_policy_guard.py
```

---

### Task 1: Company / Membership / License 模型

**Files:**
- Create: `backend/app/models/company.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/collab/test_tenant_models.py`

**Interfaces:**
- Produces: `Company`, `CompanyLicense`, `CompanyMembership`, `ServiceActivation`

- [ ] **Step 1: Write failing import test**

```python
# backend/tests/collab/test_tenant_models.py
def test_company_models_importable():
    from app.models.company import Company, CompanyLicense, CompanyMembership, ServiceActivation
    assert Company.__tablename__ == "companies"
    assert CompanyMembership.__tablename__ == "company_memberships"
    assert CompanyLicense.__tablename__ == "company_licenses"
    assert ServiceActivation.__tablename__ == "service_activations"
```

- [ ] **Step 2: Run test — expect fail**

Run: `cd backend; pytest tests/collab/test_tenant_models.py::test_company_models_importable -v`  
Expected: FAIL `ModuleNotFoundError`

- [ ] **Step 3: Implement models**

```python
# backend/app/models/company.py
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.sql import func
from app.db.base import Base

class Company(Base):
    __tablename__ = "companies"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    status = Column(String(32), nullable=False, default="pending_license")  # CompanyStatus
    deploy_hint = Column(String(32), nullable=True)  # single_company | saas
    policy_json = Column(JSON, nullable=False, default=dict)
    policy_preset = Column(String(32), nullable=True)  # standard | controlled | isolated
    entitlement_json = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class CompanyLicense(Base):
    __tablename__ = "company_licenses"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    license_payload = Column(Text, nullable=False)
    signature = Column(Text, nullable=False)
    valid_from = Column(DateTime(timezone=True), nullable=True)
    valid_to = Column(DateTime(timezone=True), nullable=True)
    features_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class CompanyMembership(Base):
    __tablename__ = "company_memberships"
    __table_args__ = (UniqueConstraint("company_id", "user_id", name="uq_company_user"),)
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(32), nullable=False, default="active")  # MembershipStatus
    is_super_admin = Column(Boolean, default=False, nullable=False)
    is_org_leader = Column(Boolean, default=False, nullable=False)  # handoff §1；可开空项目
    employment_status = Column(String(32), nullable=False, default="active")  # EmploymentStatus
    org_unit_id = Column(Integer, nullable=True)  # FK 在 org 计划补全
    external_user_id = Column(String(128), nullable=True)
    title = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ServiceActivation(Base):
    """SaaS 线上开通记录"""
    __tablename__ = "service_activations"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    plan_code = Column(String(64), nullable=False, default="standard")
    status = Column(String(32), nullable=False, default="active")  # active | expired | cancelled
    valid_from = Column(DateTime(timezone=True), nullable=True)
    valid_to = Column(DateTime(timezone=True), nullable=True)
    entitlement_override_json = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 4: Export in `models/__init__.py`**

```python
from app.models.company import Company, CompanyLicense, CompanyMembership, ServiceActivation
```

- [ ] **Step 5: Run test — expect pass**

Run: `cd backend; pytest tests/collab/test_tenant_models.py -v`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/company.py backend/app/models/__init__.py backend/tests/collab/test_tenant_models.py
git commit -m "feat(tenant): add company membership license models"
```

---

### Task 2: 默认 entitlement / policy 常量与 License 验签

**Files:**
- Create: `backend/app/services/policy_presets.py`
- Create: `backend/app/services/license_verify.py`
- Modify: `backend/app/core/config.py` — `DEPLOY_MODE`, `LICENSE_PUBLIC_KEY`
- Test: `backend/tests/collab/test_license_verify.py`

**Interfaces:**
- Produces: `DEFAULT_ENTITLEMENT`, `POLICY_PRESETS`, `verify_license_payload(payload: str, signature: str) -> dict`
- Consumes: settings.LICENSE_PUBLIC_KEY

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/collab/test_license_verify.py
import json
from datetime import datetime, timezone, timedelta

def test_policy_presets_have_three_keys():
    from app.services.policy_presets import POLICY_PRESETS, DEFAULT_ENTITLEMENT
    assert set(POLICY_PRESETS.keys()) == {"standard", "controlled", "isolated"}
    assert DEFAULT_ENTITLEMENT["features"]["project_tree"] is True
    assert "max_users" in DEFAULT_ENTITLEMENT["quotas"]

def test_verify_license_accepts_valid_hmac_dev_key(monkeypatch):
    """开发环境可用 HMAC 简化验签；生产换非对称。"""
    from app.core.config import settings
    monkeypatch.setattr(settings, "LICENSE_PUBLIC_KEY", "dev-secret-key-for-tests-only")
    monkeypatch.setattr(settings, "LICENSE_VERIFY_MODE", "hmac")
    from app.services.license_verify import sign_license_dev, verify_license_payload
    payload = {
        "company_slug": "acme",
        "features": {"project_tree": True, "agents": True},
        "quotas": {"max_users": 50},
        "valid_to": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
    }
    raw = json.dumps(payload, sort_keys=True)
    sig = sign_license_dev(raw, settings.LICENSE_PUBLIC_KEY)
    out = verify_license_payload(raw, sig)
    assert out["company_slug"] == "acme"

def test_verify_license_rejects_bad_signature(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "LICENSE_PUBLIC_KEY", "dev-secret-key-for-tests-only")
    monkeypatch.setattr(settings, "LICENSE_VERIFY_MODE", "hmac")
    from app.services.license_verify import verify_license_payload
    import pytest
    with pytest.raises(ValueError):
        verify_license_payload('{"company_slug":"x"}', "deadbeef")
```

- [ ] **Step 2: Run — expect fail**

Run: `cd backend; pytest tests/collab/test_license_verify.py -v`  
Expected: FAIL import

- [ ] **Step 3: Implement presets（抄附录 H.1–H.2 字面量）**

```python
# backend/app/services/policy_presets.py
DEFAULT_ENTITLEMENT = {
    "features": {
        "project_tree": True,
        "agents": True,
        "org_sync": True,
        "policy_isolated": False,
        "asr": True,
        "custom_storage": True,
    },
    "quotas": {
        "max_users": 200,
        "max_projects": 50,
        "max_storage_gb": 100,
        "max_llm_calls_day": 10000,
        "max_asr_minutes_day": 500,
    },
    "valid_to": None,
    "on_expire": "readonly",
}

POLICY_PRESETS = {
    "standard": {
        "llm_egress": "allow_cloud",
        "asr_egress": "allow_cloud",
        "file_egress": "allow",
        "allowed_model_ids": ["*"],
        "allowed_asr_ids": ["builtin", "cloud:*"],
        "storage_mode": "builtin_or_customer",
        "project_pull_requires_same_org_unit": False,
        "evidence_retention_days": 1095,
        "chat_retention_days": 365,
        "progress_ledger_retention_days": None,
        "progress_auto_write_alert": {
            "window_seconds": 3600,
            "max_writes_per_node": 20,
            "notify_roles": ["pm"],
        },
    },
    "controlled": {
        "llm_egress": "allowlist",
        "asr_egress": "allowlist",
        "file_egress": "customer_preferred",
        "allowed_model_ids": [],
        "allowed_asr_ids": ["builtin", "customer"],
        "storage_mode": "customer_or_builtin",
        "project_pull_requires_same_org_unit": False,
        "evidence_retention_days": 1095,
        "chat_retention_days": 180,
        "progress_ledger_retention_days": None,
        "progress_auto_write_alert": {
            "window_seconds": 3600,
            "max_writes_per_node": 20,
            "notify_roles": ["pm"],
        },
    },
    "isolated": {
        "llm_egress": "private_only",
        "asr_egress": "builtin_or_customer",
        "file_egress": "deny_external",
        "allowed_model_ids": ["private:*"],
        "allowed_asr_ids": ["builtin", "customer"],
        "storage_mode": "customer_or_local",
        "project_pull_requires_same_org_unit": False,
        "evidence_retention_days": 1825,
        "chat_retention_days": 365,
        "progress_ledger_retention_days": None,
        "progress_auto_write_alert": {
            "window_seconds": 3600,
            "max_writes_per_node": 20,
            "notify_roles": ["pm"],
        },
    },
}
```

```python
# backend/app/services/license_verify.py
import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings


def sign_license_dev(payload: str, secret: str) -> str:
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def verify_license_payload(payload: str, signature: str) -> dict[str, Any]:
    mode = getattr(settings, "LICENSE_VERIFY_MODE", "hmac")
    key = settings.LICENSE_PUBLIC_KEY or ""
    if not key:
        raise ValueError("LICENSE_PUBLIC_KEY 未配置")
    if mode == "hmac":
        expected = sign_license_dev(payload, key)
        if not hmac.compare_digest(expected, signature or ""):
            raise ValueError("license 签名无效")
    else:
        raise ValueError(f"不支持的 LICENSE_VERIFY_MODE: {mode}")
    data = json.loads(payload)
    valid_to = data.get("valid_to")
    if valid_to:
        vt = datetime.fromisoformat(valid_to.replace("Z", "+00:00"))
        if vt.tzinfo is None:
            vt = vt.replace(tzinfo=timezone.utc)
        if vt < datetime.now(timezone.utc):
            raise ValueError("license 已过期")
    return data
```

在 `config.py` Settings 增加：

```python
DEPLOY_MODE: str = "single_company"  # single_company | saas
LICENSE_PUBLIC_KEY: str = ""
LICENSE_VERIFY_MODE: str = "hmac"  # hmac | ed25519（后续）
```

- [ ] **Step 4: Run tests — pass**

Run: `cd backend; pytest tests/collab/test_license_verify.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/policy_presets.py backend/app/services/license_verify.py backend/app/core/config.py backend/tests/collab/test_license_verify.py
git commit -m "feat(tenant): policy presets and license verify"
```

---

### Task 3: EntitlementService + PolicyGuard

**Files:**
- Create: `backend/app/services/entitlement.py`
- Create: `backend/app/services/policy_guard.py`
- Test: `backend/tests/collab/test_entitlement_service.py`

**Interfaces:**
- Produces:
  - `EntitlementService.is_company_unlocked(company) -> bool`
  - `EntitlementService.has_feature(company, feature: str) -> bool`
  - `EntitlementService.check_quota(company, metric: str, current: int) -> None` raises `QuotaExceeded`
  - `PolicyGuard.allow_model(company, model_id: str) -> bool`
  - `PolicyGuard.allow_asr(company, asr_id: str) -> bool`
  - `PolicyGuard.allow_file_egress(company) -> bool`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/collab/test_entitlement_service.py
from types import SimpleNamespace
from datetime import datetime, timezone, timedelta

def _company(**kw):
    base = {
        "status": "active",
        "entitlement_json": {
            "features": {"project_tree": True, "agents": False},
            "quotas": {"max_projects": 2},
            "valid_to": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat(),
            "on_expire": "readonly",
        },
        "policy_json": {"allowed_model_ids": ["*"], "llm_egress": "allow_cloud", "file_egress": "allow"},
        "policy_preset": "standard",
    }
    base.update(kw)
    return SimpleNamespace(**base)

def test_has_feature():
    from app.services.entitlement import EntitlementService
    svc = EntitlementService()
    c = _company()
    assert svc.has_feature(c, "project_tree") is True
    assert svc.has_feature(c, "agents") is False

def test_unlocked_false_when_pending():
    from app.services.entitlement import EntitlementService
    svc = EntitlementService()
    assert svc.is_company_unlocked(_company(status="pending_license")) is False
    assert svc.is_company_unlocked(_company(status="active")) is True

def test_quota_exceeded():
    from app.services.entitlement import EntitlementService, QuotaExceeded
    import pytest
    svc = EntitlementService()
    with pytest.raises(QuotaExceeded):
        svc.check_quota(_company(), "max_projects", current=2)

def test_policy_allow_model_wildcard():
    from app.services.policy_guard import PolicyGuard
    g = PolicyGuard()
    assert g.allow_model(_company(), "gpt-x") is True
```

- [ ] **Step 2: Implement**

```python
# backend/app/services/entitlement.py
from datetime import datetime, timezone
from typing import Any


class QuotaExceeded(Exception):
    def __init__(self, metric: str, limit: int):
        self.metric = metric
        self.limit = limit
        super().__init__(f"配额已满: {metric} <= {limit}")


class EntitlementService:
    def _ent(self, company) -> dict[str, Any]:
        return company.entitlement_json or {}

    def is_expired(self, company) -> bool:
        valid_to = self._ent(company).get("valid_to")
        if not valid_to:
            return False
        vt = datetime.fromisoformat(str(valid_to).replace("Z", "+00:00"))
        if vt.tzinfo is None:
            vt = vt.replace(tzinfo=timezone.utc)
        return vt < datetime.now(timezone.utc)

    def is_company_unlocked(self, company) -> bool:
        if company.status in ("suspended", "pending_license"):
            return False
        if company.status == "readonly":
            return True  # 可读但写路由另判
        if self.is_expired(company):
            return company.status == "readonly" or self._ent(company).get("on_expire") == "readonly"
        return company.status == "active"

    def has_feature(self, company, feature: str) -> bool:
        if not self.is_company_unlocked(company) and company.status != "readonly":
            return False
        return bool(self._ent(company).get("features", {}).get(feature, False))

    def is_write_allowed(self, company) -> bool:
        if company.status in ("suspended", "pending_license", "readonly"):
            return False
        if self.is_expired(company):
            return False
        return company.status == "active"

    def check_quota(self, company, metric: str, current: int) -> None:
        limit = self._ent(company).get("quotas", {}).get(metric)
        if limit is None:
            return
        if current >= int(limit):
            raise QuotaExceeded(metric, int(limit))
```

```python
# backend/app/services/policy_guard.py
from typing import Any
from app.services.policy_presets import POLICY_PRESETS


class PolicyGuard:
    def policy(self, company) -> dict[str, Any]:
        p = dict(company.policy_json or {})
        preset = company.policy_preset
        if preset and preset in POLICY_PRESETS:
            merged = dict(POLICY_PRESETS[preset])
            merged.update(p)
            return merged
        return p

    def allow_model(self, company, model_id: str) -> bool:
        pol = self.policy(company)
        egress = pol.get("llm_egress", "allow_cloud")
        if egress == "private_only" and not str(model_id).startswith("private:"):
            return False
        allowed = pol.get("allowed_model_ids") or []
        if "*" in allowed:
            return True
        if egress == "allowlist" and model_id not in allowed:
            return False
        return model_id in allowed or "*" in allowed or egress == "allow_cloud"

    def allow_asr(self, company, asr_id: str) -> bool:
        allowed = self.policy(company).get("allowed_asr_ids") or []
        if asr_id in allowed:
            return True
        for a in allowed:
            if a.endswith(":*") and str(asr_id).startswith(a[:-1]):
                return True
        return False

    def allow_file_egress(self, company) -> bool:
        return self.policy(company).get("file_egress") != "deny_external"
```

- [ ] **Step 3: Run — pass; Commit**

```bash
git add backend/app/services/entitlement.py backend/app/services/policy_guard.py backend/tests/collab/test_entitlement_service.py
git commit -m "feat(tenant): entitlement service and policy guard"
```

---

### Task 4: 公司 API + 依赖注入

**Files:**
- Create: `backend/app/schemas/company.py`
- Create: `backend/app/api/v1/companies.py`
- Create: `backend/app/api/deps_collab.py`
- Modify: `backend/app/main.py` — include router
- Test: `backend/tests/collab/test_companies_api.py`

**Interfaces:**
- `POST /api/v1/companies` — 超管/开通（saas 自开或 bootstrap）
- `POST /api/v1/companies/{id}/license` — 上传 license
- `GET /api/v1/companies/{id}` — 成员可读摘要
- `PATCH /api/v1/companies/{id}/policy` — 仅 super_admin
- Deps: `CompanyContext = (company, membership)`

- [ ] **Step 1: Write API tests（可用 httpx ASGI + 内存库；与 conftest 对齐）**

```python
# backend/tests/collab/test_companies_api.py
import pytest

@pytest.mark.asyncio
async def test_activate_license_unlocks_company(async_client, super_admin_headers, company_pending):
    """company_pending fixture: status=pending_license"""
    raw, sig = make_dev_license(company_pending["slug"])
    r = await async_client.post(
        f"/api/v1/companies/{company_pending['id']}/license",
        json={"license_payload": raw, "signature": sig},
        headers=super_admin_headers,
    )
    assert r.status_code == 200
    assert r.json()["code"] == 200
    assert r.json()["data"]["status"] == "active"

@pytest.mark.asyncio
async def test_feature_gate_blocks_without_unlock(async_client, member_headers, company_pending):
    r = await async_client.get(
        f"/api/v1/companies/{company_pending['id']}/features",
        headers=member_headers,
    )
    # 或任意需 feature 的端点
    body = r.json()
    assert body["code"] != 200 or r.status_code == 403
```

实现阶段把 `make_dev_license` 放进 `tests/collab/factories.py`。

- [ ] **Step 2: deps_collab**

```python
# backend/app/api/deps_collab.py
from fastapi import Depends, HTTPException, Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, get_db
from app.models.company import Company, CompanyMembership
from app.models.user import User
from app.services.entitlement import EntitlementService


async def get_company(
    company_id: int = Path(...),
    db: AsyncSession = Depends(get_db),
) -> Company:
    row = await db.get(Company, company_id)
    if not row:
        raise HTTPException(status_code=404, detail="公司不存在")
    return row


async def require_company_member(
    company: Company = Depends(get_company),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CompanyMembership:
    q = await db.execute(
        select(CompanyMembership).where(
            CompanyMembership.company_id == company.id,
            CompanyMembership.user_id == user.id,
            CompanyMembership.status == "active",
        )
    )
    m = q.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=403, detail="非本公司成员")
    if m.employment_status != "active":
        raise HTTPException(status_code=403, detail="在职状态无效，已禁止写入与项目操作")
    return m


def require_feature(feature: str):
    async def _inner(company: Company = Depends(get_company)):
        from app.services.entitlement import EntitlementService
        # 使用 handoff fail() 返回 {code,message,data}；示例：
        # pending_license → code 40310；feature off → 40312
        svc = EntitlementService()
        if company.status == "pending_license" or not svc.is_company_unlocked(company):
            raise HTTPException(status_code=403, detail="license_required")  # 实现时改为 fail(403, 40310, ...)
        if not svc.has_feature(company, feature):
            raise HTTPException(status_code=403, detail="功能未开通")
        return company
    return _inner


async def require_super_admin(
    membership: CompanyMembership = Depends(require_company_member),
) -> CompanyMembership:
    if not membership.is_super_admin:
        raise HTTPException(status_code=403, detail="需要公司超级管理员")  # code 40303
    return membership


async def require_org_leader(
    membership: CompanyMembership = Depends(require_company_member),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    company: Company = Depends(get_company),
) -> CompanyMembership:
    from app.services.org_roles import is_org_leader
    if not await is_org_leader(db, user.id, company.id):
        raise HTTPException(status_code=403, detail="需要组织负责人")  # code 40304
    return membership
```

实现 `app/services/org_roles.py::is_org_leader` 严格按 handoff §1.2。

- [ ] **Step 3: companies router 最小实现**

```python
# backend/app/api/v1/companies.py 关键端点
# POST /{id}/license: verify → 写 CompanyLicense → merge features → status=active
# PATCH /{id}/policy: body {preset?, policy_json?} → super_admin only
# GET /{id}: 返回 name, status, features 摘要（脱敏）
```

响应一律 `ResponseData(data=...)`。

- [ ] **Step 4: Register router in main.py**

```python
from app.api.v1 import companies
app.include_router(companies.router, prefix="/api/v1/companies", tags=["companies"])
```

- [ ] **Step 5: Tests pass; Commit**

```bash
git commit -m "feat(tenant): companies API and collab deps"
```

---

### Task 5: Bootstrap 单公司 + SaaS 开通桩

**Files:**
- Create: `backend/app/services/company_bootstrap.py`
- Create: `backend/scripts/bootstrap_single_company.py`（或管理 API）
- Test: `backend/tests/collab/test_bootstrap.py`

**Interfaces:**
- `bootstrap_single_company(db, name, slug, admin_user_id, license_payload?, signature?) -> Company`
- SaaS: `POST /api/v1/companies/saas-open` body `{name, slug}` → status 依赖激活记录

- [ ] **Step 1: Test bootstrap creates membership super_admin**

```python
@pytest.mark.asyncio
async def test_bootstrap_creates_super_admin(db_session, user_a):
    from app.services.company_bootstrap import bootstrap_single_company
    c = await bootstrap_single_company(db_session, name="默认公司", slug="default", admin_user_id=user_a.id)
    assert c.status in ("active", "pending_license")
    # membership is_super_admin True
```

- [ ] **Step 2: Implement bootstrap; wire DEPLOY_MODE 分支文档到 README 片段（可写在 `docs/` 不改前端）**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(tenant): single-company bootstrap and saas open stub"
```

---

### Task 6: 集成验收

- [ ] **Step 1: 跑全部 tenant 测试**

Run: `cd backend; pytest tests/collab/test_tenant_models.py tests/collab/test_license_verify.py tests/collab/test_entitlement_service.py tests/collab/test_companies_api.py tests/collab/test_bootstrap.py -v`  
Expected: all PASS

- [ ] **Step 2: 手工核对** 附录 H 默认 JSON 与 `POLICY_PRESETS` 字段一致

- [ ] **Step 3: Commit 若有修复**

---

## Spec Coverage (self-review)

| 需求 | Task |
|------|------|
| Company 租户 | 1 |
| License / SaaS | 2, 4, 5 |
| entitlement 功能+配额 | 3 |
| policy 三档 | 2, 3 |
| 403 license_required | 4 |
| membership / super_admin | 1, 4 |
| 个人 tasks 不受影响 | 约束 + 无改 tasks 路由 |

**Handoff:** 完成后进入 `2026-07-19-project-tree-acl.md`。
