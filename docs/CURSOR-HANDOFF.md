# WorkTodo（工作待办提醒系统）— Cursor 接手说明

> **用途**：把本文件 + 下列「必读文档」交给 Cursor（或新会话）即可接手。  
> **仓库**：`E:\workspace\gongzuotix`（或你的 clone 路径）  
> **整理日期**：2026-07-20  
> **当前开发分支**：见根目录 [README.md](../README.md)「分支与维护」— 长期为 `main`（后端/部署）、`web`、`miniprogram`、`app`；历史分支 `frontend-react-rewrite` 可弃用。

---

## 0. 分支约定（2026-07 起）

四条长期分支：**`main`**（后端与部署真源）、**`web`**、**`miniprogram`**、**`app`**（Flutter）。接口变更只合 `main`；各端 PR 主要改对应目录。详见根 [README.md](../README.md)。

---

## 1. 一句话产品是什么

**WorkTodo** 是一套**可自托管**的待办 + 提醒系统，并在同一产品里扩展了：

- **个人待办**（任务、日历、邮件/WebPush 提醒）
- **单公司协作**：项目管理树、证据驱动进度、智能体对话
- **双端**：Web + 微信小程序（数据同源 API）

内测形态偏 **单公司 + 密码注册/加入**（`DEPLOY_MODE=single_company` 一类配置），企微/OIDC 等可后续接。

---

## 2. 架构与真源目录

| 路径 | 角色 | 说明 |
|------|------|------|
| `backend/` | **后端真源** | FastAPI + SQLAlchemy(async) + APScheduler |
| `frontend/` | **Web 现役真源** | **React 18** + Vite + TS + Ant Design + Tailwind + Zustand + React Flow |
| `frontend-vue-archive/` | **只读归档** | 原 Vue3 整站；对照行为与紧急回滚；**不是**现役入口 |
| `miniprogram/` | 小程序真源 | 微信原生；协作页有部分实现 |
| `app/` | Flutter APP 真源 | iOS + Android；见 `app/README.md` |
| `docs/` | 设计/规格/计划 | 见 §5 |
| `UI/` | 设计稿 | 非运行代码 |
| `docker-compose.yml` / `docker-compose.prod.yml` | 部署 | 前后端镜像编排 |
| `nginx/` | 生产反代配置 | SPA + API |

**禁止**：在 `docs/` 里维护第二套可运行前后端。  
**入口文档**：根目录 `CLAUDE.md`（或 `Claude.md`）与 `docs/项目逻辑文档.md`。

---

## 3. 技术栈速查

### 后端

- FastAPI、SQLAlchemy 2 async、SQLite（开发）/ PostgreSQL（生产可选）
- JWT 鉴权；`localStorage.access_token` 对应 Bearer
- 业务：任务/提醒/分类标签、邮件收发与命令、Web Push
- 协作：companies / projects / tree_nodes / evidence / progress / agents / ACL / bindings / org / notify worker
- LLM：`app/services/llm_settings.py` — **个人 > 公司 > 环境变量 > fake**
- SMTP：个人（`notify_pref.channels.email`）+ 公司（IntegrationAccount 加密）
- 测试：`backend/tests/` + `backend/tests/collab/`

### Web 前端（React，现役）

- React 18、Vite 5、TypeScript、React Router、Zustand、axios、Ant Design 5、Tailwind、dayjs
- 项目图：`@xyflow/react` + `@dagrejs/dagre`
- 路径别名：`@/` → `src/`
- 单测：Vitest（`npm test`）
- E2E：Playwright（`npm run test:e2e`，需后端 + `E2E_USER` / `E2E_PASSWORD`）

### 归档 Vue

- tag：`vue-frontend-last`
- 用途：行为对照、G6 回滚路径；**不要在 archive 上继续做产品功能**

### 小程序

- 原生框架；`miniprogram/utils/api-collab.js` 等协作 API

---

## 4. 本地启动

### 后端

```bash
cd backend
# 建议使用可用的 Python 3.12 + 依赖（仓库内 venv 可能指向失效路径，必要时重建 venv）
pip install -r requirements.txt
# 配置见 backend/.env 或 .env.example
uvicorn app.main:app --reload
# 默认 http://127.0.0.1:8000
# OpenAPI: /docs
```

### 前端

```bash
cd frontend
npm install   # 或 npm ci
npm run dev   # Vite，常代理 /api → :8000（见 vite.config.ts）
```

### 常用脚本

```bash
cd frontend
npm run build
npm test
npm run typecheck
# E2E（PowerShell 示例）
$env:E2E_USER="demo"
$env:E2E_PASSWORD="..."
$env:PLAYWRIGHT_BASE_URL="http://127.0.0.1:5173"
npm run test:e2e
```

### Docker

```bash
docker compose -f docker-compose.yml up -d
# 生产前端镜像（需 Docker 引擎可用）
docker compose -f docker-compose.prod.yml build frontend
```

---

## 5. 必读文档（按优先级）

| 优先级 | 路径 | 内容 |
|--------|------|------|
| P0 | `CLAUDE.md` | 真源、启动、栈、页面范围 |
| P0 | `docs/项目逻辑文档.md` | 产品逻辑、UI 现状 |
| P0 | **本文** `docs/CURSOR-HANDOFF.md` | 接手状态与禁忌 |
| P1 | `docs/superpowers/specs/2026-07-20-frontend-react-rewrite-design.md` | React 重写规格（**高+ 上线门槛**） |
| P1 | `docs/superpowers/plans/2026-07-20-frontend-react-rewrite.md` | 实现计划 Task 0–13 |
| P1 | `docs/superpowers/acceptance/2026-07-20-react-rewrite-gates.md` | 门禁勾选表（生产切流用） |
| P1 | `.superpowers/sdd/progress.md` | SDD 任务完成账本（若存在） |
| P2 | `docs/团队协作与智能体-最终实现方案.md` + 附录 | 协作域模型 |
| P2 | `docs/superpowers/plans/2026-07-19-api-contracts-v1.md` | HTTP 契约（勿自创路径） |
| P2 | `docs/06-部署运维指南.md` / `07-collab-production-runbook.md` | 部署 |
| P3 | `docs/01`–`05` | 早期设计，可能滞后，以代码为准 |

---

## 6. 业务域地图（后端）

```
个人域
  users / tasks / reminders / categories / tags / attachments
  notifications (SMTP 个人、WebPush、email-status、llm-config 个人)

协作域
  companies（成员、SMTP、LLM、登录方式、License/策略）
  projects + tree nodes（嵌套树、ACL）
  evidence + progress（材料判定、正式进度）
  agents（会话、工具、LLM chat）
  org / sso / bindings（ASR/存储策略）
  notify worker（异步通知）
```

**LLM 解析顺序**（`llm_settings.resolve_llm`）：用户 `notify_pref.channels.llm` → 公司 IntegrationAccount → env → Fake。

**SMTP 解析**：个人配置优先于公司/全局（具体见 `notify` / `smtp_settings` 服务）。

API 前缀一般为：`/api/v1/...`。响应信封常见：`{ code, data, message }`（以 `frontend/src/api/request.ts` 与后端 `ResponseData` 为准）。

---

## 7. Web 路由与页面（React）

| 路径 | 页面文件 | 说明 |
|------|----------|------|
| `/login` `/register` | `pages/LoginPage.tsx` | 注册可能含 company_join 提示 |
| `/dashboard` | `DashboardPage.tsx` | |
| `/tasks` `/tasks/new` `/tasks/:id` | Task* | 列表/新建/详情 |
| `/calendar` | `CalendarPage.tsx` | 月历为主（较 Vue 归档简化） |
| `/settings` | `SettingsPage.tsx` | 资料、主题、个人 SMTP/LLM |
| `/projects` `/projects/:id` | Project* | 大纲树 + **关系图（React Flow）** + 证据 + Agent |
| `/company/settings` | `CompanySettingsPage.tsx` | 公司 SMTP/LLM/登录方式等 |
| `/inbox` `/kanban` `/chat` | redirect | 兼容旧路由 |

关键目录：

- `frontend/src/api/` — HTTP
- `frontend/src/stores/` — Zustand
- `frontend/src/routes/` — 路由与 `RequireAuth`
- `frontend/src/components/project/` — 树 / Flow / 证据 / Agent
- `frontend/e2e/` — Playwright

---

## 8. 当前分支与重写状态（Cursor 最易踩坑）

### Git

- **开发分支**：`frontend-react-rewrite`
- **Vue 最后可构建点**：tag `vue-frontend-last`（归档提交）
- 工作区可能仍有**大量未提交**的 `backend/`、`miniprogram/` 协作代码与文档改动（与 React 提交分离）。接手后先：

```bash
git status
git log --oneline -20
git branch -vv
```

**不要**对脏工作区盲目 `git add -A`。

### React 重写进度（约 2026-07-20）

| 阶段 | 状态 |
|------|------|
| Task 0 归档 Vue | ✅ `frontend-vue-archive/` |
| Task 1–9 页面与 Flow | ✅ 代码在 `frontend/` |
| Task 10 Vitest | ✅ `npm test` 约 9 测例 |
| Task 11 Playwright | ⚠️ **套件已提交**；需真后端 + 账号才算门禁绿 |
| Task 12 Docker/文档/门禁模板 | ⚠️ 文件已写；本机曾 **Docker daemon 未起**，镜像未验证 |
| Task 13 Staging 48h soak + 生产切流 | ❌ **未做** |

### 上线门槛（规格「高+」，不可自行降低）

见 spec §7.2 / acceptance 文件。**生产切 React 前必须**：

1. P0–P7 功能 + §6 验收  
2. Playwright 打 **staging 同 SHA** 全绿  
3. **回滚演练**（G6）  
4. staging **≥48 小时 soak**（§6.12）  
5. 负责人签核（G10）

**禁止**：无图 / 无 E2E / 无 soak 声称「已上线 React」。

---

## 9. 已知差距与技术债（接手优先感知）

1. **生产未切流**：现网若仍是 Vue 镜像，以部署为准；代码真源已是 React。  
2. **E2E 未在 CI/staging 实跑绿**。  
3. **Docker 生产前端构建**需在引擎可用时验证。  
4. **相对 Vue 归档的简化**：任务表单/提醒完整度、日历仅月视图、音效/部分通知偏好可能未全迁。  
5. **后端协作代码**可能在工作区未全部 commit — 测 collab 前确认后端文件与迁移在库中。  
6. **Python venv**：`backend/venv` 可能指向失效 Python 路径；用系统 3.12 或重建 venv。  
7. **密钥**：前端永不回显 api_key/smtp_password；空串=不修改。  
8. Spec 文首个别措辞可能仍写「现役 Vue」——**以 `CLAUDE.md` 与 `frontend/` 为 React 真源为准**。

---

## 10. 给 Cursor 的工作约定（建议粘贴到会话）

```text
你是本仓库 WorkTodo 的维护者。

真源：
- 后端 backend/
- Web 现役 frontend/（React，不是 Vue）
- Vue 只读对照 frontend-vue-archive/
- 小程序 miniprogram/

必读：docs/CURSOR-HANDOFF.md、CLAUDE.md、docs/项目逻辑文档.md。
React 重写门禁：docs/superpowers/specs/2026-07-20-frontend-react-rewrite-design.md
与 docs/superpowers/acceptance/2026-07-20-react-rewrite-gates.md。

规则：
1. 勿在 docs 写第二套可运行前后端。
2. 勿无前端自创 API 路径；对齐 frontend/src/api 与后端 /api/v1。
3. 未完成 G6–G10 / 48h soak 前，禁止「生产已切 React」表述与擅自生产切流。
4. 改前端时默认只提交 frontend/ 相关；脏 backend 另议。
5. 密钥字段空=不改；构建产物不得含明文密钥。
6. 大改前先读对应 superpowers plan/spec。
```

---

## 11. 建议接手后的前 30 分钟检查单

- [ ] `git status` / `git branch` / `git log -10`  
- [ ] 后端 `uvicorn` 能起；`/docs` 能开  
- [ ] `cd frontend && npm install && npm run dev` 登录页能开  
- [ ] `npm test` 与 `npm run build`  
- [ ] 浏览 `ProjectDetail` 是否有「大纲 | 关系图」  
- [ ] 读 acceptance 门禁文件，确认未勾项  
- [ ] 确认是否需要把未提交 backend 单独整理提交  

---

## 12. 若继续 React 收尾：推荐任务顺序

1. 本地联调：登录 → 任务 CRUD → 日历 → 设置 SMTP/LLM Fake → 项目树 + Flow → 公司设置  
2. 修好 Playwright 选择器并用真账号跑绿  
3. Docker 构建 `frontend` 镜像并部署 **staging**  
4. 填 `acceptance/...-gates.md`，做回滚演练 + 48h soak  
5. 签核后才生产切流  

若产品优先后端协作稳定性：先整理并提交/测试 `backend/tests/collab/`，再依赖 Web。

---

## 13. 联系点 / 决策摘要（历史）

| 决策 | 结论 |
|------|------|
| Web 框架 | 整站迁 React（一把梭），Vue 归档保留 |
| 上线门槛 | **高+**：Playwright + staging 48h + 回滚演练 |
| LLM/SMTP | 个人与公司均可前端配置；解析有优先级 |
| 项目树 | 大纲 + React Flow 双视图（默认大纲） |
| 不做 | Next.js SSR；迁移期 Vue 新功能；无 soak 切生产 |

---

## 14. 快速文件索引

```
backend/app/main.py                 # 应用入口
backend/app/api/v1/                 # 路由
backend/app/services/llm_settings.py
backend/app/services/smtp_settings.py
backend/app/services/agent_runtime.py
backend/app/services/tree_service.py
frontend/src/main.tsx
frontend/src/routes/index.tsx
frontend/src/api/request.ts
frontend/src/pages/*
frontend/src/components/project/ProjectFlowView.tsx
frontend-vue-archive/               # 行为对照
docs/CURSOR-HANDOFF.md              # 本文
```

---

**给人类的一句话**：产品是自托管待办+单公司项目树协作；代码上 Web 已 React 重写在分支 `frontend-react-rewrite`，Vue 在 archive；**生产切流与 48h soak 仍是未完成的合规门槛**。Cursor 请先读本文再改代码。
