# Team Collaboration Full Stack — Umbrella Implementation Plan

> **For agentic workers:** 本文件是**伞计划**（子系统拆分与依赖顺序）。执行具体代码时请打开对应子计划，并使用 superpowers:subagent-driven-development 或 executing-plans。  
> **开发人员入口：** [`2026-07-19-DEVELOPER-START-HERE.md`](./2026-07-19-DEVELOPER-START-HERE.md)  
> **Spec:** `docs/团队协作与智能体-最终实现方案.md`  
> **表/状态机：** `docs/团队协作与智能体-最终实现方案-附录-可实施规格.md`  
> **HTTP/DTO 真源：** [`2026-07-19-api-contracts-v1.md`](./2026-07-19-api-contracts-v1.md)  
> **工程拍板：** [`2026-07-19-dev-handoff-patch.md`](./2026-07-19-dev-handoff-patch.md)  
> **派工板：** [`2026-07-19-dev-task-board.md`](./2026-07-19-dev-task-board.md)

**Goal:** 在现有 WorkTodo 个人底盘上，全量交付项目管理树、证据化正式进度、多智能体、组织对接、双交付模式与策略引擎。

**Architecture:** 个人 `tasks` 保留；公司租户 + 项目隔离；正式进度仅写入 `progress_records` 追加账本；Agent = LLM + harness（工具鉴权 + 策略守卫）；通知/ASR/存储可插拔。

**Tech Stack:** FastAPI · SQLAlchemy async · PostgreSQL（生产）/ SQLite（开发）· **P0/P1：APScheduler + 表 async_jobs（不强制 Redis）** · Vue3 · 微信小程序 · 可插拔 LLM/ASR

## Global Constraints

- 语言：简体中文；时区：国内常见（中国为主）
- API 信封：`{code,message,data}`；业务失败 code≠200 或 HTTP 4xx（错误码见 handoff §3.3）
- 正式进度禁止只改个人 `tasks.status` 冒充；唯一写入口 `append_progress`
- 公司隔离、项目隔离；材料/进度当事人不可私自删改
- 自创智能体 ≤5；通用不占名额
- 微信可聊可更新，不可交材料（`X-Client-Channel: wechat` → 40320）
- 全量产品范围，不做 MVP 裁剪（工程按 P0/P1/P2 波次交付，见 task-board）
- 真源目录仅 `backend/` `frontend/` `miniprogram/`

---

## Subsystem Plans（执行入口）

| 顺序 | Plan | 可独立验证的交付物 |
|------|------|-------------------|
| — | **DEVELOPER-START-HERE / contracts / handoff / task-board** | 开发可开工包 |
| 0 | 本伞文件 | 依赖图与接口边界 |
| 1 | `2026-07-19-tenant-entitlement-policy.md` | Company / License / policy / entitlement 中间件 |
| 2 | `2026-07-19-project-tree-acl.md` | 空项目、树 CRUD、成员、path ACL |
| 3 | **`2026-07-19-evidence-progress-audit.md`（脊梁，优先）** | 材料提交→判→进度账本→审计 |
| 4 | `2026-07-19-agent-runtime.md` | 对话、工具、分身、判材料 worker 接 LLM |
| 5 | `2026-07-19-org-sso-wechat.md` | 组织同步、SSO、企微/小程序通道 |
| 6 | `2026-07-19-asr-storage-notify.md` | ASR 路由、存储路由、三通道通知 |
| 7 | `2026-07-19-web-miniprogram-ui.md` | Web 树/材料/对话台；小程序分场景 |
| 8 | `2026-07-19-personal-compat-migration.md` | tasks 兼容列、导入工具、升级 runbook |

---

## Dependency Graph

```
[1 tenant] ─────────────────────────────────────────────┐
    │                                                     │
    ▼                                                     ▼
[2 project-tree-acl] ──► [3 evidence-progress-audit] ──► [4 agent-runtime]
    │                            │                            │
    │                            └──────────► [6 notify 部分] │
    ▼                                                         ▼
[5 org-sso-wechat] ◄──────────── 可与 3 后半并行 ──────── [7 UI]
    │
    ▼
[8 migration]（尽早做 tasks 列，完整导入工具可在 3 之后）
```

**集成脊梁测试（全系统）：** 附录 L 节 E2E-01～04。

---

## Cross-Cutting File Map（新建包一览）

```
backend/app/
  models/company.py, org.py, project.py, tree.py, evidence.py,
         progress.py, wiki.py, agent.py, entitlement.py, audit.py, ...
  api/v1/companies.py, projects.py, trees.py, evidence.py, progress.py,
         agents.py, org.py, review.py, ...
  services/entitlement.py, policy_guard.py, progress_service.py,
         evidence_judge.py, agent_runtime.py, acl.py, ...
  workers/evidence_judge_worker.py, org_sync_worker.py, ...
frontend/src/
  views/project/*, components/tree/*, agents/*, evidence/*
  api/projects.ts, evidence.ts, agents.ts, ...
miniprogram/pages/
  project-*, agent-chat, evidence-submit
```

---

## Definition of Done（伞级）

- [ ] 附录验收清单 20 条均有自动化或书面手工用例结果  
- [ ] `项目逻辑文档.md` 与实现一致  
- [ ] 单公司 License 与 saas 开通路径可演示  
- [ ] 主链路 E2E-01 绿  

---

## Execution Note

**不要**在本伞文件里直接写业务代码步骤。  

1. 人类开发：打开 **DEVELOPER-START-HERE** → **task-board** 领 `P0-BE-01` 起。  
2. Agent 执行：打开子计划 + **api-contracts-v1** 对应节，用 subagent-driven-development。  
3. 单线顺序：1 tenant → 2 tree → 3 evidence → 4 agent；UI 在 2/3 后半并行。
