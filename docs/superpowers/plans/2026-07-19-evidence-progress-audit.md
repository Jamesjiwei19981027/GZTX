# Evidence → Progress Ledger → Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.  
> **Task board ID:** `P0-BE-03`  
> **HTTP 真源:** [`2026-07-19-api-contracts-v1.md`](./2026-07-19-api-contracts-v1.md) **§4–6、§16、§18**  
> **工程拍板:** [`2026-07-19-dev-handoff-patch.md`](./2026-07-19-dev-handoff-patch.md) §2 async_jobs · §4 append_progress · §5 channel · §8 wiki

**Goal:** 实现项目节点上的证据材料包提交、（可插拔）判定、正式进度追加账本、采纳/未采纳、审计日志与频控告警钩子。

**Architecture:** 在租户与项目树已存在的前提下，`EvidencePackage` 提交后写入 `async_jobs`（`evidence.judge`）并由 **APScheduler/asyncio 进程内**执行（**P0 不引入 Redis**）；判定结果经唯一入口 `append_progress` 写 `progress_records` 并更新 `tree_nodes.progress_json`；`audit_logs` 追加记录。判定器先提供 `RuleBasedEvidenceJudge`（可测），再由 Agent 计划替换为 LLM。

**Tech Stack:** FastAPI · SQLAlchemy 2 async · pytest · `ResponseData` + handoff `fail()` · 表 `async_jobs`

## Global Constraints

- Spec: `docs/团队协作与智能体-最终实现方案.md` §2.2、§5  
- **HTTP/DTO:** api-contracts-v1 §4–6  
- Contracts DB: 附录 §C.11–C.15、§C.18 async_jobs、§D、§L  
- 提交后材料不可被提交人改写；progress_records 禁止 UPDATE/DELETE  
- **唯一写进度：** `app.services.progress_service.append_progress`（签名见 handoff §4）  
- **微信：** `X-Client-Channel: wechat` → `POST /evidence/files` 与节点 evidence 提交 **40320**  
- 依赖：`companies`、`projects`、`tree_nodes`、`project_members`；并行时用 seed fixture  
- 中文错误文案；job_id 为 `async_jobs.id` 的字符串形式

**Prerequisites:** 建议先完成 `2026-07-19-project-tree-acl.md`；seed 形状 handoff §6。

---

### Task 0: 测试脚手架与最小项目树 Fixture

**Files:**
- Create: `backend/tests/conftest_collab.py`
- Create: `backend/tests/collab/test_evidence_progress.py`
- Modify: `backend/requirements.txt`（若缺 pytest-asyncio 则确认已有）

**Interfaces:**
- Produces: `async_client`, `seed_company_project_node_member()` → ids dict

- [ ] **Step 1: 确认测试依赖**

Run: `cd backend; python -c "import pytest, pytest_asyncio; print('ok')"`  
Expected: `ok`（若失败则 `pip install pytest pytest-asyncio httpx`）

- [ ] **Step 2: 编写 conftest 最小种子（可先用 SQLAlchemy 内存库）**

Create `backend/tests/conftest_collab.py`:

```python
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

# 注意：实现阶段改为从 app.main 导入 app，并使用测试 DATABASE_URL
# 此处接口约定 seed 返回结构，供后续测试使用

@pytest.fixture
def seed_ids():
    """替换为真实 DB seed 后返回:
    {
      "company_id": 1,
      "project_id": 1,
      "node_id": 1,
      "pm_user_id": 1,
      "member_user_id": 2,
      "member_headers": {"Authorization": "Bearer <token>"},
      "pm_headers": {"Authorization": "Bearer <token>"},
    }
    """
    return {}
```

- [ ] **Step 3: 在实现 Task 1 模型后，将 seed 接到真实注册/登录与建树 API 或 factory**

- [ ] **Step 4: Commit**

```bash
git add backend/tests/conftest_collab.py
git commit -m "test: add collab evidence fixture scaffold"
```

---

### Task 1: Evidence / Progress / Audit SQLAlchemy 模型

**Files:**
- Create: `backend/app/models/evidence.py`
- Create: `backend/app/models/progress.py`
- Create: `backend/app/models/audit.py`
- Modify: `backend/app/models/__init__.py` — export 新模型供 `init_db` 建表

**Interfaces:**
- Produces: classes `EvidencePackage`, `EvidenceFile`, `ProgressRecord`, `AdoptionRecord`, `AuditLog` matching 附录 §C.11–C.14 / C.20

- [ ] **Step 1: Write failing import test**

Create `backend/tests/collab/test_models_evidence.py`:

```python
def test_evidence_models_importable():
    from app.models.evidence import EvidencePackage, EvidenceFile
    from app.models.progress import ProgressRecord, AdoptionRecord
    from app.models.audit import AuditLog
    assert EvidencePackage.__tablename__ == "evidence_packages"
    assert ProgressRecord.__tablename__ == "progress_records"
    assert AuditLog.__tablename__ == "audit_logs"
```

- [ ] **Step 2: Run test — expect fail**

Run: `cd backend; pytest tests/collab/test_models_evidence.py::test_evidence_models_importable -v`  
Expected: FAIL `ModuleNotFoundError` or import error

- [ ] **Step 3: Implement models (minimal columns per 附录)**

`backend/app/models/evidence.py` 核心字段：

```python
from sqlalchemy import Column, Integer, BigInteger, String, Text, DateTime, ForeignKey, JSON, Boolean
from sqlalchemy.sql import func
from app.db.base import Base

class EvidencePackage(Base):
    __tablename__ = "evidence_packages"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, nullable=False, index=True)
    project_id = Column(Integer, nullable=False, index=True)
    node_id = Column(Integer, nullable=False, index=True)
    submitter_user_id = Column(Integer, nullable=False, index=True)
    status = Column(String(32), nullable=False, default="draft")
    summary_text = Column(Text, nullable=True)
    structured_json = Column(JSON, nullable=True)
    links_json = Column(JSON, nullable=True)
    supersedes_package_id = Column(Integer, ForeignKey("evidence_packages.id"), nullable=True)
    precheck_errors_json = Column(JSON, nullable=True)
    judge_result_json = Column(JSON, nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    judged_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class EvidenceFile(Base):
    __tablename__ = "evidence_files"
    id = Column(Integer, primary_key=True)
    package_id = Column(Integer, ForeignKey("evidence_packages.id"), nullable=False, index=True)
    storage_key = Column(String(500), nullable=False)
    original_name = Column(String(300), nullable=False)
    mime_type = Column(String(128), nullable=True)
    size_bytes = Column(Integer, nullable=False, default=0)
    sha256 = Column(String(64), nullable=True)
    kind = Column(String(32), nullable=False, default="file")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

`progress.py` / `audit.py` 按附录同样落地 `ProgressRecord(before_json, after_json, source, event_type, ...)`、`AdoptionRecord`、`AuditLog`。

- [ ] **Step 4: Export in `models/__init__.py`**

```python
from app.models.evidence import EvidencePackage, EvidenceFile
from app.models.progress import ProgressRecord, AdoptionRecord
from app.models.audit import AuditLog
```

- [ ] **Step 5: Run test — expect pass**

Run: `cd backend; pytest tests/collab/test_models_evidence.py::test_evidence_models_importable -v`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/evidence.py backend/app/models/progress.py backend/app/models/audit.py backend/app/models/__init__.py backend/tests/collab/test_models_evidence.py
git commit -m "feat(models): add evidence, progress ledger, audit tables"
```

---

### Task 2: ProgressService — 追加账本 + 更新快照

**Files:**
- Create: `backend/app/services/progress_service.py`
- Create: `backend/tests/collab/test_progress_service.py`

**Interfaces:**
- Produces:
```python
async def append_progress(
    db: AsyncSession,
    *,
    company_id: int,
    project_id: int,
    node_id: int,
    event_type: str,
    source: str,
    after_json: dict,
    before_json: dict | None = None,
    actor_user_id: int | None = None,
    evidence_package_id: int | None = None,
    reason: str | None = None,
) -> ProgressRecord: ...
```
- Consumes: `TreeNode` model with `progress_json`（来自 project-tree 计划）；若节点模型未合并，本 Task 内用简单 `nodes` 表 mock 或最小 TreeNode

- [ ] **Step 1: Failing unit test**

```python
import pytest
from app.services.progress_service import append_progress

@pytest.mark.asyncio
async def test_append_progress_writes_record_and_updates_node(db_session, seed_node):
    before = dict(seed_node.progress_json)
    after = {
        "template": "work_item",
        "status": "done",
        "percent": 100,
        "checklist": [],
        "updated_at": "2026-07-19T00:00:00Z",
    }
    rec = await append_progress(
        db_session,
        company_id=seed_node.company_id,
        project_id=seed_node.project_id,
        node_id=seed_node.id,
        event_type="set_status",
        source="pm_agent_auto",
        before_json=before,
        after_json=after,
        reason="test",
    )
    await db_session.commit()
    assert rec.id is not None
    assert rec.after_json["status"] == "done"
    await db_session.refresh(seed_node)
    assert seed_node.progress_json["status"] == "done"
    assert seed_node.progress_json["last_record_id"] == rec.id
```

- [ ] **Step 2: Run — FAIL（函数不存在）**

Run: `cd backend; pytest tests/collab/test_progress_service.py::test_append_progress_writes_record_and_updates_node -v`

- [ ] **Step 3: Implement `append_progress`**

```python
async def append_progress(db, *, company_id, project_id, node_id, event_type, source,
                          after_json, before_json=None, actor_user_id=None,
                          evidence_package_id=None, reason=None):
    from app.models.progress import ProgressRecord
    from app.models.tree import TreeNode  # 或当前节点模型路径
    node = await db.get(TreeNode, node_id)
    if node is None:
        raise ValueError("node_not_found")
    snapshot = dict(after_json)
    rec = ProgressRecord(
        company_id=company_id,
        project_id=project_id,
        node_id=node_id,
        event_type=event_type,
        source=source,
        actor_user_id=actor_user_id,
        evidence_package_id=evidence_package_id,
        before_json=before_json,
        after_json=snapshot,
        reason=reason,
    )
    db.add(rec)
    await db.flush()
    snapshot = {**snapshot, "last_record_id": rec.id}
    rec.after_json = snapshot
    node.progress_json = snapshot
    await db.flush()
    return rec
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/progress_service.py backend/tests/collab/test_progress_service.py
git commit -m "feat: append-only progress ledger service"
```

---

### Task 3: RuleBasedEvidenceJudge + Adoption

**Files:**
- Create: `backend/app/services/evidence_judge.py`
- Create: `backend/tests/collab/test_evidence_judge.py`

**Interfaces:**
- Produces:
```python
@dataclass
class JudgeResult:
    decision: str  # adopted | rejected
    reason: str
    progress_after: dict
    wiki_draft: dict | None
    confidence: float

class RuleBasedEvidenceJudge:
    def judge(self, *, node: dict, package: dict, policy: dict) -> JudgeResult: ...
```
- 规则（可测默认）：若 `allow_clear_text` 且 summary 长度≥10 → adopted 且 status in_progress；若存在 files 或 links → adopted 可 done；否则 rejected

- [ ] **Step 1: Failing tests**

```python
from app.services.evidence_judge import RuleBasedEvidenceJudge

def test_reject_empty_package():
    j = RuleBasedEvidenceJudge()
    r = j.judge(
        node={"template": "work_item", "progress": {"status": "not_started"}, "allow_clear_text_progress": False},
        package={"summary_text": "", "structured": {}, "links": [], "files": []},
        policy={},
    )
    assert r.decision == "rejected"

def test_adopt_with_file():
    j = RuleBasedEvidenceJudge()
    r = j.judge(
        node={"template": "work_item", "progress": {"status": "in_progress", "percent": 0, "checklist": [], "template": "work_item"}, "allow_clear_text_progress": False},
        package={"summary_text": "完成", "structured": {}, "links": [], "files": [{"name": "a.png"}]},
        policy={},
    )
    assert r.decision == "adopted"
    assert r.progress_after["status"] in ("done", "in_progress", "pending_acceptance")
```

- [ ] **Step 2: Run FAIL → Step 3 implement → Step 4 PASS → Step 5 commit**

```bash
git commit -m "feat: rule-based evidence judge for deterministic tests"
```

---

### Task 4: Evidence submit API + immutability

**Files:**
- Create: `backend/app/api/v1/evidence.py`
- Create: `backend/app/schemas/evidence.py`
- Create: `backend/app/services/evidence_service.py`
- Modify: `backend/app/api/v1/__init__.py` or `main.py` — include router
- Create: `backend/tests/collab/test_evidence_api.py`

**Interfaces:**
- `POST /api/v1/nodes/{node_id}/evidence` → 附录 F.3  
- `GET /api/v1/evidence/{package_id}`  
- Produces service:
```python
async def submit_evidence_package(db, user, node_id, payload) -> EvidencePackage: ...
```

- [ ] **Step 1: API test — member submits with file metadata**

```python
@pytest.mark.asyncio
async def test_submit_evidence_happy_path(client, member_headers, node_id):
    # 先 POST 伪文件登记或直接 structured+links
    r = await client.post(
        f"/api/v1/nodes/{node_id}/evidence",
        headers=member_headers,
        json={
            "summary_text": "接口已联调",
            "structured": {"percent": 80},
            "links": [{"url": "https://example.com/pr/1", "title": "PR", "kind": "pr"}],
            "file_ids": [],
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["code"] == 200
    assert body["data"]["status"] in ("submitted", "judging", "adopted")
    package_id = body["data"]["package_id"]

    # 不可篡改
    r2 = await client.patch(
        f"/api/v1/evidence/{package_id}",
        headers=member_headers,
        json={"summary_text": "hack"},
    )
    assert r2.status_code in (404, 405, 403)
```

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement router + service**

要点：
- ACL：`project_members` 且 employment active  
- 创建 package status=`submitted`，enqueue judge job（Task 5 可同步调用 judge 以便先绿）  
- 不提供 submitter 的 PATCH  

- [ ] **Step 4: PASS + Commit**

```bash
git commit -m "feat(api): submit evidence packages for project nodes"
```

---

### Task 5: Judge pipeline — adopt/reject + progress + audit + wiki hook

**Files:**
- Create: `backend/app/services/evidence_pipeline.py`
- Modify: `backend/app/services/evidence_service.py` — submit 后调用 pipeline（同步或 background）
- Create: `backend/tests/collab/test_evidence_pipeline.py`

**Interfaces:**
```python
async def run_evidence_judge(db, package_id: int, judge: RuleBasedEvidenceJudge | None = None) -> None:
    """Load package+node → judge → adoption_records → append_progress if adopted
    → audit_logs → optional wiki draft insert → notify hooks (no-op stub ok)
    """
```

- [ ] **Step 1: Test adopted path creates progress_record and audit**

```python
@pytest.mark.asyncio
async def test_pipeline_adopted_writes_progress_and_audit(db_session, package_with_link):
    from app.services.evidence_pipeline import run_evidence_judge
    from app.models.progress import ProgressRecord, AdoptionRecord
    from app.models.audit import AuditLog
    from sqlalchemy import select
    await run_evidence_judge(db_session, package_with_link.id)
    await db_session.commit()
    ad = (await db_session.execute(
        select(AdoptionRecord).where(AdoptionRecord.package_id == package_with_link.id)
    )).scalar_one()
    assert ad.decision == "adopted"
    assert ad.in_wiki is True
    pr = (await db_session.execute(
        select(ProgressRecord).where(ProgressRecord.evidence_package_id == package_with_link.id)
    )).scalar_one()
    assert pr.source == "pm_agent_auto"
    logs = (await db_session.execute(
        select(AuditLog).where(AuditLog.action == "progress.auto_write")
    )).scalars().all()
    assert len(logs) >= 1
```

- [ ] **Step 2: Test rejected path no progress, in_wiki false**

```python
@pytest.mark.asyncio
async def test_pipeline_rejected_no_progress(db_session, empty_package):
    from app.services.evidence_pipeline import run_evidence_judge
    from app.models.progress import ProgressRecord, AdoptionRecord
    from sqlalchemy import select, func
    await run_evidence_judge(db_session, empty_package.id)
    await db_session.commit()
    ad = (await db_session.execute(
        select(AdoptionRecord).where(AdoptionRecord.package_id == empty_package.id)
    )).scalar_one()
    assert ad.decision == "rejected"
    assert ad.in_wiki is False
    cnt = (await db_session.execute(
        select(func.count()).select_from(ProgressRecord).where(
            ProgressRecord.evidence_package_id == empty_package.id
        )
    )).scalar_one()
    assert cnt == 0
```

- [ ] **Step 3: Implement pipeline**

- [ ] **Step 4: PASS + Commit**

```bash
git commit -m "feat: evidence judge pipeline writes progress ledger and audit"
```

---

### Task 6: 二次上传 supersedes + 频控审计钩子

**Files:**
- Modify: `backend/app/services/evidence_service.py`
- Create: `backend/app/services/progress_rate_limit.py`
- Create: `backend/tests/collab/test_evidence_resubmit.py`

**Interfaces:**
```python
def check_progress_rate_limit(db, node_id: int, window_seconds: int = 3600, max_writes: int = 20) -> bool:
    """Return True if ALERT should fire (too many progress_records in window)."""
```

- [ ] **Step 1: Test resubmit requires new package and sets supersedes_package_id**

```python
@pytest.mark.asyncio
async def test_resubmit_after_reject(client, member_headers, rejected_package_id, node_id):
    r = await client.post(
        f"/api/v1/nodes/{node_id}/evidence",
        headers=member_headers,
        json={
            "summary_text": "补交说明足够长了",
            "links": [{"url": "https://example.com/p", "title": "p", "kind": "doc"}],
            "file_ids": [],
            "supersedes_package_id": rejected_package_id,
        },
    )
    assert r.status_code == 200
    assert r.json()["data"]["package_id"] != rejected_package_id
```

- [ ] **Step 2: Test rate limit returns alert true after 21 writes**

```python
def test_rate_limit_alert(db_with_21_progress_on_node, node_id):
    from app.services.progress_rate_limit import check_progress_rate_limit
    assert check_progress_rate_limit(db_with_21_progress_on_node, node_id) is True
```

- [ ] **Step 3: Implement + wire alert into pipeline after append_progress（notify stub 记 audit `progress.rate_alert`）**

- [ ] **Step 4: PASS + Commit**

```bash
git commit -m "feat: evidence resubmit supersedes and progress rate alerts"
```

---

### Task 7: Review case confirm API（人 PM 四件事最小集）

**Files:**
- Create: `backend/app/api/v1/review.py`
- Create: `backend/app/services/review_service.py`
- Create: `backend/tests/collab/test_review_confirm.py`

**Interfaces:**
- `POST /api/v1/evidence/{package_id}/review-request`
- `POST /api/v1/review-cases/{id}/supplement` body `{text}`
- `POST /api/v1/review-cases/{id}/confirm` body `{decision, progress_after?}`

Confirm 事务必须：
1. 更新/写入 adoption  
2. 若 adopted → append_progress source=`human_pm_confirm`  
3. wiki 若 adopted  
4. audit  
5. notify stub  

- [ ] **Step 1: Failing API test PM confirms rejected → adopted**

```python
@pytest.mark.asyncio
async def test_pm_confirm_adopted(client, pm_headers, rejected_package_id):
    r = await client.post(
        f"/api/v1/evidence/{rejected_package_id}/review-request",
        headers=pm_headers,  # 或 member 发起
        json={},
    )
    case_id = r.json()["data"]["case_id"]
    await client.post(
        f"/api/v1/review-cases/{case_id}/supplement",
        headers=pm_headers,
        json={"text": "与提交人沟通后材料有效"},
    )
    r3 = await client.post(
        f"/api/v1/review-cases/{case_id}/confirm",
        headers=pm_headers,
        json={
            "decision": "adopted",
            "progress_after": {
                "template": "work_item",
                "status": "done",
                "percent": 100,
                "checklist": [],
            },
        },
    )
    assert r3.status_code == 200
    assert r3.json()["code"] == 200
```

- [ ] **Step 2–5: Implement, pass, commit**

```bash
git commit -m "feat: PM review case confirm runs four side effects"
```

---

### Task 8: 集成文档与手工 E2E 脚本

**Files:**
- Create: `backend/scripts/e2e_evidence_smoke.sh` 或 `.py`
- Modify: `docs/团队协作与智能体-最终实现方案-附录-可实施规格.md` — 若实现偏差记「实现注记」

- [ ] **Step 1: 编写 smoke：注册→建公司/项目/节点→交材料→查 progress_records**

- [ ] **Step 2: Run smoke against local uvicorn**

- [ ] **Step 3: Commit**

```bash
git commit -m "test: evidence progress smoke script"
```

---

## Plan Self-Review

| Spec 项 | Task |
|---------|------|
| 材料提交/不可改 | T4 |
| PM 自动判（规则版） | T3/T5 |
| progress 追加账本 | T2/T5 |
| 未采纳不进 wiki | T5 |
| 二次上传 | T6 |
| 频控告警 | T6 |
| 人确认四件事 | T7 |
| 审计 | T5/T7 |

Placeholders: 无 TBD；LLM 判定留给 agent-runtime 计划替换 `RuleBasedEvidenceJudge`。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-19-evidence-progress-audit.md`.

**前置：** `project-tree-acl` 最小树与成员，或 Task 0 fixture。

**Two execution options:**

1. **Subagent-Driven（推荐）** — 每 Task 新 subagent + 复盘  
2. **Inline Execution** — 本会话按 Task 0→8 执行  

Which approach?
