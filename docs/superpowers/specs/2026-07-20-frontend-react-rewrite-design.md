# 前端整站 Vue → React 重写设计

| 字段 | 内容 |
|------|------|
| 日期 | 2026-07-20 |
| 状态 | **实现中**（2026-07-20）；实现计划见 `docs/superpowers/plans/2026-07-20-frontend-react-rewrite.md`；P0–P7 代码与 Docker/文档/门禁模板已推进；**生产切流未做**（待 G6–G10 / §6.12 soak） |
| 决策 | **C：一把梭重写**；Vue 源码 **归档保留** 作对照 |
| 上线门槛档位 | **高+**（Playwright E2E + staging ≥48h soak + 回滚演练；见 §7.3） |
| 相关 | `frontend/`（现役 Vue）、`backend/`（不变）、`miniprogram/`（不变） |

---

## 1. 背景与目标

### 1.1 动机

产品需要更强的**项目管理树可视化**（缩放、布局、图编辑能力）。评估后团队选择**整站迁移 React**，以便采用 React Flow 等成熟图编辑生态，并统一长期前端技术栈。

说明：Vue 本身可以做大纲树与图可视化；本决策是**产品/栈选择**，不是「Vue 无法做树」。

### 1.2 目标

1. 用 **React 18 + TypeScript + Vite** 重写 Web 前端，功能与现役 Vue 路由**对等**（见 §6）。
2. 项目详情在大纲树之外，具备 **React Flow** 可视化能力（可与大纲双视图）。
3. **不改** FastAPI 后端契约、小程序、鉴权与业务 API 语义。
4. Vue 代码迁出为归档目录，便于对照实现与紧急回滚参考。

### 1.3 非目标（本规格明确不做）

- 不改为 Next.js / SSR / RSC。
- 不重写后端、不改 API 路径与响应 envelope（`code` / `data` / `message`）。
- 不重写微信小程序。
- 不追求与 Element Plus 像素级 UI 一致（Ant Design + 保留 Tailwind token 即可）。
- 不在迁移期内并行开发 Vue 新功能（冻结 Vue 功能开发）。
- 不在本规格内实现企微登录前端配置以外的新业务能力。

---

## 2. 归档与仓库布局

### 2.1 目录策略

| 路径 | 含义 |
|------|------|
| `frontend-vue-archive/` | 现役 Vue 前端**完整拷贝/移动**，只读对照；不再作为 Docker/开发默认入口 |
| `frontend/` | **新建** React 应用；成为唯一现役 Web 前端 |
| `backend/` | 不变 |
| `miniprogram/` | 不变 |

### 2.2 执行顺序（实现阶段遵守）

1. 建分支：`frontend-react-rewrite`（名称可调整，须独立于生产默认分支直至验收）。
2. 将当前 `frontend/` **移动或复制**为 `frontend-vue-archive/`（保留 `package.json`、源码、配置）。
3. 在空的/新的 `frontend/` 用 Vite React-TS 初始化。
4. 更新根文档与 Docker 前端构建上下文，指向新 `frontend/`。
5. 验收通过前，生产镜像仍可指向归档构建产物（若需热修，仅在归档上打补丁并注明临时性）。

### 2.3 Git 标签（建议）

- 归档完成时打 tag：`vue-frontend-last`（指向仍可构建 Vue 的提交）。
- 不删除远程历史中的 Vue 提交。

### 2.4 对照原则

- 重写时以 `frontend-vue-archive/src` 为**行为真源**（路由、API 调用、表单字段、权限提示文案）。
- 类型与 API 模块可从归档中的 `types/`、`api/` **机械迁移**（去掉 Vue 类型，保留 DTO）。

---

## 3. 技术栈

| 层 | 选型 | 备注 |
|----|------|------|
| 运行时 | React 18 | 函数组件 + Hooks |
| 语言 | TypeScript（strict 与现项目对齐） | |
| 构建 | Vite 5 + `@vitejs/plugin-react` | |
| 路由 | React Router v6 | `BrowserRouter` + 布局路由 |
| 全局状态 | Zustand | 替换 Pinia（至少 `auth`、`task`） |
| HTTP | axios | 复用 baseURL、Bearer、`access_token`、统一错误解析 |
| UI 组件 | Ant Design 5 | 替换 Element Plus |
| 样式 | Tailwind CSS 3 | 尽量保留现有 CSS 变量 / MD3 token |
| 日期 | dayjs | 与现一致 |
| 项目图 | `@xyflow/react`（React Flow） | P6；大纲树可先 HTML/Ant Tree |
| 图标 | Ant Design Icons 或 Material Symbols（若归档已用后者可继续） | 与视觉统一即可 |
| 单元/组件测（P7 必做） | Vitest + React Testing Library | 鉴权守卫、request 解包/错误、auth store |
| E2E（上线必做） | **Playwright** | 对 staging（或同构环境）跑通 §6.11 套件；禁止仅手工冒烟替代 |

### 3.1 明确不用

- Vue / Pinia / vue-router / Element Plus / `@vitejs/plugin-vue`
- Redux Toolkit（除非 Zustand 无法满足，默认不用）
- CSS-in-JS 作为主方案（避免与 Tailwind 双轨）

---

## 4. 目标目录结构

```text
frontend/
  package.json
  vite.config.ts
  tsconfig.json
  tailwind.config.js
  index.html
  src/
    main.tsx
    App.tsx
    api/                 # request + 各域 API（从 archive 迁移）
    types/               # DTO 与前端类型
    stores/              # zustand
    routes/              # 路由表与守卫
    layouts/             # SidebarLayout 等
    pages/               # 原 views
    components/
    hooks/               # 原 composables
    utils/
    assets/
  public/
```

路径别名：`@/` → `src/`（与归档一致，降低迁移成本）。

---

## 5. 路由与功能对等

与归档 `src/router/index.ts` 对齐：

| 路径 | 名称 | 鉴权 | 说明 |
|------|------|------|------|
| `/login` | Login | 否 | |
| `/register` | Register | 否 | 可与 Login 同页不同 mode |
| `/` | — | 是 | 布局壳；默认 redirect `/dashboard` |
| `/dashboard` | Dashboard | 是 | |
| `/tasks` | TaskList | 是 | |
| `/tasks/new` | TaskCreate | 是 | |
| `/tasks/:id` | TaskDetail | 是 | |
| `/calendar` | Calendar | 是 | |
| `/settings` | Settings | 是 | 含个人 SMTP / 个人 LLM |
| `/projects` | ProjectList | 是 | |
| `/projects/:id` | ProjectDetail | 是 | 树 + 进度 + 证据 + Agent |
| `/company/settings` | CompanySettings | 是 | 公司 SMTP / LLM 等 |
| `/inbox` | — | 是 | redirect → `/dashboard` |
| `/kanban` | — | 是 | redirect → `/tasks` |
| `/chat` | — | 是 | redirect → `/dashboard` |

### 5.1 路由守卫

- 无 `localStorage.access_token` 且路由需鉴权 → `/login`。
- 已登录访问 `/login` 或 `/register` → `/dashboard`。
- 实现方式：React Router `loader` 或布局级 `Navigate`；行为与归档 `beforeEach` 一致。

---

## 6. 验收清单（功能）

完成标准：**下列全部在 React `frontend` 对真实（或与生产同构的）后端走通**。  
**任一项未勾选 → 不得合并默认分支、不得切换生产前端镜像。**

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

- [ ] `npm run dev` 可开发
- [ ] `npm run build` **零错误**；产物可被现有 nginx 静态托管（含 SPA `try_files`）
- [ ] TypeScript 检查通过（`tsc` / 项目既定 typecheck 脚本，**零 error**）
- [ ] Docker 前端**生产镜像构建成功**（`Dockerfile.prod` 等指向新 `frontend/`）
- [ ] 生产构建产物中**不含**明文 SMTP 密码、LLM api_key、服务端 `SECRET_KEY`（抽查 `dist` 与镜像层说明）
- [ ] `Claude.md` / 部署文档启动命令与技术栈已改为 React
- [ ] 前端依赖无已知阻断安装的 peer 冲突（`npm ci` 在干净环境可复现）

### 6.8 可视化（P6，**上线必过，不可延期**）

- [ ] 项目详情提供 **大纲树 + React Flow** 双视图（Tab 或并列；默认视图二选一须在实现计划写明）
- [ ] React Flow：节点展示标题与状态；**点选与大纲/右侧详情联动一致**
- [ ] 支持平移、缩放；至少 2 层以上子树布局可读（默认 dagre 或等价）
- [ ] 空树 / 单节点 / 加载失败有占位或错误态，不白屏

### 6.9 单元 / 组件自动化（P7 必过）

- [ ] Vitest（或等价）在 CI/本地可执行：`npm test`（或文档写明的命令）**全部通过**
- [ ] 至少覆盖：路由鉴权守卫逻辑、`request` 成功解包与错误消息、auth store 登录/登出状态
- [ ] 禁止「零单元测试」合并上线

### 6.10 手工端到端冒烟（书面勾选）

在 **staging**（见 §6.12）上由实施者完成并留下勾选记录（可附在 PR / 验收笔记）。  
**注意：§6.10 不能替代 §6.11 Playwright；两者都要过。**

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

**S1–S8 全部勾选**才算 §6.10 通过。

### 6.11 Playwright E2E（上线必过，不可用纯手工替代）

- [ ] 仓库内存在可运行的 Playwright 工程（推荐 `frontend/e2e` 或根目录 `e2e/`，实现计划写明路径）
- [ ] 命令文档化，例如：`npm run test:e2e`（或 `npx playwright test`），**在 CI 或指定 runner 上全绿**
- [ ] 套件**至少**覆盖与 S1–S8 等价的自动化路径（允许合并为更少 spec 文件，但场景不可缺）：
  - 登录（或测试账号注入）→ Dashboard
  - 创建任务 → 列表可见 → 打开详情
  - 打开日历页且无致命错误（有任务时可见入口更佳）
  - 设置页：个人 LLM 或 SMTP 表单可打开并保存脱敏回显（可用 Fake / mock 后端仅当 staging 策略写明）
  - 项目详情：大纲选节点 + 切换 Flow 视图点选
  - 登出后受保护路由重定向登录
- [ ] E2E **默认打 staging 基址**（`PLAYWRIGHT_BASE_URL` 或等价）；禁止「只对 mock 静态页」充当上线 E2E
- [ ] 最近一次全绿 run 的时间戳 / CI 链接 / 本地报告路径写入验收笔记；**全绿时间不得早于进入 §6.12 soak 的部署版本**（即 soak 所部署的那一版前端必须再跑通或确认同 commit 已绿）
- [ ] 不稳定用例（flaky）不得通过「重跑三次碰运气」掩盖：上线前 flaky 必须修或隔离并声明不计入门禁（隔离项不得覆盖 S1/S2/S5/S6/S8）

### 6.12 Staging 浸泡（Soak，上线必过）

**定义：** staging = 与生产同构的部署（同一 compose/镜像构建方式、同一类后端配置；数据可为演示库，但 API 与静态托管路径真实）。

| 要求 | 标准 |
|------|------|
| 部署对象 | **React** 前端生产构建（或与生产相同 Dockerfile 产物），**不是** dev server |
| 最短时长 | **连续 ≥ 48 小时** 对外（或对验收账号）可访问 |
| 起始条件 | 已满足：P0–P7 功能完成、§6.7–6.9、§6.11 对该 commit **全绿**、§6.10 在 soak **开始前或开始 4h 内**勾完 |
| 浸泡期间 | 不得用「临时关功能 / 注释路由」掩盖故障；热修须重新部署并**重新起算 48h**，或书面记录热修内容且再跑 §6.11 全绿后**至少再浸泡 24h**（取更严：大改重算 48h，仅文案/样式小补丁可 24h，由签核人判定并写笔记） |
| 失败判定 | 登录不可用、任务主路径不可用、项目大纲与 Flow **均**不可用、大面积白屏、构建产物无法服务 → soak **失败**，修复后重来 |
| 观察记录 | 验收笔记记录：soak 起止 UTC/本地时间、镜像 digest 或 git SHA、期间故障列表（无则写「无」） |
| 生产切流 | **仅当** 48h soak **成功结束** 且期间无未关闭的 P0/P1 级缺陷，才允许进入 §7.2 生产切流 |

**禁止：** 本地 `npm run dev` 跑两天、或 staging 只挂 2 小时、或「周末没人看也算 soak」而无起止记录。

---

## 7. 实现阶段

| 阶段 | 交付物 | 退出标准 |
|------|--------|----------|
| **P0 骨架** | Vite React、Tailwind、Router、Layout 壳、axios、鉴权守卫 | 未登录跳转登录；空页可进 dashboard 壳 |
| **P1 登录注册** | Login/Register 页 + auth store | 真后端登录注册成功；§6.1 中守卫相关项可测 |
| **P2 任务** | Dashboard 入口、TaskList、TaskDetail/Create、相关 components | §6.2 |
| **P3 日历与个人设置** | Calendar、Settings（SMTP/LLM） | §6.3–6.4 |
| **P4 协作项目** | ProjectList、ProjectDetail（大纲树）、Evidence、AgentChat | §6.5 |
| **P5 公司设置** | CompanySettings | §6.6 |
| **P6 React Flow** | 大纲 + 图双视图 | §6.8 **全部** |
| **P7 收尾** | Docker、文档、清理依赖、Vitest、**Playwright 套件**、回滚演练 | §6.7、§6.9、§6.11 可跑通；§11 文档清单；具备部署 staging 的镜像 |
| **P8 Staging soak** | React 部署 staging ≥48h + §6.10 勾选 + 观察笔记 | **§6.12 成功**；§6.11 对 soak 版本全绿 |

### 7.1 阶段约束

- 每阶段结束：对本阶段路由做冒烟，再开下一阶段。
- API 封装优先一次性迁完 `api/` + `types/`，减少页面反复改 URL。
- **禁止**「先上线再补图 / 再补单测 / 再补 E2E / 再补 Docker / 跳过 soak」。
- Playwright 可在 P4 后增量补场景，但 **P7 结束前必须具备 §6.11 全套且全绿**。

### 7.2 合并与生产切流门禁（最高档）

分两层：

**A. 合并默认分支（代码合入）** — 须同时满足：

| # | 门禁 | 要求 |
|---|------|------|
| G1 | 阶段 | **P0–P7 完成**（代码与工程就绪；P8 可在合入后于 staging 执行，但**生产切流**仍要等 P8） |
| G2 | 功能 | §6.1–§6.9、§6.11 针对**拟合入 commit** 全绿；§6.8 图能力在代码中已交付 |
| G3 | 构建 | `typecheck` + `npm run build` 零 error；Docker 前端生产镜像可构建 |
| G4 | 安全 | §6.7 产物无明文业务密钥 |
| G5 | 文档 | §11 完成（可注明「生产切换待 P8」） |

**B. 生产环境切流（用户看到 React）** — 在 A 之外**额外**同时满足：

| # | 门禁 | 要求 |
|---|------|------|
| G6 | 回滚就绪 | tag `vue-frontend-last`；**已验证**归档 Vue 可 build 或旧镜像 digest 可部署；回滚步骤成文；**已在 staging 或演练环境实际执行过一次回滚演练**（切到旧前端再切回，或 reverse），笔记记录结果 |
| G7 | 手工冒烟 | **§6.10 S1–S8** 在 staging 全部勾选 |
| G8 | Playwright | **§6.11** 对 **soak 所部署的同一 git SHA / 镜像 digest** 全绿（报告留存） |
| G9 | Staging soak | **§6.12**：staging 连续 ≥ **48 小时**成功，无未关闭的阻断缺陷 |
| G10 | 人工签核 | 负责人确认 **G1–G9** 后书面同意生产切流；无签核不切 |

**明确不构成生产上线的情况：**

- 仅完成 P5、无 React Flow  
- 无 Docker / 无文档 / 无 Vitest  
- 仅有手工 §6.10、**没有** Playwright §6.11  
- Playwright 只打 mock、未打 staging  
- staging 未满 48h 或 soak 中出过阻断故障未重来  
- 未做回滚演练  
- 「先切生产，E2E 和 soak 下周补」

### 7.3 门槛档位说明（决策记录）

| 档位 | 含义 | 本规格采用 |
|------|------|------------|
| 低 | P5 + 基本功能即可切 | ❌ 否决 |
| 中 | P0–P7 + 图 + 单测 + 手工冒烟 | ❌ 否决（仍缺 E2E/soak） |
| **高+** | 中 + **Playwright E2E** + **staging ≥48h soak** + 回滚演练 + 双层门禁（合入 / 切流） | **✅ 当前** |

---

## 8. 状态、API 与数据流

### 8.1 Auth（Zustand 示例职责）

- `token` / `user` / `login` / `logout` / `fetchCurrentUser`
- token 持久化：`localStorage.access_token`（键名与归档一致，避免用户重登）

### 8.2 HTTP

- 基址、拦截器、`getErrorMessage` 行为对齐 `frontend-vue-archive/src/api/request.ts`。
- 响应解包规则不变：业务数据在 `data` 字段。

### 8.3 公司上下文

- 若归档存在 `useCompanyContext` / `company_id` localStorage，React 用等价 `hooks` + store 复刻，避免项目/公司 API 缺 header 或 query。

### 8.4 LLM / SMTP

- 个人：`/notifications/smtp-config`、`/notifications/llm-config`、`*-test`
- 公司：`/companies/:id/smtp`、`/companies/:id/llm` 等
- UI 规则：密钥字段空 = 不修改；列表/详情永不展示明文 key。

---

## 9. 项目树 UI 策略

### 9.1 P4（必须）

- 嵌套大纲树（递归列表或 Ant Design `Tree`）
- 选中节点 → 进度 + 证据（对齐归档 `ProjectDetailView`）

### 9.2 P6（上线必达）

- React Flow：节点 = `TreeNodeDTO`；边 = parent→child
- 布局：dagre/elk 或等价分层（实现计划选定一种，**默认 dagre**）
- 交互最小集：平移、缩放、点选同步详情；与大纲树**双视图**（§6.8）
- **拖拽改父子并写回 `parent_id`**：本规格不强制纳入上线门槛，可作为上线后增强
- **不得以「P6 可延期」为由降低 §7.2 门禁**

### 9.3 数据

- 继续 `GET /projects/:id/tree?format=nested|flat`，不新增后端接口即可完成 P6 只读图。

---

## 10. Docker 与部署

- 前端生产 Dockerfile 的 build 上下文仍为 `frontend/`（React）。
- `npm run build` 输出 `dist/`；nginx 配置可复用，注意 `try_files` SPA fallback。
- 环境变量：若使用 `VITE_*`，与归档 Vite 约定对齐；**禁止**把 SMTP/LLM 密钥打进前端镜像。
- `docker-compose` 服务名可不变，仅重建 frontend 镜像。
- **Staging（P8）**：必须用与生产相同的镜像构建链路部署 React，供 §6.11 / §6.12 使用。
- **生产切流前**：记录当前生产前端镜像 digest / 部署 commit，写入回滚说明；**回滚演练已做**（G6）。
- **生产切流后 48h 内**：加强观察；若登录不可用、任务主路径不可用、项目树双视图均不可用，**立即**按 G6 回滚，不「带病硬扛」。

---

## 11. 文档更新清单（P7）

- [ ] 根 `Claude.md`：技术栈 Vue → React；启动命令
- [ ] `docs/项目逻辑文档.md` 中前端描述（若有）
- [ ] `docs/06-部署运维指南.md` / compose 说明中的前端构建
- [ ] 文档写明：`npm test`、`npm run test:e2e`（或实际命令）、staging 基址与 soak 记录模板
- [ ] 回滚步骤与演练结果记入部署文档或验收笔记
- [ ] 本规格状态改为「已实现」并链到 implementation plan

---

## 12. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 工期长、日历/设置页复杂 | 严格分阶段；日历须满足 §6.3，不可缺页 |
| 迁移期无功能迭代 | 冻结 Vue 新功能；热修仅 bugfix |
| Ant Design 与现视觉差异 | Tailwind 布局 + 主题色对齐；不强制像素级 |
| 误删 Vue 无法对照 | `frontend-vue-archive/` + tag `vue-frontend-last` |
| 半残上线 | **§7.2**：合入 G1–G5；生产切流 **G1–G10**（含 Playwright、48h soak、回滚演练） |
| E2E 不稳定 | §6.11：flaky 必修；关键路径不可隔离出豁免 |
| 跳过 staging | §6.12 + G9：无 48h soak **禁止**生产切流 |
| 切流后故障 | §10：生产后 **48h** 主路径不可用则立即回滚 |

---

## 13. 成功标准（总）

1. 现役 Web 入口仅为 React `frontend/`。
2. Vue 完整保留在 `frontend-vue-archive/`；**回滚演练已通过**（G6）。
3. **§6.1–§6.12 全部满足**；生产切流前 **§7.2 B 层 G6–G10** 全部满足。
4. 后端与小程序无强制变更。
5. **Vitest（§6.9）+ Playwright（§6.11）+ 手工 S1–S8（§6.10）+ staging ≥48h（§6.12）** 均为生产切流必要条件，任一不可省略。

---

## 14. 后续流程

1. ~~用户审阅本规格~~ → **已批准（2026-07-20）**。
2. ~~编写 implementation plan~~ → [`../plans/2026-07-20-frontend-react-rewrite.md`](../plans/2026-07-20-frontend-react-rewrite.md)。
3. 用户选择执行方式后，从 plan **Task 0** 开工（归档 → React 脚手架 → … → P8 soak）。

---

## 15. 已确认决策记录

| 决策点 | 结论 |
|--------|------|
| 迁移方式 | C：一把梭整站 React，非双轨长期共存 |
| Vue 去留 | **归档保留** `frontend-vue-archive/` |
| 本轮交付 | **仅规格文档**；未改业务代码 |
| UI 库 | Ant Design 5 + Tailwind |
| 图库 | React Flow（`@xyflow/react`） |
| SSR | 不做 |
| **上线门槛** | **高+**：P0–P8；§6.1–6.12；合入 G1–G5、生产切流 G6–G10；**Playwright E2E** + **staging ≥48h soak** + 回滚演练；禁止无图/无 E2E/无 soak 切生产 |

---

## 16. Spec 自检

- [x] 无 TBD 占位实现细节冒充已定（P6 布局算法已给默认：dagre，可在 plan 中细化）
- [x] 归档策略与「废弃 Vue 作为现役入口」一致
- [x] 范围排除后端/小程序/Next
- [x] 验收与阶段门槛可执行；**门槛档位 = 高+**（P0–P8、§6.1–6.12、双层门禁）
- [x] 密钥与 API 行为与现后端一致
- [x] 明确禁止「无图 / 无 Vitest / 无 Playwright / 无 48h soak / 无回滚演练」切生产
- [x] 合入默认分支与生产切流条件分离（A/B 两层），避免「代码合了就算上线」
