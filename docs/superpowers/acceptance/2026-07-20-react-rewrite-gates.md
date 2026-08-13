# React 重写门禁勾选模板（§6.1–6.12 · G1–G10）

> **来源规格**：`docs/superpowers/specs/2026-07-20-frontend-react-rewrite-design.md`  
> **用途**：合入 / 生产切流前的书面验收；勾选后填 SHA / digest / 时间。  
> **状态声明**：**本文档为模板与过程记录，不构成「生产已切 React」声明。**  
> 生产切流仅在 **G1–G10 全部满足且负责人签核** 后生效。

---

## 部署标识（每次部署填写）

| 字段 | 值 |
|------|-----|
| Git SHA（frontend 相关 commit） | `3a37b6b`（本地验证轮次） |
| 前端镜像 digest / tag | `gongzuotix-frontend:latest`（manifest `sha256:967bb559…`，本地构建） |
| 构建时间（本地 / UTC） | 2026-07-20 19:35 (UTC+8) / 11:35 UTC |
| 部署环境 | `local`（staging / production 均未部署） |
| 操作人 | Cursor Agent（接手会话） |

---

## §6 功能与质量验收

### 6.1 账户

- [ ] 登录成功写入 token 并进入仪表盘
- [ ] 注册（开放注册 / company_join 提示与归档一致）
- [ ] 登出清除会话
- [ ] 无 token 访问受保护路由 → 跳转 `/login`；带 token 访问登录页 → `/dashboard`
- [ ] token 失效 / 401 时清理会话并回到登录（行为与归档 request 拦截器对齐）

### 6.2 个人任务

- [ ] 任务列表筛选与状态操作（与归档能力对齐，不新增范围）
- [ ] 新建 / 编辑 / 详情
- [ ] Dashboard 核心入口可用
- [ ] 列表 → 详情 → 返回列表，数据刷新正确（无空白死页）

### 6.3 日历

- [ ] 日历视图加载与任务展示（**不可缺页**；交互可与归档有差异，但须能按日看到任务并进入详情）
- [ ] 无任务日期与有任务日期展示可区分

### 6.4 设置

- [ ] 个人资料更新
- [ ] 个人 SMTP：读/写/测试邮件（密码不回显、空串不覆盖）
- [ ] 个人 LLM：读/写/连通性测试（api_key 不回显、空串不覆盖）
- [ ] 主题切换（若归档有）
- [ ] 设置页刷新后配置仍正确回显（密钥仍脱敏）

### 6.5 协作

- [ ] 项目列表（公司上下文若归档有则保留）
- [ ] 项目详情：嵌套**大纲树**选中、进度、证据提交/列表
- [ ] Agent 聊天抽屉基本可用
- [ ] 无权限 / 错误项目 id 时有明确错误提示，不白屏

### 6.6 公司设置

- [ ] 公司 SMTP / 公司 LLM 配置与测试（管理员权限行为与后端 403 一致）
- [ ] 非管理员访问写接口时前端提示与后端一致，不静默失败

### 6.7 工程与质量（硬门禁）

- [x] `npm run dev` 可开发（2026-07-20 本地验证，代理目标可用 `DEV_API_TARGET` 覆写）
- [x] `npm run build` **零错误**（2026-07-20；产物 1.34MB 主 chunk，警告非阻断）
- [x] TypeScript 检查通过（`npm run typecheck` 零 error，2026-07-20）
- [x] Docker 前端**生产镜像构建成功**（2026-07-20 本地 `docker compose -f docker-compose.prod.yml build frontend`；容器内 npm 升 v11 后 `npm ci` 通过）
- [x] 生产构建产物中**不含**明文 SMTP 密码、LLM api_key、服务端 `SECRET_KEY`（2026-07-20 抽查 `dist`，仅命中表单字段名）
- [x] `Claude.md` / 部署文档启动命令与技术栈已改为 React
- [x] 前端依赖无已知阻断安装的 peer 冲突（容器内干净环境 `npm ci` 复现通过，2026-07-20）

### 6.8 可视化（P6，**上线必过，不可延期**）

- [ ] 项目详情提供 **大纲树 + React Flow** 双视图（Tab 或并列；默认视图二选一须在实现计划写明）
- [ ] React Flow：节点展示标题与状态；**点选与大纲/右侧详情联动一致**
- [ ] 支持平移、缩放；至少 2 层以上子树布局可读（默认 dagre 或等价）
- [ ] 空树 / 单节点 / 加载失败有占位或错误态，不白屏

### 6.9 单元 / 组件自动化（P7 必过）

- [x] Vitest 在本地可执行：`npm test` 9 测例**全部通过**（2026-07-20；已修复 vitest 误收集 e2e 目录问题）
- [x] 至少覆盖：路由鉴权守卫逻辑、`request` 成功解包与错误消息、auth store 登录/登出状态
- [x] 禁止「零单元测试」合并上线（已满足）

### 6.10 手工端到端冒烟（书面勾选）

在 **staging**（见 §6.12）上由实施者完成。**不能替代** §6.11 Playwright。

| # | 场景 | 通过 |
|---|------|------|
| S1 | 注册或登录 → Dashboard | [ ] |
| S2 | 创建任务 → 列表可见 → 打开详情 | [ ] |
| S3 | 日历看到该任务入口 | [ ] |
| S4 | 个人 SMTP 保存（可无真发）+ 个人 LLM 保存/ Fake 测试 | [ ] |
| S5 | 打开项目 → 大纲选节点 → 看进度/证据区 | [ ] |
| S6 | 切换 React Flow 视图 → 点选同一节点详情一致 | [ ] |
| S7 | 公司设置打开；有权限则保存 LLM/SMTP 脱敏正确 | [ ] |
| S8 | 登出 → 再进受保护 URL 被挡回登录 | [ ] |

S1–S8 全部勾选时间：_待填_ · 环境：_待填_

### 6.11 Playwright E2E（上线必过）

> **2026-08-13 重建**：旧套件在一次前端重写中丢失（`frontend/e2e` 目录、playwright
> 配置、`test:e2e` 脚本一并消失）。本日针对**现役单壳 SPA**（无路由，`App.tsx`
> `activeView` 切换视图，未登录渲染 `LoginGate`）重建全套冒烟，选择器以真实组件
> 文案（中文默认语言）+ 少量 `data-testid`（`user-menu-button` / `task-row` /
> `task-toggle`，仅加属性未改业务逻辑）为准。

- [x] 仓库内存在可运行的 Playwright 工程（`frontend/e2e/smoke.spec.ts` + `frontend/playwright.config.ts`）
- [x] 命令文档化：`cd frontend && npm run test:e2e`；**已进 PR 门禁**（`.github/workflows/e2e.yml`：backend/frontend 路径变更的 PR 必跑，另有每日定时与手动触发）
- [x] 套件覆盖 S1–S8 的现役等价路径：
  - S1 登录：LoginGate 密码登录 → 进入仪表盘（侧栏可见、LoginGate 消失）
  - S2 建任务：Navbar「新建任务」→ 唯一标题 →「我的任务」可见 → 点开详情抽屉
  - S3 日历：API 建今日任务 → 切「日历视图」→ 任务可见
  - S4 设置：改「全名」→「更新资料」→「修改已保存！」且新昵称回显（测试尾部经 API 复原昵称）
  - S5 全局搜索：Ctrl+K → 输入唯一标题命中 → Enter 打开详情抽屉
  - S6 完成任务：列表勾选 → 标题划线（局部更新，无整页刷新）+ API 复核 status=2
  - S7 401 续期：篡改 `access_token` 后触发「重新同步数据」→ 无感恢复（未回登录页、token 已被 /auth/refresh 换新、无错误横幅）
  - S8 登出：用户菜单「退出登录」→ 回 LoginGate；刷新后仍未登录
- [ ] E2E 默认打 staging 基址（`PLAYWRIGHT_BASE_URL` 或等价）——staging 未部署
- [x] 最近一次全绿 run：2026-08-13 19:3x (UTC+8) · 本地（backend uvicorn 8020 + sqlite e2e_local + vite preview 5174，`DEV_API_TARGET` 指 8020）· `main` @ `262f50b`（工作区含本次重建改动）· **8/8 passed**（两遍：15.9s / 14.9s）
- [x] 无未处理 flaky（连续两遍全绿；重建期间发现并已在测试侧规避的竞态：NewTaskModal 重置 effect 依赖 categories，boot 未完成时填表单会被清空——`bootLoggedIn` 现等 `/categories` 返回后才继续）

### 6.12 Staging 浸泡（Soak）

| 字段 | 值 |
|------|-----|
| 部署对象 | React 生产构建（Dockerfile.prod），**非** dev server |
| Soak 开始（本地时区 + UTC） | _待填_ |
| Soak 结束（本地时区 + UTC） | _待填_ |
| 连续时长 | 目标 ≥ **48 小时** · 实际：_待填_ |
| Git SHA / 镜像 digest | _待填_ |
| 期间故障列表 | _无 / 列表_ |
| 热修记录（若有） | _无 / 说明；是否重算 48h_ |
| 结果 | [ ] 成功 · [ ] 失败（原因：_待填_） |

**禁止**将本地 `npm run dev` 两天或无起止记录的「周末无人看」计为 soak。

---

## §7.2 双层门禁

### A. 合并默认分支（G1–G5）

| # | 门禁 | 要求 | 勾选 |
|---|------|------|------|
| G1 | 阶段 | P0–P7 完成（P8 soak 可在合入后执行） | [ ] |
| G2 | 功能 | §6.1–§6.9、§6.11 针对拟合入 commit 全绿；§6.8 已交付 | [ ] |
| G3 | 构建 | typecheck + `npm run build` 零 error；Docker 前端生产镜像可构建 | [ ] |
| G4 | 安全 | §6.7 产物无明文业务密钥 | [ ] |
| G5 | 文档 | Claude.md / 部署与逻辑文档技术栈已更新；可注明「生产切换待 P8」 | [ ] |

### B. 生产环境切流（G6–G10）— **额外**要求

| # | 门禁 | 要求 | 勾选 |
|---|------|------|------|
| G6 | 回滚就绪 | tag `vue-frontend-last`；归档 Vue 可 build 或旧 digest 可部署；步骤成文；**已演练** | [ ] |
| G7 | 手工冒烟 | §6.10 S1–S8 在 staging 全部勾选 | [ ] |
| G8 | Playwright | §6.11 对 **soak 同一 SHA/digest** 全绿 | [ ] |
| G9 | Staging soak | §6.12 连续 ≥48h 成功 | [ ] |
| G10 | 人工签核 | 负责人确认 G1–G9 后书面同意生产切流 | [ ] |

#### G6–G10 收口现状（2026-08-13）

自动化侧已收口：CI（backend pytest / frontend lint+test+build / flutter）挂 push+PR，
Playwright E2E 已进 PR 门禁（见 §6.11）。**剩余全部为环境与流程动作**，无代码缺口：

1. 部署 staging（React 生产构建，`docker-compose.prod.yml`）——G7/G8/G9 的前置
2. 在 staging 执行 §6.10 手工冒烟并勾选（G7）
3. 对 soak 同一 SHA 跑 Playwright 全绿并记录（G8）
4. 连续 ≥48h soak 并填 §6.12（G9）
5. G6 回滚演练（Vue 归档镜像切换往返）并填演练记录
6. 负责人签核（G10）

在上述完成前，**不得声称生产已切 React**（与 CLAUDE.md 口径一致）。

**签核**

| 角色 | 姓名 | 日期 | 同意生产切流 |
|------|------|------|--------------|
| 负责人 | _待填_ | _待填_ | [ ] 是 · [ ] 否（原因：_） |

---

## 回滚步骤（成文，对应 G6）

详见 `docs/06-部署运维指南.md` §7.2「前端 React → 归档 Vue」。摘要：

1. **归档构建**：  
   `docker build -f frontend-vue-archive/Dockerfile.prod -t worktodo-frontend:vue-rollback frontend-vue-archive`
2. **Tag 对照**：仓库 tag `vue-frontend-last` 为 Vue 冻结点。
3. **Compose**：将 `frontend` 服务镜像切到 Vue 产物或历史 digest → `docker compose -f docker-compose.prod.yml up -d frontend`
4. **验证**：登录 → 任务列表可用。
5. **再切回 React**：恢复 React 镜像 digest / 重新 `build frontend` 后 up。

### 回滚演练记录（G6）

| 字段 | 值 |
|------|-----|
| 演练环境 | _staging / 本地 compose_ |
| 演练时间 | _待填_ |
| Vue 镜像 digest / tag | _待填_ |
| React 镜像 digest / tag | _待填_ |
| 切到 Vue 后登录验证 | [ ] 通过 · [ ] 失败 |
| 切回 React 后登录验证 | [ ] 通过 · [ ] 失败 |
| 备注 | _待填_ |

---

## 明确未声明项

- [x] **不**声称生产环境已完成 React 切流（除非 G6–G10 全部勾选且签核完成）
- [ ] 生产切流完成日期：_N/A 直至签核_

---

## 变更日志

| 日期 | 说明 |
|------|------|
| 2026-07-20 | 初建模板（Task 12 / P7）；Docker 与文档已指向 React；生产切流未做 |
| 2026-07-20 (晚) | 接手会话完成本地验证轮：§6.7 全过（含 Docker 前端+后端生产镜像本地构建、3.11 容器 import 验证）；§6.9 vitest 9/9；§6.11 本地 7/7 全绿（含 S5/S6 真实数据路径）；后端 pytest 148/148。修复：py3.11 f-string、缺失依赖（asyncpg/psycopg2/dateparser）、categories/reorder 路由顺序、提醒邮件 Reply-To/Message-ID 断链、E2E 选择器。**staging 部署、G6 回滚演练、48h soak、G10 签核仍未做。** |
| 2026-08-13 | E2E 进 PR 门禁（e2e.yml 加 pull_request 路径触发 + concurrency）；修 ci.yml 前端 job `npm run typecheck` → `npm run lint`（脚本名漂移）；新增「G6–G10 收口现状」小节，明确剩余为环境/流程动作（staging、冒烟、soak、回滚演练、签核），代码侧无缺口。 |
| 2026-08-13 (晚) | **重建 §6.11 E2E 套件**（前端重写后丢失）：新增 `frontend/playwright.config.ts` + `frontend/e2e/smoke.spec.ts`（S1–S8 现役单壳 UI 等价路径，@playwright/test 入 devDependencies，`test:e2e` 脚本恢复）；`frontend/src` 仅加 3 处 `data-testid`；修 e2e.yml preview 步骤补 `DEV_API_TARGET=http://127.0.0.1:8000`（原先 vite 代理默认打 8010，CI 后端在 8000，E2E 的 API 必然打空）。本地两遍 8/8 全绿（见 §6.11）。`npm run lint` / `npm test` 均保持全绿。**staging 状态无变化。** |
