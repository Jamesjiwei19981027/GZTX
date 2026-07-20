# ASR · Storage · Notification Engines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.  
> **Task board ID:** `P1-BE-06`  
> **HTTP 真源:** [`2026-07-19-api-contracts-v1.md`](./2026-07-19-api-contracts-v1.md) **§11–13**  
> **工程拍板:** handoff §0 storage/asr · policy egress

**Goal:** 可插拔 ASR 路由、对象存储路由、三通道通知（站内/微信/邮件）与 `notify_jobs` 派发，受公司 policy/entitlement 约束。

**Architecture:** 绑定表 `asr_bindings` / `storage_bindings` / `model_bindings`；Router 按公司默认 + 用户白名单覆盖选择实现。NotificationService 统一入队 `notify_jobs`，worker 按 channel 发送。复用现有 `utils/email.py`、`web_push.py`、`wechat.py`。

**Tech Stack:** FastAPI · SQLAlchemy · httpx · 现有邮件/微信工具 · pytest · 本地文件系统存储默认

## Global Constraints

- Spec: 主方案 §2.5、§8.2–8.5  
- Contracts: 附录 §C.18、§C.21、§H policy egress、§J `notify.dispatch`  
- 首发通道：站内 + 微信 + 邮件；短信预留接口不实现发送  
- ASR：内置 + 云 + 企业自建；默认公司级，个人白名单自选  
- storage_mode 受 policy；isolated 禁止外部 file egress

**Prerequisites:** tenant PolicyGuard；evidence 上传可接 StorageRouter；agent send_notify 接本通知服务

---

## File Map

```
backend/app/models/bindings.py
backend/app/services/asr/base.py
backend/app/services/asr/builtin.py
backend/app/services/asr/router.py
backend/app/services/storage/base.py
backend/app/services/storage/local.py
backend/app/services/storage/s3_compat.py
backend/app/services/storage/router.py
backend/app/services/notify/service.py
backend/app/services/notify/channels.py
backend/app/models/notify.py
backend/app/workers/notify_worker.py
backend/app/api/v1/bindings.py
backend/tests/collab/test_asr_router.py
backend/tests/collab/test_storage_router.py
backend/tests/collab/test_notify_service.py
```

---

### Task 1: Binding 模型

**Files:**
- Create: `backend/app/models/bindings.py`
- Create: `backend/app/models/notify.py`
- Test: `backend/tests/collab/test_binding_models.py`

- [ ] **Step 1: Test import**

```python
def test_binding_and_notify_models():
    from app.models.bindings import AsrBinding, StorageBinding, ModelBinding
    from app.models.notify import NotifyPolicy, NotifyJob
    assert AsrBinding.__tablename__ == "asr_bindings"
    assert NotifyJob.__tablename__ == "notify_jobs"
```

- [ ] **Step 2: Implement**

```python
class AsrBinding(Base):
    __tablename__ = "asr_bindings"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # null=公司默认
    provider_id = Column(String(64), nullable=False)  # builtin|cloud:xxx|customer:xxx
    config_json = Column(JSON, nullable=True)
    is_default = Column(Boolean, default=False)

class StorageBinding(Base):
    __tablename__ = "storage_bindings"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    provider_id = Column(String(64), nullable=False)  # local|s3|customer
    config_json = Column(JSON, nullable=True)  # bucket, endpoint, prefix
    is_default = Column(Boolean, default=True)

class ModelBinding(Base):
    __tablename__ = "model_bindings"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    provider_id = Column(String(64), nullable=False)
    config_json = Column(JSON, nullable=True)
    is_default = Column(Boolean, default=False)

class NotifyPolicy(Base):
    __tablename__ = "notify_policies"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    event_key = Column(String(64), nullable=False)  # evidence.adopted|progress.auto_write|...
    channels_json = Column(JSON, nullable=False, default=lambda: ["in_app", "wechat", "email"])
    enabled = Column(Boolean, default=True)

class NotifyJob(Base):
    __tablename__ = "notify_jobs"
    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    channel = Column(String(32), nullable=False)  # in_app|wechat|email|sms
    template_key = Column(String(64), nullable=False)
    payload_json = Column(JSON, nullable=False, default=dict)
    status = Column(String(32), nullable=False, default="pending")  # pending|sent|failed
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    sent_at = Column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(infra): asr storage model bindings and notify jobs"
```

---

### Task 2: Storage Router

**Files:**
- Create: `backend/app/services/storage/base.py`
- Create: `backend/app/services/storage/local.py`
- Create: `backend/app/services/storage/s3_compat.py`
- Create: `backend/app/services/storage/router.py`
- Test: `backend/tests/collab/test_storage_router.py`

**Interfaces:**
```python
class ObjectStorage(Protocol):
    async def put(self, key: str, data: bytes, content_type: str) -> str: ...
    async def get_url(self, key: str, expires_sec: int = 3600) -> str: ...
    async def delete(self, key: str) -> None: ...

class StorageRouter:
    async def for_company(self, db, company) -> ObjectStorage: ...
```

- [ ] **Step 1: Tests**

```python
@pytest.mark.asyncio
async def test_local_storage_put_get(tmp_path, monkeypatch):
    from app.services.storage.local import LocalStorage
    s = LocalStorage(root=str(tmp_path))
    key = await s.put("ev/1/a.txt", b"hello", "text/plain")
    assert (tmp_path / key).exists() or (tmp_path / "ev/1/a.txt").exists()

@pytest.mark.asyncio
async def test_isolated_policy_blocks_external_s3(company_isolated):
    from app.services.storage.router import StorageRouter
    from app.services.policy_guard import PolicyGuard
    # company policy file_egress deny_external → 仅允许 local/customer 配置为私有
    router = StorageRouter()
    backend = await router.for_company(db, company_isolated)
    assert backend.provider_id in ("local", "customer")
```

- [ ] **Step 2: LocalStorage 默认 `settings.UPLOAD_DIR` 或 `data/objects`**  
- [ ] **Step 3: evidence files API 改用 StorageRouter.put**  
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(storage): local and routed object storage"
```

---

### Task 3: ASR Router

**Files:**
- Create: `backend/app/services/asr/base.py`
- Create: `backend/app/services/asr/builtin.py`
- Create: `backend/app/services/asr/router.py`
- Test: `backend/tests/collab/test_asr_router.py`

**Interfaces:**
```python
class AsrEngine(Protocol):
    async def transcribe(self, audio: bytes, mime: str, language: str = "zh") -> str: ...

class AsrRouter:
    async def resolve(self, db, company, user_id: int | None) -> AsrEngine: ...
```

- [ ] **Step 1: Builtin stub**

```python
class BuiltinAsr:
    provider_id = "builtin"
    async def transcribe(self, audio, mime, language="zh") -> str:
        # 开发桩：无真实模型时返回固定提示或调用可选 faster-whisper
        if not audio:
            return ""
        return "[builtin-asr]（请配置真实模型）"
```

测试用 `FakeAsr` 返回 `"你好世界"`。

- [ ] **Step 2: resolve 顺序**

1. user binding if PolicyGuard.allow_asr(company, provider_id)  
2. else company default binding  
3. else builtin  

- [ ] **Step 3: allowlist 拒绝**

```python
@pytest.mark.asyncio
async def test_user_cannot_pick_disallowed_cloud(db, company_controlled):
    from app.services.asr.router import AsrRouter
    import pytest
    with pytest.raises(PermissionError):
        await AsrRouter().resolve(db, company_controlled, user_id=1, preferred="cloud:foo")
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(asr): router with company default and user allowlist"
```

---

### Task 4: Notification Service

**Files:**
- Create: `backend/app/services/notify/service.py`
- Create: `backend/app/services/notify/channels.py`
- Create: `backend/app/workers/notify_worker.py`
- Test: `backend/tests/collab/test_notify_service.py`

**Interfaces:**
```python
class NotificationService:
    async def enqueue(
        self, db, *, company_id, user_ids: list[int], template_key: str,
        payload: dict, channels: list[str] | None = None, project_id: int | None = None,
    ) -> list[int]:  # job ids
```

- [ ] **Step 1: Tests**

```python
@pytest.mark.asyncio
async def test_enqueue_creates_jobs_per_channel(db, user_a, company):
    from app.services.notify.service import NotificationService
    svc = NotificationService()
    ids = await svc.enqueue(
        db, company_id=company.id, user_ids=[user_a.id],
        template_key="evidence.adopted",
        payload={"package_id": 1, "node_title": "登录"},
        channels=["in_app", "email"],
    )
    assert len(ids) == 2

@pytest.mark.asyncio
async def test_worker_marks_sent(db, pending_job, monkeypatch):
    monkeypatch.setattr("app.services.notify.channels.send_email_channel", AsyncMock(return_value=True))
    from app.workers.notify_worker import process_one_job
    await process_one_job(db, pending_job.id)
    # status sent
```

- [ ] **Step 2: channels.py**

```python
async def send_in_app(user_id, template_key, payload):  # 写 notifications 表或 collab_inbox
async def send_email_channel(user, template_key, payload):  # 复用 app.utils.email
async def send_wechat_channel(user, template_key, payload):  # 复用 wechat 订阅/客服消息
async def send_sms_channel(...):  # raise NotImplemented 或 no-op log
```

- [ ] **Step 3: 模板中文**

```python
TEMPLATES = {
    "evidence.adopted": "你的材料「{node_title}」已采纳，正式进度已更新。",
    "evidence.rejected": "你的材料「{node_title}」未采纳：{reason}",
    "progress.auto_write_alert": "节点「{node_title}」在 1 小时内自动写入进度次数过多，请关注。",
    "review.awaiting_pm": "有复核待你确认：{summary}",
}
```

- [ ] **Step 4: 证据脊梁 adoption 后调用 enqueue**  
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(notify): multi-channel enqueue and worker"
```

---

### Task 5: 进度频控告警钩子

**Files:**
- Modify: ProgressService（脊梁计划）或 `backend/app/services/progress_alert.py`
- Test: `test_notify_service.py` 追加

- [ ] **Step 1: 按 policy progress_auto_write_alert 统计 window 内 writes**  
- [ ] **Step 2: 超阈 → notify PM roles**  

```python
@pytest.mark.asyncio
async def test_progress_burst_alerts_pm(db, seed):
    # 写入 21 次 progress records in window
    from app.services.progress_alert import check_and_alert
    alerted = await check_and_alert(db, seed.node_id)
    assert alerted is True
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(notify): progress auto-write frequency alert"
```

---

### Task 6: Bindings Admin API

**Files:**
- Create: `backend/app/api/v1/bindings.py`
- Test: `test_bindings_api.py`

```
GET/PUT /api/v1/companies/{id}/bindings/storage
GET/PUT /api/v1/companies/{id}/bindings/asr
GET/PUT /api/v1/companies/{id}/bindings/models
PUT /api/v1/users/me/bindings/asr  # 仅白名单 provider
```

- [ ] **Step 1: super_admin 改公司；用户改自己 ASR**  
- [ ] **Step 2: PolicyGuard 校验**  
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(bindings): company and user asr storage model APIs"
```

---

### Task 7: Report policy 桩（可选同包）

**Files:**
- Create: `backend/app/models/report.py` — ReportPolicy, ReportRun
- Create: `backend/app/services/report_runner.py` 最小 manual_confirm

- [ ] **Step 1: POST /api/v1/projects/{id}/reports/run** 生成文本摘要占位  
- [ ] **Step 2: Commit**

```bash
git commit -m "feat(report): report policy and manual run stub"
```

---

### Task 8: 回归

```
cd backend
pytest tests/collab/test_binding_models.py tests/collab/test_storage_router.py tests/collab/test_asr_router.py tests/collab/test_notify_service.py -v
```
Expected: PASS

---

## Spec Coverage

| 需求 | Task |
|------|------|
| ASR 可插拔+白名单 | 3, 6 |
| 存储路由+隔离 | 2, 6 |
| 站内/微信/邮件 | 4 |
| 频控告警 | 5 |
| notify_jobs | 1, 4 |
| 汇报桩 | 7 |

**Handoff:** web-miniprogram-ui 设置页绑存储/ASR；wx_collab 调 AsrRouter。
