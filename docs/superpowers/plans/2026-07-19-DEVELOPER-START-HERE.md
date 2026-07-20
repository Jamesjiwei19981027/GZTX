# 开发人员从这里开始（团队协作全量）

> **日期**：2026-07-19  
> **用途**：把本包直接丢给开发时的**唯一入口**。先读本文 15 分钟，再按角色打开子文档。  
> **产品范围**：全量（非 MVP 裁剪）。**工程交付**：分 P0 / P1 / P2 波次，范围不砍，波次可并行。

---

## 1. 你要交付什么（一句话）

在现有 WorkTodo 个人待办底盘上**加层**：公司租户、一项目一树、证据化正式进度账本、多智能体、组织对接、双交付（License / SaaS）、策略引擎；**禁止**用个人 `tasks.status` 冒充项目正式进度。

---

## 2. 必读文档（按顺序）

| 顺序 | 文档 | 谁必读 | 作用 |
|------|------|--------|------|
| 0 | **本文** | 全员 | 入口、波次、禁区 |
| 1 | [`docs/团队协作与智能体-最终实现方案.md`](../../团队协作与智能体-最终实现方案.md) | 全员扫、Lead 精读 | 产品锁定原则 |
| 2 | [`docs/团队协作与智能体-最终实现方案-附录-可实施规格.md`](../../团队协作与智能体-最终实现方案-附录-可实施规格.md) | 后端全员 | 枚举/表/状态机/ACL |
| 3 | **[`2026-07-19-api-contracts-v1.md`](./2026-07-19-api-contracts-v1.md)** | 前后端全员 | **接口/DTO/错误码 v1（以本文为 HTTP 真源）** |
| 4 | **[`2026-07-19-dev-handoff-patch.md`](./2026-07-19-dev-handoff-patch.md)** | 后端全员 | 工程拍板（OrgLeader/Job/信封/测试床） |
| 5 | **[`2026-07-19-dev-task-board.md`](./2026-07-19-dev-task-board.md)** | Lead / 每人领任务 | Epic→任务→DoD→依赖 |
| 6 | [`2026-07-19-team-collab-umbrella.md`](./2026-07-19-team-collab-umbrella.md) | Lead | 子系统依赖图 |
| 7 | 对应子系统 `2026-07-19-*.md` 计划 | 领到任务的人 | TDD 步骤与文件路径 |

**冲突裁决顺序（写进 PR 描述）：**

1. 主方案「已锁定原则」  
2. **api-contracts-v1**（HTTP / DTO）  
3. 附录可实施规格（表 / 状态机 / 枚举）  
4. dev-handoff-patch（工程实现选择）  
5. 子系统实现计划（步骤与文件）  
6. 代码现状  

---

## 3. 真源代码目录（禁止第二套）

| 目录 | 说明 |
|------|------|
| `backend/` | FastAPI |
| `frontend/` | Vue3 Web |
| `miniprogram/` | 微信小程序 |
| `docs/` | 仅文档，**不**放可运行前后端 |

启动：

```bash
# 后端
cd backend && uvicorn app.main:app --reload

# 前端
cd frontend && npm run dev
```

---

## 4. 工程波次（派工用）

| 波次 | 目标 | 子系统计划 | 验收锚点 |
|------|------|------------|----------|
| **P0** | 可演示主链路 | tenant → project-tree-acl → evidence-progress-audit → personal-compat 列 → Web 树/材料 | 附录 E2E-01～03 + 契约冒烟 |
| **P1** | 智能体 + 通道 + 通知存储 | agent-runtime、asr-storage-notify、org-sso-wechat（同步/收权）、Web 对话/设置、小程序 | E2E-01 换 LLM Judge；微信不交材料；E2E-04 |
| **P2** | 生产级集成与深度能力 | 真 SSO/企微、生产 License 非对称验签、汇报全量、delegation、wiki 深度检索、会议扩展点 | 主方案第十四节余项 |

**P0 未绿之前，不要合并破坏 `/api/v1/tasks` 个人路径的改动。**

---

## 5. 铁律（Code Review 必查）

1. 正式进度**只**能经 `ProgressService.append_progress`（见 handoff）写入 `progress_records` + 更新 `tree_nodes.progress_json`。  
2. `progress_records` **禁止** UPDATE/DELETE。  
3. `EvidencePackage` 一旦 `submitted`，提交人不可改 summary/files。  
4. 微信通道 / `X-Client-Channel: wechat` **禁止** `POST /evidence/files`。  
5. 自创智能体 `user_created` 且未删 **≤ 5**。  
6. `employment_status != active` 或 membership 非 active → 项目写操作 403。  
7. 所有新业务 API 走统一信封与错误码（contracts + handoff）。  
8. 中文 `message`；时间 API 用 ISO8601；库内 UTC。

---

## 6. 建议角色分工

| 角色 | P0 主责 | 入口计划 |
|------|---------|----------|
| BE-A 平台 | 租户/权益/策略/deps | `tenant-entitlement-policy` |
| BE-B 项目 | 项目/树/ACL | `project-tree-acl` |
| BE-C 脊梁 | 材料/进度/审计/复核 | `evidence-progress-audit` |
| BE-D 兼容 | tasks 列/导入 | `personal-compat-migration` |
| FE-A | 项目列表/树/材料/时间线 | `web-miniprogram-ui` Task1–5 |
| FE-B / 小程序 | P1 对话与小程序 | 同 UI 计划 Task6–8 |
| BE-E | P1 Agent | `agent-runtime` |
| BE-F | P1 通知/ASR/存储 | `asr-storage-notify` |
| BE-G | P1 组织/微信通道 | `org-sso-wechat` |

一人全栈时：严格按 BE-A → B → C → D → FE-A 顺序。

---

## 7. 本地验收最小命令

```bash
cd backend
pytest tests/collab -v
# 个人底盘回归
pytest tests/test_tasks.py tests/test_auth.py -v

cd ../frontend
npm run build
```

契约冒烟（实现后）：`backend/scripts/e2e_collab_smoke.py`（脊梁计划 Task8）。

---

## 8. 领任务检查清单（开发开干前自检）

- [ ] 读过主方案 §二 锁定原则  
- [ ] 收藏 **api-contracts-v1** 对应章节  
- [ ] 读过 **dev-handoff-patch** 全文  
- [ ] 在 **dev-task-board** 认领 Task ID  
- [ ] 打开对应 `2026-07-19-*.md` 子系统计划  
- [ ] 分支命名：`feat/collab-p0-<topic>`  
- [ ] PR 描述含：契约章节链接 + 测试命令 + 波次  

---

## 9. 文档包清单

```
docs/superpowers/plans/
  2026-07-19-DEVELOPER-START-HERE.md     ← 你在这里
  2026-07-19-dev-handoff-patch.md        ← 工程拍板
  2026-07-19-api-contracts-v1.md         ← 接口真源
  2026-07-19-dev-task-board.md           ← 派工板
  2026-07-19-team-collab-umbrella.md
  2026-07-19-tenant-entitlement-policy.md
  2026-07-19-project-tree-acl.md
  2026-07-19-evidence-progress-audit.md
  2026-07-19-agent-runtime.md
  2026-07-19-org-sso-wechat.md
  2026-07-19-asr-storage-notify.md
  2026-07-19-web-miniprogram-ui.md
  2026-07-19-personal-compat-migration.md
docs/
  团队协作与智能体-最终实现方案.md
  团队协作与智能体-最终实现方案-附录-可实施规格.md
  项目逻辑文档.md
```

**可以开始开发了。** 接口与工程歧义以 **api-contracts-v1** + **dev-handoff-patch** 为准；发现冲突先提 PR 改文档再改代码。
