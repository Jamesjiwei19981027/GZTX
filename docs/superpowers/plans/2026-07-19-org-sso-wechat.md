# Org Sync · SSO · WeChat Channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.  
> **Task board ID:** `P1-BE-07`  
> **HTTP 真源:** [`2026-07-19-api-contracts-v1.md`](./2026-07-19-api-contracts-v1.md) **§8–10**  
> **工程拍板:** handoff §2 jobs · §5 wechat 40320

**Goal:** 组织架构对接（企微/钉钉/飞书/通用）、多登录方式公司开关、离职收权 job、微信可聊可更新但不可交材料的通道适配（复用 Agent chat + 进度澄清）。

**Architecture:** `integration_accounts` 存加密凭证；`OrgSyncProvider` 接口 + 各 provider 实现；同步写 `org_units` / `company_memberships.employment_status`；`membership.revoke_left` job 写 `project_members.left_at`。Identity：账密保留；微信沿用 `wx`；企业 SSO OIDC/OAuth 可插拔。微信通道：`channel=wechat` 调 AgentRuntime，禁止 evidence 文件 API。

**Tech Stack:** FastAPI · SQLAlchemy · httpx · 现有 `app/services/wx_service.py` · cryptography 加密字段 · pytest

## Global Constraints

- Spec: 主方案 §2.4–2.5、§5.3、§7.3、§8.1  
- Contracts: 附录 §C.3–C.4、§C.21、§E 在职硬规则、§J `org.sync`/`membership.revoke_left`、§L E2E-04  
- 微信：**可聊、可更新；不可交材料**  
- 小程序场景映射权限分端（只规划 API 能力标记）  
- 公司超管开关登录方式

**Prerequisites:** tenant（Company/Membership）；project-tree-acl（ProjectMember）；agent-runtime chat（微信更新）可选并行，先做 sync/revoke

---

## File Map

```
backend/app/models/org.py
backend/app/models/integration.py
backend/app/services/org_sync/base.py
backend/app/services/org_sync/wecom.py
backend/app/services/org_sync/generic.py
backend/app/services/org_sync/runner.py
backend/app/services/membership_revoke.py
backend/app/services/sso/base.py
backend/app/services/sso/oidc.py
backend/app/api/v1/org.py
backend/app/api/v1/sso.py
backend/app/api/v1/wx_collab.py   # 协作向微信入口
backend/tests/collab/test_org_sync.py
backend/tests/collab/test_membership_revoke.py
backend/tests/collab/test_wechat_channel.py
backend/tests/collab/test_sso_switch.py
```

---

### Task 1: org_units + integration_accounts 模型

**Files:**
- Create: `backend/app/models/org.py`
- Create: `backend/app/models/integration.py`
- Modify: `company.py` membership 的 `org_unit_id` FK 语义确认
- Test: `backend/tests/collab/test_org_models.py`

- [ ] **Step 1: Failing test**

```python
def test_org_models():
    from app.models.org import OrgUnit
    from app.models.integration import IntegrationAccount
    assert OrgUnit.__tablename__ == "org_units"
    assert IntegrationAccount.__tablename__ == "integration_accounts"
```

- [ ] **Step 2: Implement**

```python
# org.py
class OrgUnit(Base):
    __tablename__ = "org_units"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("org_units.id"), nullable=True)
    name = Column(String(200), nullable=False)
    external_id = Column(String(128), nullable=True)
    source = Column(String(32), nullable=False, default="manual")  # wecom|dingtalk|feishu|manual|generic
    leader_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    path = Column(String(1000), nullable=False, default="/")
    is_active = Column(Boolean, default=True, nullable=False)

# integration.py
class IntegrationAccount(Base):
    __tablename__ = "integration_accounts"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    provider = Column(String(32), nullable=False)  # wecom|dingtalk|feishu|generic_scim
    credentials_encrypted = Column(Text, nullable=False)
    config_json = Column(JSON, nullable=True)
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

唯一约束应用层：`(company_id, source, external_id)` where external_id not null。

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(org): org_units and integration_accounts models"
```

---

### Task 2: 凭证加密与 Provider 接口

**Files:**
- Create: `backend/app/services/secret_box.py`
- Create: `backend/app/services/org_sync/base.py`
- Create: `backend/app/services/org_sync/generic.py`
- Test: `backend/tests/collab/test_secret_box.py`, `test_org_sync.py`

**Interfaces:**
```python
class OrgSyncProvider(Protocol):
    async def fetch_departments(self) -> list[DeptDTO]: ...
    async def fetch_users(self) -> list[UserDTO]: ...

@dataclass
class DeptDTO:
    external_id: str
    name: str
    parent_external_id: str | None
    leader_external_id: str | None

@dataclass
class UserDTO:
    external_id: str
    name: str
    email: str | None
    mobile: str | None
    dept_external_ids: list[str]
    employment: str  # active|left
    title: str | None
```

- [ ] **Step 1: secret_box 用 Fernet 或 AES；key 来自 `settings.INTEGRATION_SECRET_KEY`**

```python
def encrypt_str(plain: str) -> str: ...
def decrypt_str(token: str) -> str: ...
```

- [ ] **Step 2: Generic provider 读 config_json.static_snapshot 便于单测**

```python
class GenericSnapshotProvider:
    def __init__(self, snapshot: dict): ...
    async def fetch_departments(self): return [DeptDTO(**d) for d in self.snapshot["depts"]]
    async def fetch_users(self): return [UserDTO(**u) for u in self.snapshot["users"]]
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(org): secret box and org sync provider protocol"
```

---

### Task 3: Org Sync Runner

**Files:**
- Create: `backend/app/services/org_sync/runner.py`
- Test: `backend/tests/collab/test_org_sync.py`

**Interfaces:**
- `async def run_org_sync(db, company_id, provider: OrgSyncProvider) -> SyncReport`

行为：
1. Upsert org_units by (company_id, source, external_id)，维护 path  
2. 匹配 users：external_user_id 或 email → company_memberships  
3. employment left → membership.employment_status=left  
4. 未知用户可选：只更新状态不自动建账号（默认不自动建；config `auto_create_users=false`）

- [ ] **Step 1: Tests**

```python
@pytest.mark.asyncio
async def test_sync_marks_left_employment(db, company, user_linked):
    from app.services.org_sync.generic import GenericSnapshotProvider
    from app.services.org_sync.runner import run_org_sync
    provider = GenericSnapshotProvider({
        "depts": [{"external_id": "d1", "name": "研发", "parent_external_id": None, "leader_external_id": None}],
        "users": [{
            "external_id": user_linked.external_id,
            "name": "张三",
            "email": user_linked.email,
            "mobile": None,
            "dept_external_ids": ["d1"],
            "employment": "left",
            "title": None,
        }],
    })
    report = await run_org_sync(db, company.id, provider, source="generic")
    assert report.left_count == 1
    # membership.employment_status == left
```

- [ ] **Step 2: Implement runner**  
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(org): sync runner upserts units and employment"
```

---

### Task 4: membership.revoke_left Job

**Files:**
- Create: `backend/app/services/membership_revoke.py`
- Create: `backend/app/workers/org_jobs.py`（或挂 APScheduler）
- Test: `backend/tests/collab/test_membership_revoke.py`

**Interfaces:**
- `async def revoke_left_members(db, company_id: int | None = None) -> int` 返回收权人数

- [ ] **Step 1: E2E-04 风格测试**

```python
@pytest.mark.asyncio
async def test_left_member_project_acl_revoked(db, seed_member_on_project):
    from app.services.membership_revoke import revoke_left_members
    # set employment left
    n = await revoke_left_members(db, seed_member_on_project.company_id)
    assert n >= 1
    # project_members.left_at is not null
    # evidence.submit via acl.can == False
```

- [ ] **Step 2: 实现：对 employment!=active 或 membership.status!=active 的用户，所有 active project_members 写 left_at=now**  
- [ ] **Step 3: 历史 progress/evidence 不删**  
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(org): revoke project membership when employment left"
```

---

### Task 5: Org Admin API

**Files:**
- Create: `backend/app/api/v1/org.py`
- Create: `backend/app/schemas/org.py`
- Modify: `main.py`
- Test: `test_org_api.py`

**Interfaces:**
```
GET  /api/v1/companies/{id}/org-tree
POST /api/v1/companies/{id}/integrations  {provider, credentials, config}
POST /api/v1/companies/{id}/org-sync      手动触发
GET  /api/v1/companies/{id}/members
PATCH /api/v1/companies/{id}/login-methods {password, wechat, wecom, dingtalk, feishu}
```

- [ ] **Step 1: super_admin only for integrations & login-methods**  
- [ ] **Step 2: login_methods 存 company.policy_json["login_methods"] 或独立列 `login_methods_json`**

```python
DEFAULT_LOGIN = {"password": True, "wechat": True, "wecom": False, "dingtalk": False, "feishu": False}
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(org): admin org tree integration and login method switches"
```

---

### Task 6: SSO 桩（OIDC）

**Files:**
- Create: `backend/app/services/sso/base.py`
- Create: `backend/app/services/sso/oidc.py`
- Create: `backend/app/api/v1/sso.py`
- Test: `backend/tests/collab/test_sso_switch.py`

**Interfaces:**
```
GET /api/v1/sso/{provider}/start?company_id=
GET /api/v1/sso/{provider}/callback
```

- [ ] **Step 1: 公司未开 provider → 403「公司未启用该登录方式」**  
- [ ] **Step 2: FakeOIDC 单测：callback 建/绑 user + membership**  
- [ ] **Step 3: P1 完成 start/callback 开关与 FakeOIDC 单测；真实 IdP discovery URL 配在 integration config（契约 §9 路径不得改）；P2 接真企业**  

```python
@pytest.mark.asyncio
async def test_sso_disabled_returns_403(async_client, company_no_wecom):
    r = await async_client.get(f"/api/v1/sso/wecom/start?company_id={company_no_wecom.id}")
    assert r.status_code == 403 or r.json()["code"] != 200
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(sso): provider start/callback with company switches"
```

---

### Task 7: 微信协作通道

**Files:**
- Create: `backend/app/api/v1/wx_collab.py`
- Modify: 现有 `wx.py` 仅个人；协作新路由或扩展
- Test: `backend/tests/collab/test_wechat_channel.py`

**Interfaces:**
```
POST /api/v1/wx/collab/chat
body: { project_id?, node_id?, message?, media_id? }
```

行为：
1. 鉴权 openid → user  
2. 若 media 语音 → ASR（见 asr 计划；本任务可 mock `transcribe`）→ text  
3. `AgentRuntime.chat(..., channel="wechat")`  
4. **拒绝** `POST /api/v1/evidence/files` 用微信 token 场景：同用户若 header `X-Client-Channel: wechat` 则 403

- [ ] **Step 1: Tests**

```python
@pytest.mark.asyncio
async def test_wechat_chat_ok(async_client, seed, monkeypatch):
    monkeypatch.setattr(...)  # FakeLLM
    r = await async_client.post(
        "/api/v1/wx/collab/chat",
        json={"project_id": seed.project_id, "node_id": seed.node_id, "message": "进度到 50%"},
        headers=seed.wx_headers,
    )
    assert r.json()["code"] == 200

@pytest.mark.asyncio
async def test_wechat_cannot_upload_evidence_file(async_client, seed):
    r = await async_client.post(
        "/api/v1/evidence/files",
        files={"file": ("a.png", b"xxx", "image/png")},
        headers={**seed.wx_headers, "X-Client-Channel": "wechat"},
    )
    assert r.status_code == 403 or r.json()["code"] != 200
```

- [ ] **Step 2: evidence files 路由检查 channel**  
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(wx): collab chat channel without evidence upload"
```

---

### Task 8: WeCom provider 骨架 + 调度

**Files:**
- Create: `backend/app/services/org_sync/wecom.py`
- Modify: `main.py` lifespan 或 scheduler 注册 `org.sync` cron（可配置关闭）

- [ ] **Step 1: wecom provider 用 httpx mock 测 parse**  
- [ ] **Step 2: job 入口 `async def job_org_sync_all()`**  
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(org): wecom provider skeleton and scheduled sync job"
```

---

### Task 9: 回归

Run:
```
cd backend
pytest tests/collab/test_org_models.py tests/collab/test_org_sync.py tests/collab/test_membership_revoke.py tests/collab/test_wechat_channel.py tests/collab/test_sso_switch.py -v
```
Expected: PASS（含 E2E-04 逻辑）

---

## Spec Coverage

| 需求 | Task |
|------|------|
| 组织对接通用+企微 | 2, 3, 8 |
| 离职收权 | 4, L E2E-04 |
| 登录开关 | 5, 6 |
| 微信可聊可更新不可交材料 | 7 |
| 超管 | 5 |

**Handoff:** asr-storage-notify 接语音转写；UI 接 org 管理页。
