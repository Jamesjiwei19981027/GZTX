# Frontend Vue → React Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.  
> **Spec (approved):** [`../specs/2026-07-20-frontend-react-rewrite-design.md`](../specs/2026-07-20-frontend-react-rewrite-design.md)  
> **行为真源（对照）：** 归档后的 `frontend-vue-archive/src/**`  
> **HTTP 契约：** 勿自创路径；对齐现有 `api/*` 与后端 `/api/v1/*`

**Goal:** 将 Web 前端从 Vue3 一把梭重写为 React 18 + TS + Vite，功能对等，含大纲树 + React Flow、Vitest、Playwright、staging 48h soak；Vue 归档保留。

**Architecture:** 先归档现 `frontend/` → `frontend-vue-archive/`，再在 `frontend/` 重建 Vite React 应用。axios 信封与 `access_token` 键名保持不变。Zustand 替 Pinia；React Router v6 替 vue-router；Ant Design 5 替 Element Plus；Tailwind 保留 token。项目详情双视图：Ant Tree 大纲 + `@xyflow/react`。上线分两层门禁：合入 G1–G5，生产切流 G6–G10（见 spec §7.2）。

**Tech Stack:** React 18 · TypeScript · Vite 5 · React Router 6 · Zustand · axios · Ant Design 5 · Tailwind 3 · dayjs · @xyflow/react · dagre · Vitest · RTL · Playwright

## Global Constraints

- Spec 门槛档位：**高+**（Playwright + staging ≥48h soak + 回滚演练）
- **禁止**改 backend API 语义、小程序、Next.js/SSR
- **禁止**无图 / 无 Vitest / 无 Playwright / 无 soak 生产切流
- token 键名：`localStorage.access_token`（与归档一致）
- 密钥 UI：空串 = 不修改；永不回显明文 api_key / smtp_password
- 文案：简体中文
- 真源目录：现役 `frontend/`（React）；对照 `frontend-vue-archive/`
- 分支建议：`frontend-react-rewrite`；tag：`vue-frontend-last`
- 冻结 Vue 新功能；热修仅 bugfix 且注明临时性

---

## File Map（目标）

```text
frontend-vue-archive/          # Task 0 从现 frontend 移入
frontend/
  package.json
  vite.config.ts
  tsconfig.json
  tsconfig.app.json
  tailwind.config.js
  postcss.config.js
  index.html
  playwright.config.ts
  e2e/
    smoke.spec.ts
    helpers/auth.ts
  src/
    main.tsx
    App.tsx
    api/
      request.ts
      auth.ts
      task.ts
      notifications.ts
      collab.ts
      categories.ts
      tags.ts
      reminders.ts
    types/
      index.ts
      collab.ts
    stores/
      auth.ts
      task.ts
    routes/
      index.tsx
      RequireAuth.tsx
    layouts/
      SidebarLayout.tsx
    pages/
      LoginPage.tsx
      DashboardPage.tsx
      TaskListPage.tsx
      TaskDetailPage.tsx
      CalendarPage.tsx
      SettingsPage.tsx
      ProjectListPage.tsx
      ProjectDetailPage.tsx
      CompanySettingsPage.tsx
    components/
      tasks/...
      project/
        OutlineTree.tsx
        ProjectFlowView.tsx
        EvidencePanel.tsx
        AgentChatDrawer.tsx
    hooks/
      useCompanyContext.ts
      useTheme.ts
    utils/
      date.ts
      treeLayout.ts
    test/
      setup.ts
      request.test.ts
      auth.store.test.ts
      RequireAuth.test.tsx
  public/
docs/
  superpowers/acceptance/
    2026-07-20-react-rewrite-gates.md   # 门禁勾选模板（P7/P8）
```

对照映射（归档 → 新）：

| 归档 | React |
|------|--------|
| `views/*View.vue` | `pages/*Page.tsx` |
| `stores/*.ts` (Pinia) | `stores/*.ts` (Zustand) |
| `composables/*` | `hooks/*` |
| `router/index.ts` | `routes/index.tsx` |
| `api/*.ts` | `api/*.ts`（逻辑迁移，去 Vue 类型） |

---

## Task 0: 分支、归档 Vue、打 tag

**Files:**
- Move: `frontend/` → `frontend-vue-archive/`
- Create: empty `frontend/` placeholder until Task 1
- Git: branch + tag

**Interfaces:**
- Produces: 可对照的 `frontend-vue-archive/package.json` 与完整 `src/`

- [ ] **Step 1: 确认工作区干净并可构建 Vue（归档前基线）**

```bash
cd frontend
npm ci
npm run build
```

Expected: build 成功（或记录已知失败，禁止在未知状态下归档）。

- [ ] **Step 2: 建分支并移动目录**

```bash
git checkout -b frontend-react-rewrite
git mv frontend frontend-vue-archive
mkdir frontend
echo "# React frontend placeholder — see implementation plan" > frontend/README.md
git add frontend/README.md
git status
```

- [ ] **Step 3: 打 tag 并提交归档**

```bash
git add -A
git commit -m "chore(frontend): archive Vue app to frontend-vue-archive"
git tag vue-frontend-last
```

- [ ] **Step 4: 验证归档仍可构建**

```bash
cd frontend-vue-archive
npm ci
npm run build
```

Expected: 成功（G6 回滚基线）。

---

## Task 1: P0 — Vite React 脚手架 + Tailwind + Ant Design

**Files:**
- Create: `frontend/package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `tailwind.config.js`, `postcss.config.js`, `src/main.tsx`, `src/App.tsx`, `src/assets/main.css`
- Modify: root Docker only later (Task 12)

**Interfaces:**
- Produces: `npm run dev` / `npm run build` 可用的空壳

- [ ] **Step 1: 初始化 Vite React-TS**

```bash
cd /path/to/repo
# 在空 frontend 中脚手架（若目录非空，先移走 README）
npm create vite@5 . -- --template react-ts
npm install
npm install react-router-dom zustand axios antd @ant-design/icons dayjs
npm install -D tailwindcss@3 postcss autoprefixer @types/node
npx tailwindcss init -p
```

- [ ] **Step 2: Vite 别名与插件**

```typescript
// frontend/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
```

- [ ] **Step 3: Tailwind 扫描路径**

```js
// frontend/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
  corePlugins: {
    // 若与 antd 冲突可按需 preflight 调整
  },
}
```

从 `frontend-vue-archive/src/assets/main.css` 复制 CSS 变量 / MD3 token 到 `frontend/src/assets/main.css`，并在文件顶加入：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: main 入口**

```tsx
// frontend/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './assets/main.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN}>
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)
```

```tsx
// frontend/src/App.tsx
export default function App() {
  return <div className="p-8 font-sans">WorkTodo React shell</div>
}
```

- [ ] **Step 5: 验证**

```bash
cd frontend
npm run build
```

Expected: 零 error。

- [ ] **Step 6: Commit**

```bash
git add frontend
git commit -m "feat(frontend): scaffold Vite React + Tailwind + Ant Design"
```

---

## Task 2: P0 — request 客户端 + 类型迁移

**Files:**
- Create: `frontend/src/api/request.ts`
- Create: `frontend/src/types/index.ts`, `frontend/src/types/collab.ts`（从 archive 复制并去掉 Vue 专用类型）
- Test: `frontend/src/test/request.test.ts`（Vitest 在 Task 11 正式接通；本任务可先写纯函数便于测）

**Interfaces:**
- Produces:
  - `getErrorMessage(err: unknown, fallback?: string): string`
  - `request.get/post/put/delete<T>(url, ...): Promise<T>`
  - 拦截器：`Authorization: Bearer ${localStorage.access_token}`
  - 401：清 token 并 `window.location.href = '/login'`（或交给路由，行为对齐 archive）

- [ ] **Step 1: 对照阅读**

Read: `frontend-vue-archive/src/api/request.ts`  
逐项迁移 baseURL、解包 `response.data.data`、错误 envelope。

- [ ] **Step 2: 实现 request.ts**

```typescript
// frontend/src/api/request.ts — 核心结构（细节对齐 archive）
import axios, { type AxiosError } from 'axios'

const TOKEN_KEY = 'access_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function getErrorMessage(err: unknown, fallback = '请求失败'): string {
  const e = err as AxiosError<{ detail?: unknown; message?: string; code?: number }>
  const detail = e?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object' && 'message' in (detail as object)) {
    return String((detail as { message: string }).message)
  }
  if (e?.response?.data && typeof e.response.data === 'object' && 'message' in e.response.data) {
    return String((e.response.data as { message: string }).message)
  }
  return e?.message || fallback
}

const raw = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api/v1',
  timeout: 60000,
})

raw.interceptors.request.use((config) => {
  const t = getToken()
  if (t) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${t}`
  }
  return config
})

raw.interceptors.response.use(
  (res) => {
    const body = res.data
    if (body && typeof body === 'object' && 'data' in body && 'code' in body) {
      if (body.code !== 200 && body.code !== 0) {
        return Promise.reject(body)
      }
      return body.data
    }
    return body
  },
  (err) => {
    if (err?.response?.status === 401) {
      setToken(null)
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login')
      }
    }
    return Promise.reject(err)
  },
)

export const request = {
  get: <T>(url: string, config?: Parameters<typeof raw.get>[1]) =>
    raw.get(url, config) as Promise<T>,
  post: <T>(url: string, data?: unknown, config?: Parameters<typeof raw.post>[2]) =>
    raw.post(url, data, config) as Promise<T>,
  put: <T>(url: string, data?: unknown, config?: Parameters<typeof raw.put>[2]) =>
    raw.put(url, data, config) as Promise<T>,
  delete: <T>(url: string, config?: Parameters<typeof raw.delete>[1]) =>
    raw.delete(url, config) as Promise<T>,
}

export default request
```

> 若 archive 解包规则不同，**以 archive 为准**改写，勿自创 envelope。

- [ ] **Step 3: 复制 types**

```bash
cp frontend-vue-archive/src/types/index.ts frontend/src/types/index.ts
cp frontend-vue-archive/src/types/collab.ts frontend/src/types/collab.ts
# 手工删除仅 Vue 使用的 import
```

- [ ] **Step 4: 迁移其余 api 模块（可同 commit）**

从 archive 复制并改 import 路径：

- `auth.ts`, `task.ts`, `notifications.ts`, `collab.ts`, `categories.ts`, `tags.ts`, `reminders.ts`

保证无 `vue` import。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api frontend/src/types
git commit -m "feat(frontend): port axios request client and API/types from Vue archive"
```

---

## Task 3: P0/P1 — Auth store、路由、Layout、登录注册

**Files:**
- Create: `frontend/src/stores/auth.ts`
- Create: `frontend/src/routes/index.tsx`, `RequireAuth.tsx`
- Create: `frontend/src/layouts/SidebarLayout.tsx`
- Create: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Produces `useAuthStore`:
  - `token: string | null`
  - `user: User | null`
  - `login(username, password): Promise<void>`
  - `register(...): Promise<void>`
  - `logout(): Promise<void>`
  - `fetchCurrentUser(): Promise<void>`

- [ ] **Step 1: auth store**

```typescript
// frontend/src/stores/auth.ts
import { create } from 'zustand'
import { login as loginApi, register as registerApi, getMe, logout as logoutApi } from '@/api/auth'
import { getToken, setToken } from '@/api/request'
import type { User } from '@/types'

type AuthState = {
  token: string | null
  user: User | null
  login: (username: string, password: string) => Promise<void>
  register: (payload: Record<string, unknown>) => Promise<void>
  logout: () => Promise<void>
  fetchCurrentUser: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  token: getToken(),
  user: null,
  async login(username, password) {
    const data = await loginApi({ username, password })
    // 对齐 archive：access_token 字段名以 api 返回为准
    const token = (data as { access_token: string }).access_token
    setToken(token)
    set({ token })
    const user = await getMe()
    set({ user })
  },
  async register(payload) {
    await registerApi(payload as never)
  },
  async logout() {
    try {
      await logoutApi()
    } catch {
      /* ignore */
    }
    setToken(null)
    set({ token: null, user: null })
  },
  async fetchCurrentUser() {
    const user = await getMe()
    set({ user, token: getToken() })
  },
}))
```

> `loginApi` / `getMe` 签名以迁移后的 `api/auth.ts` 为准。

- [ ] **Step 2: RequireAuth**

```tsx
// frontend/src/routes/RequireAuth.tsx
import { Navigate, useLocation } from 'react-router-dom'
import { getToken } from '@/api/request'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const loc = useLocation()
  if (!getToken()) {
    return <Navigate to="/login" replace state={{ from: loc }} />
  }
  return <>{children}</>
}
```

- [ ] **Step 3: 路由表（对齐 archive router）**

```tsx
// frontend/src/routes/index.tsx
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RequireAuth } from './RequireAuth'
import SidebarLayout from '@/layouts/SidebarLayout'
import LoginPage from '@/pages/LoginPage'
// 后续页面先 placeholder，再按 Task 替换

function Placeholder({ title }: { title: string }) {
  return <div className="p-6">{title}</div>
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <LoginPage register /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <SidebarLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <Placeholder title="Dashboard" /> },
      { path: 'tasks', element: <Placeholder title="Tasks" /> },
      { path: 'tasks/new', element: <Placeholder title="TaskCreate" /> },
      { path: 'tasks/:id', element: <Placeholder title="TaskDetail" /> },
      { path: 'calendar', element: <Placeholder title="Calendar" /> },
      { path: 'settings', element: <Placeholder title="Settings" /> },
      { path: 'projects', element: <Placeholder title="Projects" /> },
      { path: 'projects/:id', element: <Placeholder title="ProjectDetail" /> },
      { path: 'company/settings', element: <Placeholder title="CompanySettings" /> },
      { path: 'inbox', element: <Navigate to="/dashboard" replace /> },
      { path: 'kanban', element: <Navigate to="/tasks" replace /> },
      { path: 'chat', element: <Navigate to="/dashboard" replace /> },
    ],
  },
])
```

- [ ] **Step 4: App 挂载 RouterProvider**

```tsx
import { RouterProvider } from 'react-router-dom'
import { router } from '@/routes'

export default function App() {
  return <RouterProvider router={router} />
}
```

- [ ] **Step 5: SidebarLayout**

对照 `frontend-vue-archive/src/layouts/SidebarLayout.vue`：导航项 dashboard/tasks/calendar/projects/settings/company；`<Outlet />`；退出调用 `useAuthStore().logout` 后 `navigate('/login')`。

- [ ] **Step 6: LoginPage**

对照 `LoginView.vue`：登录表单；`register` prop 时显示注册字段与 company_join 提示；成功后 `navigate('/dashboard')`。

- [ ] **Step 7: 手工验证**

```bash
# 终端 1
cd backend && uvicorn app.main:app --reload
# 终端 2
cd frontend && npm run dev
```

Expected: 无 token 访问 `/dashboard` → `/login`；登录成功进壳。

- [ ] **Step 8: Commit**

```bash
git commit -am "feat(frontend): auth store, router guards, layout, login/register"
```

---

## Task 4: P2 — 任务列表 / 详情 / Dashboard

**Files:**
- Create: `pages/DashboardPage.tsx`, `TaskListPage.tsx`, `TaskDetailPage.tsx`
- Create: `stores/task.ts`（从 archive pinia 逻辑迁移）
- Create: `components/tasks/*`（按需：TaskItem, TaskForm 等）
- Modify: `routes/index.tsx` 替换 placeholder

**Interfaces:**
- 使用 `api/task.ts` 现有函数名；状态筛选与 archive 一致

- [ ] **Step 1: 对照 archive**

Read: `DashboardView.vue`, `TaskListView.vue`, `TaskDetailView.vue`, `stores/task.ts`, `components/Task*.vue`  
列出必须 API 调用清单，禁止漏「完成/删除/提醒」若 archive 有。

- [ ] **Step 2: 实现 task store + 三页面**

优先功能对等，Ant Design `Table`/`Form`/`Modal` 可替换 Element。

- [ ] **Step 3: 路由换成真实页面**

- [ ] **Step 4: 冒烟**

S2：创建任务 → 列表可见 → 详情。Dashboard 入口可点。

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(frontend): port dashboard and task list/detail pages"
```

---

## Task 5: P3 — 日历 + 个人设置（SMTP / LLM）

**Files:**
- Create: `pages/CalendarPage.tsx`, `pages/SettingsPage.tsx`
- Use: `api/notifications.ts`（`getSmtpConfig`, `updateSmtpConfig`, `getLlmConfig`, `updateLlmConfig`, `testLlmConfig`, `sendTestEmail`）

- [ ] **Step 1: 日历**

对照 `CalendarView.vue`。允许 UI 简化，但必须：按日展示任务、能进详情、无任务/有任务可区分。不可缺路由。

- [ ] **Step 2: Settings**

对照 `SettingsView.vue` 个人 SMTP + 个人 LLM 区块：

- 密码/api_key：`type="password"`，已保存时 placeholder「留空不修改」
- 保存 payload：空密钥字段 **不要** 放入请求体（或传 `""` 由后端忽略——与 archive/后端约定一致）
- Fake LLM 可测连通

- [ ] **Step 3: 冒烟 S3/S4**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(frontend): calendar and personal settings (SMTP/LLM)"
```

---

## Task 6: P4 — 项目列表 / 详情大纲树 / 证据 / Agent

**Files:**
- Create: `pages/ProjectListPage.tsx`, `pages/ProjectDetailPage.tsx`
- Create: `components/project/OutlineTree.tsx`, `EvidencePanel.tsx`, `AgentChatDrawer.tsx`
- Create: `hooks/useCompanyContext.ts`（对照 archive）

- [ ] **Step 1: ProjectList**

`getProjects` / 公司上下文；点击进 `/projects/:id`。

- [ ] **Step 2: OutlineTree**

```tsx
// 可用 Ant Design Tree 或递归 ul
// data: TreeNodeDTO[] nested from getProjectTree(id, 'nested')
// onSelect(node) => 父组件加载 getNodeProgress / listNodeEvidence
```

对照 `ProjectDetailView.vue` 的选中与 `createNode`。

- [ ] **Step 3: Evidence + AgentChatDrawer**

上传/提交对齐 `collab.ts` API；聊天抽屉对齐 archive 组件行为。

- [ ] **Step 4: 错误态**

错误 project id：message.error，不白屏。

- [ ] **Step 5: 冒烟 S5**

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(frontend): project list/detail outline tree, evidence, agent chat"
```

---

## Task 7: P5 — 公司设置

**Files:**
- Create: `pages/CompanySettingsPage.tsx`

- [ ] **Step 1: 对照** `CompanySettingsView.vue`：公司 SMTP、LLM、登录方式等已存在字段

- [ ] **Step 2: 权限**

非管理员写操作：展示后端 403 message，不静默。

- [ ] **Step 3: 冒烟 S7**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(frontend): company settings SMTP/LLM"
```

---

## Task 8: P6 — React Flow 双视图

**Files:**
- Create: `components/project/ProjectFlowView.tsx`
- Create: `utils/treeLayout.ts`
- Modify: `pages/ProjectDetailPage.tsx` — Tabs：`大纲` | `关系图`（默认 **大纲**）
- Depend: `npm install @xyflow/react @dagrejs/dagre` 与 `@types` 若需要

**Interfaces:**
- `treeToFlow(nodes: TreeNodeDTO[]): { nodes: Node[]; edges: Edge[] }`
- 点选 Flow 节点 → 与大纲同一 `selectedId` / `selectNode`

- [ ] **Step 1: 布局工具**

```typescript
// frontend/src/utils/treeLayout.ts
import dagre from '@dagrejs/dagre'
import type { TreeNodeDTO } from '@/types/collab'

export type FlowNodeData = { title: string; status?: string; raw: TreeNodeDTO }

function walk(
  nodes: TreeNodeDTO[],
  parentId: string | null,
  acc: { id: string; parentId: string | null; label: string; status?: string; raw: TreeNodeDTO }[],
) {
  for (const n of nodes) {
    const id = String(n.id)
    acc.push({
      id,
      parentId,
      label: n.title,
      status: n.progress_json?.status,
      raw: n,
    })
    if (n.children?.length) walk(n.children, id, acc)
  }
  return acc
}

export function layoutTree(nested: TreeNodeDTO[]) {
  const flat = walk(nested, null, [])
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60 })
  flat.forEach((n) => g.setNode(n.id, { width: 180, height: 48 }))
  flat.forEach((n) => {
    if (n.parentId) g.setEdge(n.parentId, n.id)
  })
  dagre.layout(g)
  const nodes = flat.map((n) => {
    const p = g.node(n.id)
    return {
      id: n.id,
      position: { x: p.x - 90, y: p.y - 24 },
      data: { title: n.label, status: n.status, raw: n.raw } satisfies FlowNodeData,
      style: { width: 180 },
    }
  })
  const edges = flat
    .filter((n) => n.parentId)
    .map((n) => ({ id: `${n.parentId}-${n.id}`, source: n.parentId!, target: n.id }))
  return { nodes, edges }
}
```

- [ ] **Step 2: ProjectFlowView**

使用 `@xyflow/react` 的 `ReactFlow`, `Controls`, `Background`；`fitView`；`onNodeClick` 回调 `onSelect(raw)`。

空树 / 加载失败：Empty / Alert，不白屏。

- [ ] **Step 3: 双视图联动**

同一 `selected` state；大纲与 Flow 切换后选中保持。

- [ ] **Step 4: 冒烟 S6**（≥2 层子树可读）

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(frontend): React Flow project tree dual view with dagre layout"
```

---

## Task 9: 主题 / 音效 / 边角（与 archive 对齐的残留）

**Files:**
- Create: `hooks/useTheme.ts` 等（若 Settings/Dashboard 依赖）

- [ ] **Step 1: 对照 archive composables，迁移 Settings 仍引用的主题切换**

- [ ] **Step 2: 若时间盒紧张：主题可简化为 antd `algorithm` + class dark，但 §6.4 主题项须可勾**

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(frontend): theme hooks parity with archive settings"
```

---

## Task 10: P7 — Vitest 单元测试

**Files:**
- Modify: `frontend/package.json` scripts
- Create: `src/test/setup.ts`, `request.test.ts`, `auth.store.test.ts`, `RequireAuth.test.tsx`
- DevDep: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`

- [ ] **Step 1: 配置**

```json
// package.json scripts 片段
{
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc -b --noEmit"
}
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

- [ ] **Step 2: 测试 getErrorMessage / setToken 行为**

```typescript
// src/test/request.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getErrorMessage, setToken, getToken } from '@/api/request'

describe('request helpers', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  it('setToken/getToken', () => {
    setToken('abc')
    expect(getToken()).toBe('abc')
    setToken(null)
    expect(getToken()).toBeNull()
  })
  it('getErrorMessage reads detail.message', () => {
    const err = {
      response: { data: { detail: { message: '无权操作' } } },
    }
    expect(getErrorMessage(err)).toBe('无权操作')
  })
})
```

- [ ] **Step 3: RequireAuth 测试**

无 token 时渲染 Navigate（可用 `MemoryRouter`）。

- [ ] **Step 4: 跑测试**

```bash
cd frontend && npm test && npm run typecheck && npm run build
```

Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git commit -am "test(frontend): vitest for request helpers and auth guard"
```

---

## Task 11: P7 — Playwright E2E（§6.11）

**Files:**
- Create: `frontend/playwright.config.ts`, `frontend/e2e/smoke.spec.ts`, `frontend/e2e/helpers/auth.ts`
- Script: `test:e2e`

- [ ] **Step 1: 安装**

```bash
cd frontend
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: 配置**

```typescript
// frontend/playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173'

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
```

- [ ] **Step 3: 用例覆盖 S1–S8 等价路径**

使用环境变量：

- `E2E_USER` / `E2E_PASSWORD`（staging 预置账号）
- 或 setup 里调用注册 API（若开放注册）

```typescript
// e2e/smoke.spec.ts 结构示例
import { test, expect } from '@playwright/test'

test.describe('WorkTodo smoke', () => {
  test('login to dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/用户|账号|用户名/i).fill(process.env.E2E_USER!)
    await page.getByLabel(/密码/i).fill(process.env.E2E_PASSWORD!)
    await page.getByRole('button', { name: /登录/i }).click()
    await expect(page).toHaveURL(/dashboard/)
  })
  // ... 创建任务、日历、设置 LLM Fake、项目大纲+Flow、登出
})
```

选择器以最终 UI 的 `aria-label` / 中文按钮为准；实现页面时为 E2E 稳定加可访问名。

- [ ] **Step 4: 本地对 dev 或 preview 跑通**

```bash
# 后端 + frontend build preview 或 dev
set PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173
cd frontend && npx playwright test
```

Expected: 全绿；失败不得靠 retries 掩盖 flaky。

- [ ] **Step 5: Commit**

```bash
git commit -am "test(frontend): Playwright smoke e2e suite for gate S1-S8"
```

---

## Task 12: P7 — Docker、文档、门禁模板、回滚说明

> **状态（2026-07-20）**：实现中 — Docker 文件、文档栈 Vue→React、门禁模板与回滚说明已落地；**生产切流未做**（待 G6–G10 / soak）。

**Files:**
- Modify: `Dockerfile.prod` / `docker-compose*.yml` / nginx 若写死 Vue 路径
- Modify: `Claude.md`, `docs/06-部署运维指南.md`, `docs/项目逻辑文档.md`（技术栈 Vue→React）
- Create: `docs/superpowers/acceptance/2026-07-20-react-rewrite-gates.md`
- Modify: spec 状态 → 实现中/已实现（合入后）

- [ ] **Step 1: Docker 前端构建**

确认：

```dockerfile
# 伪代码：WORKDIR frontend && npm ci && npm run build && 拷贝 dist
```

构建：

```bash
docker compose -f docker-compose.yml build frontend
```

Expected: 成功。

- [ ] **Step 2: 产物密钥抽查**

```bash
# 在 dist 内搜索
rg -i "sk-|smtp_password|SECRET_KEY" frontend/dist || true
```

Expected: 无真实密钥。

- [ ] **Step 3: 门禁勾选模板**

创建 `docs/superpowers/acceptance/2026-07-20-react-rewrite-gates.md`，复制 spec §6.1–6.12 与 G1–G10 为 checkbox，留 SHA / digest / soak 时间字段。

- [ ] **Step 4: 回滚步骤成文**

写明：compose 指回 Vue 镜像 digest 或从 `frontend-vue-archive` 构建旧前端的命令。

- [ ] **Step 5: 回滚演练（G6）**

在 staging：切到旧前端 → 验证登录 → 切回 React。笔记记录。

- [ ] **Step 6: Commit**

```bash
git commit -am "docs(frontend): React stack, docker, gates template, rollback procedure"
```

---

## Task 13: P8 — Staging 部署 + Playwright 对 soak 版 + 48h soak

**Files:**
- 验收笔记：`docs/superpowers/acceptance/2026-07-20-react-rewrite-gates.md` 填空

- [ ] **Step 1: 部署 React 生产构建到 staging**

记录：`git rev-parse HEAD` 与镜像 digest。

- [ ] **Step 2: 对该版本跑 Playwright**

```bash
set PLAYWRIGHT_BASE_URL=https://staging.example.com
cd frontend && npx playwright test
```

Expected: 全绿；报告路径写入验收笔记。

- [ ] **Step 3: §6.10 手工 S1–S8 勾选**

- [ ] **Step 4: Soak 开始**

记录开始时间。连续 ≥48h。期间阻断故障 → 修复后按 spec 重算 48h 或 24h 规则。

- [ ] **Step 5: Soak 结束**

记录结束时间、故障列表（无则写「无」）。

- [ ] **Step 6: G10 签核**

负责人书面同意生产切流。

- [ ] **Step 7: 生产切流**

切换镜像；之后 **48h** 加强观察；主路径挂则立即回滚。

- [ ] **Step 8: 收尾 commit**

```bash
git commit -am "docs: record staging soak and production cutover for React frontend"
# 合并策略按团队流程；未满足 G6-G10 不得宣称生产已切
```

---

## 建议 Commit 节奏

| Task | 消息摘要 |
|------|----------|
| 0 | archive Vue |
| 1 | scaffold React |
| 2 | request + api |
| 3 | auth + router |
| 4 | tasks |
| 5 | calendar + settings |
| 6 | projects outline |
| 7 | company settings |
| 8 | react flow |
| 9 | theme |
| 10 | vitest |
| 11 | playwright |
| 12 | docker/docs |
| 13 | soak notes |

---

## Spec 覆盖自检

| Spec 项 | Task |
|---------|------|
| 归档 `frontend-vue-archive` + tag | T0 |
| React 栈 / 目录 | T1–T3 |
| 路由对等 + redirect | T3 |
| 登录注册鉴权 | T3 |
| 任务 / Dashboard | T4 |
| 日历 | T5 |
| 个人 SMTP/LLM | T5 |
| 项目大纲 / 证据 / Agent | T6 |
| 公司设置 | T7 |
| React Flow 双视图 | T8 |
| Vitest §6.9 | T10 |
| Playwright §6.11 | T11 |
| Docker / 文档 / 回滚演练 | T12 |
| Staging 48h §6.12 / 切流 G6–G10 | T13 |
| 不改 backend / 小程序 | 全局约束 |
| 密钥不进产物 | T12 Step 2 |

## Placeholder 扫描

- 无 TBD 门禁；E2E 选择器依赖最终文案处已要求加可访问名
- `loginApi` 字段名要求以 archive 为准，避免臆造

---

## 执行方式（完成后由用户选择）

Plan complete and saved to `docs/superpowers/plans/2026-07-20-frontend-react-rewrite.md`.

**Two execution options:**

1. **Subagent-Driven（推荐）** — 每任务新 subagent，任务间审查  
2. **Inline Execution** — 本会话按 executing-plans 批量推进并设检查点  

**Which approach?**
