# Dev Task Board — 派工板（可直接领 Task）

> **入口**：先读 [`2026-07-19-DEVELOPER-START-HERE.md`](./2026-07-19-DEVELOPER-START-HERE.md)  
> **契约**：[`2026-07-19-api-contracts-v1.md`](./2026-07-19-api-contracts-v1.md)  
> **工程**：[`2026-07-19-dev-handoff-patch.md`](./2026-07-19-dev-handoff-patch.md)  
> **状态列**：`TODO` | `DOING` | `REVIEW` | `DONE`（派工时在 PR/看板改）

**估算说明**：人日按中级熟悉 FastAPI/Vue 估，含单测；联调另计。可 ±40%。

---

## 依赖总图

```
P0-BE-01 tenant models/api
    ↓
P0-BE-02 tree+acl
    ↓
P0-BE-03 evidence spine
    ↓
P0-BE-04 tasks compat + import
    ↓
P0-FE-01 web project UI
    │
    ├─→ P1-BE-05 agent
    ├─→ P1-BE-06 notify/asr/storage
    ├─→ P1-BE-07 org/wx
    └─→ P1-FE-02 agent UI + miniprogram
         ↓
P2-* production integrations
```

---

## P0 — 可演示主链路（必须先绿）

### P0-BE-01 租户 · 权益 · 策略

| 字段 | 内容 |
|------|------|
| **Owner** | BE-A |
| **计划** | `2026-07-19-tenant-entitlement-policy.md` |
| **契约** | contracts §1 |
| **handoff** | §1 OrgLeader 列、§3 错误码、§10 settings |
| **交付** | companies CRUD/license、memberships、`is_org_leader`、EntitlementService、PolicyGuard、deps_collab |
| **测试** | `pytest tests/collab/test_tenant*.py tests/collab/test_license*.py tests/collab/test_entitlement*.py` |
| **DoD** | C- 相关；未 license 时 projects 40310/40312；bootstrap 脚本可用 |
| **估时** | 3–4 人日 |
| **依赖** | 无 |
| **状态** | TODO |

**子任务勾选**

- [ ] P0-BE-01.1 Company/License/Membership/ServiceActivation 模型 + `is_org_leader`
- [ ] P0-BE-01.2 policy_presets + license_verify hmac
- [ ] P0-BE-01.3 EntitlementService + PolicyGuard 单测
- [ ] P0-BE-01.4 API §1.1–1.8 + fail() 信封
- [ ] P0-BE-01.5 bootstrap_single_company

---

### P0-BE-02 项目树 · ACL

| 字段 | 内容 |
|------|------|
| **Owner** | BE-B |
| **计划** | `2026-07-19-project-tree-acl.md` |
| **契约** | contracts §2–3 |
| **handoff** | §1 开空项目权限 |
| **交付** | projects/members/invitations、node_types、tree path/move、AclService、assignees |
| **测试** | `pytest tests/collab/test_project*.py tests/collab/test_tree*.py tests/collab/test_acl*.py` |
| **DoD** | C-01、C-09；seed fixture 输出 handoff §6 形状 |
| **估时** | 5–6 人日 |
| **依赖** | P0-BE-01 |
| **状态** | TODO |

**子任务勾选**

- [ ] P0-BE-02.1 Project/Member/Invitation 模型
- [ ] P0-BE-02.2 NodeType/TreeNode/Assignment + default_progress_json
- [ ] P0-BE-02.3 AclService（含 is_org_leader）
- [ ] P0-BE-02.4 Projects API §2.*
- [ ] P0-BE-02.5 TreeService path/move + Nodes API §3.*
- [ ] P0-BE-02.6 `tests/collab/conftest.py` seed_ids

---

### P0-BE-03 材料 · 进度账本 · 审计 · 复核（脊梁）

| 字段 | 内容 |
|------|------|
| **Owner** | BE-C |
| **计划** | `2026-07-19-evidence-progress-audit.md` |
| **契约** | contracts §4–5、§6 wiki 自动、§18 Judge、§16 audit |
| **handoff** | §2 async_jobs、§4 append_progress、§5 channel、§8 wiki P0 |
| **交付** | evidence 提交/不可变、RuleBasedJudge、job、progress 账本、adoption、review 四件事、频控 audit、wiki 自动写 |
| **测试** | `pytest tests/collab/test_evidence*.py tests/collab/test_progress*.py` + E2E-01～03 |
| **DoD** | C-02～C-05、C-10 无关；附录 E2E-01 规则版绿 |
| **估时** | 6–8 人日 |
| **依赖** | P0-BE-02（或最小 fixture） |
| **状态** | TODO |

**子任务勾选**

- [ ] P0-BE-03.1 Evidence/Progress/Audit/Review/Wiki/AsyncJob 模型
- [ ] P0-BE-03.2 `append_progress` + 禁止他途写 progress_json
- [ ] P0-BE-03.3 RuleBasedEvidenceJudge
- [ ] P0-BE-03.4 files + submit API + wechat 40320
- [ ] P0-BE-03.5 judge pipeline + adoption + wiki + audit
- [ ] P0-BE-03.6 二次上传 + 频控告警 audit
- [ ] P0-BE-03.7 review-request/supplement/confirm
- [ ] P0-BE-03.8 smoke script
- [ ] P0-BE-03.9 Wiki 手写 CRUD §6.3–6.4

---

### P0-BE-04 个人兼容 · 导入

| 字段 | 内容 |
|------|------|
| **Owner** | BE-D |
| **计划** | `2026-07-19-personal-compat-migration.md` |
| **契约** | contracts §15 |
| **handoff** | §7 token store |
| **交付** | tasks 五列、投影只读、preview/import API、migrate 脚本 |
| **测试** | `pytest tests/collab/test_task_compat.py tests/collab/test_import*.py` + `tests/test_tasks.py` |
| **DoD** | C-08、C-10；旧 tasks 回归绿 |
| **估时** | 2–3 人日 |
| **依赖** | P0-BE-02（import 需树）；列可与 BE-01 并行 |
| **状态** | TODO |

**子任务勾选**

- [ ] P0-BE-04.1 Task 列 + schema 响应
- [ ] P0-BE-04.2 linked_readonly 改 status 40321
- [ ] P0-BE-04.3 ImportTokenStore + preview/import
- [ ] P0-BE-04.4 migrate_collab_k / ALTER 脚本
- [ ] P0-BE-04.5 回归 test_tasks

---

### P0-FE-01 Web 项目 · 树 · 材料

| 字段 | 内容 |
|------|------|
| **Owner** | FE-A |
| **计划** | `2026-07-19-web-miniprogram-ui.md` Task1–5,7 基础 |
| **契约** | §2–5、§6 只读列表 |
| **交付** | types/api、路由侧栏、项目列表/详情、树、材料弹窗、进度时间线、公司设置只读/超管 |
| **测试** | `npm run build`；手工 E2E-01 点点 |
| **DoD** | 可用 Web 走通：开项目→建节点→传材料→看进度（后端 P0-BE-03 可用或 mock） |
| **估时** | 5–7 人日 |
| **依赖** | 契约可先行 mock；联调依赖 P0-BE-02/03 |
| **状态** | TODO |

**子任务勾选**

- [ ] P0-FE-01.1 `types/collab.ts` + api clients（严格按 contracts）
- [ ] P0-FE-01.2 路由 + Sidebar「项目」
- [ ] P0-FE-01.3 ProjectList + Create
- [ ] P0-FE-01.4 TreePanel + NodeDetail
- [ ] P0-FE-01.5 EvidenceSubmit + ProgressTimeline
- [ ] P0-FE-01.6 CompanySettings 基础（策略展示）

---

### P0 出口标准（整体）

- [ ] `pytest tests/collab -v` 全绿  
- [ ] `pytest tests/test_tasks.py tests/test_auth.py` 绿  
- [ ] 契约 C-01～C-05、C-08～C-10 有自动化  
- [ ] 手工：License 解锁 → OrgLeader 开空项目 → PM 建树 → 成员交材料 → 规则判定 → 进度时间线可见  
- [ ] 微信头上传文件 40320  

---

## P1 — 智能体 · 通道 · 集成

### P1-BE-05 Agent Runtime

| 字段 | 内容 |
|------|------|
| **Owner** | BE-E |
| **计划** | `agent-runtime.md` |
| **契约** | §7、§17、§18 LLM |
| **DoD** | chat 澄清；工具鉴权；≤5；JUDGE_BACKEND=llm 可切换；wechat 禁 submit_evidence |
| **估时** | 6–8 人日 |
| **依赖** | P0-BE-03 |
| **状态** | TODO |

- [ ] 模型 + 配额 5  
- [ ] tools + authorize  
- [ ] FakeLLM runtime + API  
- [ ] LlmEvidenceJudge  
- [ ] 分身上下文  

---

### P1-BE-06 ASR · Storage · Notify

| 字段 | 内容 |
|------|------|
| **Owner** | BE-F |
| **计划** | `asr-storage-notify.md` |
| **契约** | §11–12 |
| **DoD** | 本地存储接 evidence；三通道 enqueue；频控告警通知 PM；bindings API |
| **估时** | 4–5 人日 |
| **依赖** | P0-BE-01 policy；接 P0-BE-03 hooks |
| **状态** | TODO |

---

### P1-BE-07 Org · SSO 开关 · 微信协作 · 收权

| 字段 | 内容 |
|------|------|
| **Owner** | BE-G |
| **计划** | `org-sso-wechat.md` |
| **契约** | §8–10 |
| **DoD** | generic sync + E2E-04；login-methods；wx collab chat；SSO start 403 未启用 |
| **估时** | 5–6 人日 |
| **依赖** | P0-BE-01/02；chat 依赖 P1-BE-05（可先 echo 桩） |
| **状态** | TODO |

---

### P1-BE-08 Delegations · Report 最小

| 字段 | 内容 |
|------|------|
| **Owner** | BE-B/C |
| **契约** | §13–14 |
| **DoD** | delegation ACL 生效；manual report run |
| **估时** | 3 人日 |
| **依赖** | P0-BE-02、P1-BE-06 |
| **状态** | TODO |

---

### P1-FE-02 对话台 · 小程序

| 字段 | 内容 |
|------|------|
| **Owner** | FE-B |
| **计划** | web-miniprogram-ui Task6–8 |
| **DoD** | Web AgentChatDrawer；小程序项目树/chat/evidence-submit；无 wechat 上传入口 |
| **估时** | 6–8 人日 |
| **依赖** | P1-BE-05；P0-FE-01 |
| **状态** | TODO |

---

### P1 出口标准

- [ ] E2E-01 在 `JUDGE_BACKEND=llm`+FakeLLM 绿  
- [ ] E2E-04 离职收权绿  
- [ ] 微信 chat 可更新说明，不可传材料  
- [ ] 通知至少 in_app + email 桩成功  

---

## P2 — 生产硬化

| ID | 内容 | 估时 | 状态 |
|----|------|------|------|
| P2-01 | License ed25519 + 密钥轮转文档 | 2d | DONE（hmac 保留；runbook §2） |
| P2-02 | 真 WeCom/钉钉/飞书 sync + OIDC | 8–15d | TODO（非生产候选硬门禁） |
| P2-03 | Redis queue（可选）替换进程内 job，契约不变 | 3d | TODO（非目标） |
| P2-04 | Alembic 全量迁移链 | 2d | DONE（a1b2c3d4e5f6） |
| P2-05 | Wiki 向量检索 + personal wiki | 5d | TODO |
| P2-06 | 汇报 cron/模板全量 | 3d | TODO |
| P2-07 | 会议扩展点（仅接口桩） | 1d | TODO |
| P2-08 | 压测进度账本 + 频控 | 2d | TODO |
| P2-09 | 安全：凭证加密审计、渗透清单 | 3d | TODO |

---

## 联调里程碑

| 里程碑 | 日期（填） | 标准 |
|--------|------------|------|
| M0 文档冻结 | 2026-07-19 | START-HERE + contracts + handoff + board |
| M1 P0 后端 | | collab pytest 绿 + smoke |
| M2 P0 全栈演示 | | Web 主链路 |
| M3 P1 智能体演示 | | chat + 判定 |
| M4 P1 双端 | | 小程序 + 微信通道 |
| M5 P2 生产候选 | 2026-07-19 | License ed25519 + Alembic head + 运维 runbook（SSO 深度非门禁） |

---

## 每日站会三问（建议）

1. 我领的 Task ID？阻塞在契约哪一节？  
2. 是否动了 `append_progress` / 信封 / channel？需要 docs PR 吗？  
3. 今天能否补一条 C-xx 契约测试？

---

## 签收

| 角色 | 姓名 | 日期 | 签字 |
|------|------|------|------|
| Tech Lead | | | |
| BE-A | | | |
| BE-B | | | |
| BE-C | | | |
| FE-A | | | |

**Lead 确认后即可按 P0-BE-01 开第一个 PR。**
