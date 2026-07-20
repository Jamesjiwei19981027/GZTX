# Agent Runtime · Tools · Personas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.  
> **Task board ID:** `P1-BE-05`  
> **HTTP 真源:** [`2026-07-19-api-contracts-v1.md`](./2026-07-19-api-contracts-v1.md) **§7 · §17 · §18**  
> **工程拍板:** handoff §4 `append_progress` · §5 channel

**Goal:** 实现智能体定义/绑定/会话、工具鉴权 harness、自创 ≤5、本体与项目分身，并将 `evidence.judge` 从 RuleBased 可切换为 LLM PM 判定器。

**Architecture:** Agent = LLM + harness。`AgentRuntime.chat` 解析场景绑定 → 加载 system prompt + 项目/节点上下文 → LLM 可选 tool_calls → 每工具 `authorize` + `PolicyGuard` → 结果回灌。内置系统模板 `system_executor` / `system_pm`；用户 `user_created` 硬限 5。微信通道复用同一 chat API，不开放 `submit_evidence` 文件上传工具。

**Tech Stack:** FastAPI · SQLAlchemy · 可插拔 `LLMClient`（先 FakeLLM 可测）· 依赖 tree ACL + evidence progress services

## Global Constraints

- Spec: 主方案 §2.3、§5.2–5.5、§6  
- Contracts: 附录 §B.4、§C.17、§F.5–F.6、§G  
- 自创智能体 ≤5（未删）  
- 正式进度写入仅经 `pm_write_progress` / ProgressService，禁止 agent 直改 tasks  
- 高风险 `send_notify` 需二次确认标志  
- 中文回复与错误

**Prerequisites:** tenant + project-tree-acl + evidence-progress-audit（至少 ProgressService + EvidencePackage 状态机 + RuleBasedEvidenceJudge）

---

## File Map

```
backend/app/models/agent.py
backend/app/services/llm/base.py
backend/app/services/llm/fake.py
backend/app/services/llm/openai_compat.py
backend/app/services/agent_tools.py      # tool registry + handlers
backend/app/services/agent_runtime.py
backend/app/services/evidence_judge_llm.py
backend/app/schemas/agent.py
backend/app/api/v1/agents.py
backend/tests/collab/test_agent_models.py
backend/tests/collab/test_agent_tools_auth.py
backend/tests/collab/test_agent_chat.py
backend/tests/collab/test_agent_quota.py
backend/tests/collab/test_llm_judge.py
```

---

### Task 1: Agent 模型

**Files:**
- Create: `backend/app/models/agent.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/collab/test_agent_models.py`

**Interfaces:**
- Produces: `AgentDefinition`, `AgentBinding`, `AgentSession`, `AgentMessage`, `AgentToolCall`

- [ ] **Step 1: Failing test**

```python
def test_agent_models():
    from app.models.agent import (
        AgentDefinition, AgentBinding, AgentSession, AgentMessage, AgentToolCall,
    )
    assert AgentDefinition.__tablename__ == "agent_definitions"
    assert AgentToolCall.__tablename__ == "agent_tool_calls"
```

- [ ] **Step 2: Implement**

```python
# backend/app/models/agent.py
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from app.db.base import Base

class AgentDefinition(Base):
    __tablename__ = "agent_definitions"
    id = Column(Integer, primary_key=True)
    owner_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    kind = Column(String(32), nullable=False)  # system_executor|system_pm|user_created
    name = Column(String(100), nullable=False)
    system_prompt = Column(Text, nullable=False, default="")
    tools_json = Column(JSON, nullable=False, default=list)  # allowed tool_ids
    model_binding_id = Column(Integer, nullable=True)
    workflow_json = Column(JSON, nullable=True)
    is_template = Column(Boolean, default=False, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)
    cloned_from_id = Column(Integer, ForeignKey("agent_definitions.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AgentBinding(Base):
    __tablename__ = "agent_bindings"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    scene = Column(String(64), nullable=False)  # general|progress_update|report|pm_judge|custom:*
    agent_definition_id = Column(Integer, ForeignKey("agent_definitions.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AgentSession(Base):
    __tablename__ = "agent_sessions"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    agent_definition_id = Column(Integer, ForeignKey("agent_definitions.id"), nullable=False)
    persona_mode = Column(String(32), nullable=False, default="body")  # body|project_avatar
    title = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class AgentMessage(Base):
    __tablename__ = "agent_messages"
    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("agent_sessions.id"), nullable=False, index=True)
    role = Column(String(16), nullable=False)  # user|assistant|system|tool
    content = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AgentToolCall(Base):
    __tablename__ = "agent_tool_calls"
    id = Column(Integer, primary_key=True)
    message_id = Column(Integer, ForeignKey("agent_messages.id"), nullable=False, index=True)
    tool_id = Column(String(64), nullable=False)
    args_json = Column(JSON, nullable=True)
    result_json = Column(JSON, nullable=True)
    authorized = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(agent): definition session message models"
```

---

### Task 2: 系统模板种子 + 自创配额

**Files:**
- Create: `backend/app/services/agent_catalog.py`
- Test: `backend/tests/collab/test_agent_quota.py`

**Interfaces:**
- `ensure_system_agents(db) -> None`
- `count_user_created(db, user_id) -> int`
- `create_user_agent(...)` raises `AgentQuotaExceeded` if >= 5

- [ ] **Step 1: Tests**

```python
@pytest.mark.asyncio
async def test_user_created_hard_limit_5(db, user_a):
    from app.services.agent_catalog import create_user_agent, AgentQuotaExceeded
    import pytest
    for i in range(5):
        await create_user_agent(db, user_id=user_a.id, name=f"a{i}", system_prompt="x", tools_json=[])
    with pytest.raises(AgentQuotaExceeded):
        await create_user_agent(db, user_id=user_a.id, name="a6", system_prompt="x", tools_json=[])

@pytest.mark.asyncio
async def test_soft_deleted_does_not_count(db, user_a):
    from app.services.agent_catalog import create_user_agent, count_user_created
    a = await create_user_agent(db, user_id=user_a.id, name="tmp", system_prompt="x", tools_json=[])
    a.is_deleted = True
    await db.flush()
    assert await count_user_created(db, user_a.id) == 0
```

- [ ] **Step 2: Implement**

```python
class AgentQuotaExceeded(Exception):
    pass

MAX_USER_CREATED = 5

async def count_user_created(db, user_id: int) -> int:
    from sqlalchemy import select, func
    from app.models.agent import AgentDefinition
    q = await db.execute(
        select(func.count()).select_from(AgentDefinition).where(
            AgentDefinition.owner_user_id == user_id,
            AgentDefinition.kind == "user_created",
            AgentDefinition.is_deleted.is_(False),
        )
    )
    return int(q.scalar_one())

async def create_user_agent(db, *, user_id, name, system_prompt, tools_json, company_id=None):
    if await count_user_created(db, user_id) >= MAX_USER_CREATED:
        raise AgentQuotaExceeded("自创智能体最多 5 个")
    from app.models.agent import AgentDefinition
    row = AgentDefinition(
        owner_user_id=user_id,
        company_id=company_id,
        kind="user_created",
        name=name,
        system_prompt=system_prompt,
        tools_json=tools_json or [],
        is_template=False,
    )
    db.add(row)
    await db.flush()
    return row
```

系统模板 tools：

- executor: `list_my_project_links`, `get_node`, `submit_clarification`, `create_evidence_draft`, `submit_evidence`, `request_review`, `request_correction`, `wiki_search`
- pm: `get_node`, `pm_judge_package`, `pm_write_progress`, `wiki_search`, `send_notify`, `nudge_member`

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(agent): system templates and user-created quota 5"
```

---

### Task 3: Tool Registry + authorize

**Files:**
- Create: `backend/app/services/agent_tools.py`
- Test: `backend/tests/collab/test_agent_tools_auth.py`

**Interfaces:**
- `TOOL_SPECS: dict[str, ToolSpec]` 附录 G 全部 tool_id
- `async def run_tool(ctx: ToolContext, tool_id: str, args: dict) -> dict`
- `ToolContext(user_id, company_id, project_id, agent_kind, channel: web|wechat|worker)`

- [ ] **Step 1: Tests**

```python
@pytest.mark.asyncio
async def test_wechat_channel_blocks_submit_evidence_files(tool_ctx_wechat):
    from app.services.agent_tools import run_tool
    import pytest
    # create_evidence_draft 允许纯文本；submit 若要求 file 则拒绝
    with pytest.raises(PermissionError):
        await run_tool(tool_ctx_wechat, "submit_evidence", {"package_id": 1, "require_files": True})

@pytest.mark.asyncio
async def test_member_cannot_pm_write_progress(tool_ctx_member):
    from app.services.agent_tools import run_tool
    import pytest
    with pytest.raises(PermissionError):
        await run_tool(tool_ctx_member, "pm_write_progress", {
            "node_id": tool_ctx_member.node_id,
            "after": {"template": "work_item", "status": "done", "percent": 100},
            "source": "pm_agent_auto",
        })

@pytest.mark.asyncio
async def test_worker_pm_can_write_progress(tool_ctx_worker_pm, node_with_package):
    from app.services.agent_tools import run_tool
    out = await run_tool(tool_ctx_worker_pm, "pm_write_progress", {
        "node_id": node_with_package.node_id,
        "after": node_with_package.after,
        "source": "pm_agent_auto",
        "package_id": node_with_package.package_id,
    })
    assert out["ok"] is True
    assert "record_id" in out
```

- [ ] **Step 2: Implement handlers 委托现有服务**

```python
# authorize 伪代码
async def authorize(ctx, tool_id, args) -> bool:
    if tool_id in ("pm_judge_package", "pm_write_progress"):
        return ctx.agent_kind == "system_pm" and ctx.channel == "worker"
    if tool_id == "submit_evidence" and ctx.channel == "wechat":
        return False  # 微信不可交材料
    # 其余走 AclService
    ...
```

`pm_write_progress` → `ProgressService.append_and_apply`  
`create_evidence_draft` / `submit_evidence` → evidence service  
`send_notify` → 返回 `{need_confirmation: true}` 除非 `args.confirmed`

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(agent): tool registry with channel and acl authorize"
```

---

### Task 4: FakeLLM + AgentRuntime.chat

**Files:**
- Create: `backend/app/services/llm/base.py`
- Create: `backend/app/services/llm/fake.py`
- Create: `backend/app/services/agent_runtime.py`
- Create: `backend/app/schemas/agent.py`
- Create: `backend/app/api/v1/agents.py`
- Modify: `main.py`
- Test: `backend/tests/collab/test_agent_chat.py`

**Interfaces:**
- `POST /api/v1/agents/chat` 附录 F.5
- `AgentRuntime.chat(user, body) -> ChatResult`
- ChatResult: `session_id, reply, actions[], need_clarification, clarification_questions[]`

- [ ] **Step 1: Tests**

```python
@pytest.mark.asyncio
async def test_chat_clarification_when_vague(async_client, seed, monkeypatch):
    from app.services.llm.fake import FakeLLM
    monkeypatch.setattr(
        "app.services.agent_runtime.get_llm",
        lambda company: FakeLLM(scripted=[
            {"type": "text", "content": "请说明完成了哪几项？", "need_clarification": True,
             "clarification_questions": ["完成了哪些检查项？"]}
        ]),
    )
    r = await async_client.post(
        "/api/v1/agents/chat",
        json={"project_id": seed.project_id, "scene": "progress_update", "message": "弄好了", "node_id": seed.node_id},
        headers=seed.member_headers,
    )
    assert r.json()["code"] == 200
    data = r.json()["data"]
    assert data["need_clarification"] is True
    assert len(data["clarification_questions"]) >= 1

@pytest.mark.asyncio
async def test_chat_tool_call_create_evidence_draft(async_client, seed, monkeypatch):
    from app.services.llm.fake import FakeLLM
    monkeypatch.setattr(
        "app.services.agent_runtime.get_llm",
        lambda company: FakeLLM(scripted=[
            {"type": "tool_call", "tool_id": "create_evidence_draft",
             "args": {"node_id": seed.node_id, "summary": "联调完成", "structured": {"percent": 80}, "links": []}},
            {"type": "text", "content": "已为你创建材料草稿，请上传附件后提交。"},
        ]),
    )
    r = await async_client.post(
        "/api/v1/agents/chat",
        json={"project_id": seed.project_id, "scene": "progress_update", "message": "登录改版接口联调完成", "node_id": seed.node_id},
        headers=seed.member_headers,
    )
    data = r.json()["data"]
    assert data["reply"]
    assert any(a.get("tool_id") == "create_evidence_draft" for a in data.get("actions", []))
```

- [ ] **Step 2: Runtime 循环（最多 N=5 轮 tool）**

```python
async def chat(...):
    session = await get_or_create_session(...)
    await save_message(session, "user", message)
    agent = await resolve_agent(user, scene, project_id)
    persona = "project_avatar" if project_id else "body"
    messages = await load_history(session)
    llm = get_llm(company)
    actions = []
    for _ in range(5):
        out = await llm.complete(system=agent.system_prompt + context_block, messages=messages, tools=agent.tools_json)
        if out.type == "tool_call":
            ok = await authorize(...)
            result = await run_tool(...) if ok else {"error": "unauthorized"}
            actions.append({"tool_id": out.tool_id, "authorized": ok, "result": result})
            await save_tool_call(...)
            messages.append(tool_result_msg)
            continue
        await save_message(session, "assistant", out.content)
        return ChatResult(session_id=session.id, reply=out.content, actions=actions,
                          need_clarification=out.need_clarification, clarification_questions=out.clarification_questions or [])
```

- [ ] **Step 3: CRUD API**

```
POST /api/v1/agents  body {name, system_prompt, tools_json, scene_default?}
GET  /api/v1/agents
DELETE /api/v1/agents/{id}  soft delete
POST /api/v1/agents/{id}/export-template
POST /api/v1/agents/import-template {template_id}
POST /api/v1/agents/bindings {scene, agent_definition_id, project_id?}
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(agent): runtime chat API with fake LLM and tools"
```

---

### Task 5: LLM Evidence Judge 适配器

**Files:**
- Create: `backend/app/services/evidence_judge_llm.py`
- Modify: evidence worker 选择 Judge 实现
- Test: `backend/tests/collab/test_llm_judge.py`

**Interfaces:**
- `class LlmEvidenceJudge: async def judge(input: JudgeInput) -> JudgeOutput` 形状附录 F.6
- 解析失败 → reject + reason「判定输出无法解析」；不写进度

- [ ] **Step 1: Test parse + adopt path**

```python
@pytest.mark.asyncio
async def test_llm_judge_parses_f6_output(monkeypatch):
    from app.services.evidence_judge_llm import LlmEvidenceJudge
    from app.services.llm.fake import FakeLLM
    j = LlmEvidenceJudge(FakeLLM(scripted=[{
        "type": "text",
        "content": json.dumps({
            "decision": "adopted",
            "reason": "含 PR",
            "progress_after": {"template": "work_item", "status": "done", "percent": 100, "checklist": []},
            "wiki_draft": {"title": "t", "body": "b"},
            "confidence": 0.9,
        }),
    }]))
    out = await j.judge(sample_input)
    assert out.decision == "adopted"
    assert out.progress_after["status"] == "done"
```

- [ ] **Step 2: Wire worker** `JUDGE_BACKEND=rule|llm` env  
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(agent): LLM evidence judge adapter with F6 schema"
```

---

### Task 6: 项目分身上下文 + 私人 wiki 钩子

**Files:**
- Modify: `agent_runtime.py`
- Create: `backend/app/models/wiki.py`（若证据计划未建 project_wiki）
- Test: `test_agent_chat.py` 追加

- [ ] **Step 1: project_id 非空时 persona_mode=project_avatar，system 附加项目名/角色/节点摘要**  
- [ ] **Step 2: wiki_search tool 只读 project_wiki + 策略**  
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(agent): project avatar context and wiki_search tool"
```

---

### Task 7: 集成与回归

- [ ] **Step 1: Run**

```
cd backend
pytest tests/collab/test_agent_models.py tests/collab/test_agent_quota.py tests/collab/test_agent_tools_auth.py tests/collab/test_agent_chat.py tests/collab/test_llm_judge.py -v
```

Expected: PASS

- [ ] **Step 2: 确认微信 channel 单测覆盖不可交材料**  
- [ ] **Step 3: 确认 progress 仅 ProgressService 路径**

---

## Spec Coverage

| 需求 | Task |
|------|------|
| harness + tools G | 3–4 |
| 本体/分身 | 1, 4, 6 |
| 自创 ≤5 | 2 |
| 倒逼写清楚 | 4 FakeLLM 澄清 |
| PM 判材料 LLM | 5 |
| 导出/导入模板 | 4 |
| 微信不交材料 | 3 |

**Handoff:** org-sso-wechat 可并行 UI；判材料 E2E 用 FakeLLM 接脊梁 worker。
