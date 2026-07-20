# Web + Miniprogram UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.  
> **Task board ID:** `P0-FE-01` + `P1-FE-02`  
> **HTTP 真源:** [`2026-07-19-api-contracts-v1.md`](./2026-07-19-api-contracts-v1.md)（前端 **禁止**自创路径）  
> **TypeScript 类型:** 契约 §0 + §21 落点 `frontend/src/types/collab.ts`

**Goal:** 在现有 Vue3 Web 与微信小程序上交付项目管理树、材料提交、进度时间线、智能体对话台、公司/项目设置；小程序按场景分权限（可聊可更新、材料仅允许的场景）。

**Architecture:** Web 继续 Vue3 + Pinia + Tailwind + Element Plus；新增 `views/project/*`、`api/projects.ts` 等；路由挂 Sidebar。小程序新增 `pages/project-*`、`agent-chat`；材料上传仅小程序/Web，微信订阅消息通道不提供上传入口。所有文案简体中文。

**Tech Stack:** Vue3 · Vite · Pinia · TypeScript · Element Plus · 微信小程序原生 · 现有 `request.ts` 信封

## Global Constraints

- Spec: 主方案 §2.5、§7.3；逻辑文档 Web 页面范围扩展  
- API: 附录 F 全部由后端已实现为前提（可 mock 并行）  
- 禁止 UI 把 `tasks.status` 画成项目正式进度  
- 真源：`frontend/`、`miniprogram/`  
- 主 UI 是**树**不是甘特

**Prerequisites:** 后端 projects/nodes/evidence/agents API 可用或 MSW mock

---

## File Map

```
frontend/src/api/projects.ts
frontend/src/api/evidence.ts
frontend/src/api/agents.ts
frontend/src/api/companies.ts
frontend/src/types/collab.ts
frontend/src/stores/project.ts
frontend/src/stores/agentChat.ts
frontend/src/views/project/ProjectListView.vue
frontend/src/views/project/ProjectDetailView.vue
frontend/src/views/project/TreePanel.vue
frontend/src/views/project/NodeDetailPanel.vue
frontend/src/views/project/EvidenceSubmitDialog.vue
frontend/src/views/project/ProgressTimeline.vue
frontend/src/views/project/AgentChatDrawer.vue
frontend/src/views/company/CompanySettingsView.vue
frontend/src/router/index.ts
frontend/src/layouts/SidebarLayout.vue
miniprogram/pages/project-list/*
miniprogram/pages/project-tree/*
miniprogram/pages/agent-chat/*
miniprogram/pages/evidence-submit/*
miniprogram/utils/api-collab.js
```

---

### Task 1: 类型与 API 客户端

**Files:**
- Create: `frontend/src/types/collab.ts`
- Create: `frontend/src/api/projects.ts`
- Create: `frontend/src/api/evidence.ts`
- Create: `frontend/src/api/agents.ts`
- Create: `frontend/src/api/companies.ts`
- Test: `frontend` 若有 vitest 则加；否则手工 `npm run build` 类型检查

**Interfaces:** 与附录 F 对齐的 TypeScript 类型

- [ ] **Step 1: types**

```typescript
// frontend/src/types/collab.ts
export type ProjectStatus = 'draft' | 'active' | 'archived'
export type WorkItemStatus = 'not_started' | 'in_progress' | 'blocked' | 'pending_acceptance' | 'done'

export interface Project {
  id: number
  company_id: number
  name: string
  status: ProjectStatus
  pm_user_id: number | null
}

export interface TreeNodeDTO {
  id: number
  parent_id: number | null
  title: string
  node_type_key: string
  path: string
  progress_json: Record<string, unknown>
  allow_clear_text_progress: boolean
  children?: TreeNodeDTO[]
}

export interface EvidenceSubmitBody {
  summary_text: string
  structured?: Record<string, unknown>
  links?: { url: string; title: string; kind: string }[]
  file_ids?: number[]
  supersedes_package_id?: number | null
}

export interface AgentChatBody {
  project_id?: number
  scene: string
  session_id?: number | null
  message: string
  node_id?: number
}
```

- [ ] **Step 2: API wrappers 用现有 request**

```typescript
// frontend/src/api/projects.ts
import { request } from './request'

export function listProjects(companyId: number) {
  return request.get(`/projects`, { params: { company_id: companyId } })
}
export function createProject(body: { name: string; company_id: number }) {
  return request.post(`/projects`, body)
}
export function getTree(projectId: number) {
  return request.get(`/projects/${projectId}/tree`)
}
export function createNode(projectId: number, body: Record<string, unknown>) {
  return request.post(`/projects/${projectId}/nodes`, body)
}
// assignPm, members, moveNode, ...
```

- [ ] **Step 3: `npm run build` 无类型错误（可先 empty export）**  
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(web): collab API clients and types"
```

---

### Task 2: 路由与侧栏入口

**Files:**
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/layouts/SidebarLayout.vue`

- [ ] **Step 1: 增加路由**

```typescript
{
  path: '/projects',
  name: 'projects',
  component: () => import('../views/project/ProjectListView.vue'),
  meta: { requiresAuth: true, title: '项目' },
},
{
  path: '/projects/:id',
  name: 'project-detail',
  component: () => import('../views/project/ProjectDetailView.vue'),
  meta: { requiresAuth: true, title: '项目详情' },
},
{
  path: '/company/settings',
  name: 'company-settings',
  component: () => import('../views/company/CompanySettingsView.vue'),
  meta: { requiresAuth: true, title: '公司设置' },
},
```

- [ ] **Step 2: Sidebar 增加「项目」导航（中文）**；个人「任务」保留  
- [ ] **Step 3: 视觉检查 dev server**  
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(web): project routes and sidebar entry"
```

---

### Task 3: 项目列表与空项目创建

**Files:**
- Create: `frontend/src/views/project/ProjectListView.vue`
- Create: `frontend/src/stores/project.ts`

- [ ] **Step 1: 列表展示 name/status/PM；按钮「开空项目」**  
- [ ] **Step 2: 表单仅 name + 当前 company_id；成功跳转详情**  
- [ ] **Step 3: 错误用 Element Plus Message 中文  
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(web): project list and create empty project"
```

---

### Task 4: 树面板 + 节点详情

**Files:**
- Create: `TreePanel.vue`, `NodeDetailPanel.vue`, `ProjectDetailView.vue`

**UI 行为：**
- 左树右详情（中等屏）；小屏抽屉  
- 节点图标区分 scope / work_item / milestone  
- 展示 progress_json.status / percent  
- PM：右键或工具条 添加子节点 / 移动 / 指派  
- 成员：只读树 + 自己负责节点高亮

- [ ] **Step 1: TreePanel 递归或 el-tree + lazy**  

```vue
<!-- 关键结构 -->
<template>
  <el-tree
    :data="treeData"
    node-key="id"
    :props="{ label: 'title', children: 'children' }"
    @node-click="onSelect"
  />
</template>
```

- [ ] **Step 2: 创建节点对话框：类型、标题、截止、allow_clear_text、assignees**  
- [ ] **Step 3: 详情展示时间线入口与「更新进度」**  
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(web): project tree panel and node detail"
```

---

### Task 5: 材料提交与进度时间线

**Files:**
- Create: `EvidenceSubmitDialog.vue`, `ProgressTimeline.vue`
- Modify: `NodeDetailPanel.vue`

- [ ] **Step 1: 上传走 `POST /evidence/files` 再 submit package**  
- [ ] **Step 2: 展示 status：submitted/judging/adopted/rejected**  
- [ ] **Step 3: rejected 引导二次上传（supersedes_package_id）**  
- [ ] **Step 4: Timeline 调 `GET .../progress/records`，只读展示 source/event_type/after**  
- [ ] **Step 5: 文案明确「正式进度」vs 个人待办  
- [ ] **Step 6: Commit**

```bash
git commit -m "feat(web): evidence submit dialog and progress timeline"
```

---

### Task 6: 智能体对话抽屉

**Files:**
- Create: `AgentChatDrawer.vue`
- Create: `frontend/src/stores/agentChat.ts`

- [ ] **Step 1: 右侧 Drawer；绑定 project_id + node_id + scene**  
- [ ] **Step 2: 消息列表 + 输入；need_clarification 高亮问题列表**  
- [ ] **Step 3: actions 中 create_evidence_draft 成功则弹材料对话框**  
- [ ] **Step 4: 自创智能体管理简易页（列表/新建，校验 5 个错误提示）**  
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(web): agent chat drawer and basic agent management"
```

---

### Task 7: 公司设置（策略/绑定/成员）

**Files:**
- Create: `CompanySettingsView.vue`

- [ ] **Step 1: Tab：基本信息、登录方式、策略预设、存储/ASR、成员**  
- [ ] **Step 2: 非 super_admin 只读或 403 提示**  
- [ ] **Step 3: License 状态展示（pending/active/readonly）**  
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(web): company settings for policy and bindings"
```

---

### Task 8: 小程序页面

**Files:**
- Create: miniprogram pages + `app.json` 注册
- Create: `miniprogram/utils/api-collab.js`

**页面：**
1. `project-list` — 我的项目  
2. `project-tree` — 树浏览 + 节点摘要  
3. `agent-chat` — 聊/更新（可语音）  
4. `evidence-submit` — **仅**有上传能力的场景入口；从节点进入；**不**从纯微信客服消息深链强制上传  

- [ ] **Step 1: api-collab 封装 token 与 baseURL**  
- [ ] **Step 2: agent-chat 调 chat API；录音 → 上传临时文件 → ASR 或后端 wx media**  
- [ ] **Step 3: evidence-submit chooseMessageFile / chooseImage → files API**  
- [ ] **Step 4: 场景权限：无项目成员 → 提示；只读归档 → 禁用提交**  
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(miniprogram): project tree agent chat evidence pages"
```

---

### Task 9: 联调清单（手工）

- [ ] **Step 1: Web E2E-01 主路径点点点**（对照附录 L）  
- [ ] **Step 2: 小程序：语音更新不清空材料**  
- [ ] **Step 3: 微信 channel 无上传按钮**  
- [ ] **Step 4: `npm run build` 与小程序开发者工具无报错**  

---

## Spec Coverage

| 需求 | Task |
|------|------|
| 项目树主 UI | 4 |
| 材料/进度 | 5 |
| 智能体 | 6 |
| 公司设置 | 7 |
| 小程序分场景 | 8 |
| 个人任务保留 | 2 侧栏并存 |

**Handoff:** personal-compat-migration 的导入 UI 可挂项目详情「从个人待办导入」。
