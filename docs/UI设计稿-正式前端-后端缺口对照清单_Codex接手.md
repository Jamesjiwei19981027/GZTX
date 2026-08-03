# UI 设计稿 ↔ 正式前端 ↔ 后端缺口对照清单（Codex 接手）

> **用途**：给后续 Agent / Codex 接手的唯一对照真源。  
> **原则**：每一行 = 设计稿一屏/一块能力 → 正式前端文件 → 实现状态 → 后端现状/待补。  
> **仓库根**：`E:\workspace\gongzuotix`  
> **更新日期**：2026-08-03  

---

## 0. 目录与运行真源（先读）

| 角色 | 路径 | 说明 |
|------|------|------|
| **原始 Stitch 设计稿** | `UI/stitch_smart_task_manager/` | 8 屏 HTML + PNG + DESIGN.md，**验收对照以这里为准** |
| **正式 Web 真源** | `frontend/` | Docker / Nginx 正在跑的 UI（已从 Remix 迁入） |
| Remix 历史目录 | `remix-flow---productivity-&-task-management/` | 已迁出，仅指针 README，**勿再改** |
| 旧 Ant Design Web | `frontend-react-archive/` | 归档，部分能力（SMTP/LLM 配置页）可对照迁移 |
| 后端 | `backend/` | FastAPI，Docker 宿主 `http://127.0.0.1:8010` |
| Flutter APP | `app/` | **Android Debug APK**；默认 WebView 加载 Nginx Web（`http://10.0.2.2/`） |
| 壳层 API 文档（旧） | `frontend/BACKEND_GAP.md` | 融合期缺口，本文件覆盖并细化 |

### 日常启动

```powershell
cd E:\workspace\gongzuotix
docker compose up -d
# Web: http://127.0.0.1 或 :5173
# API: http://127.0.0.1:8010/docs

# APP（模拟器）
cd app
flutter build apk --debug --dart-define=WEB_BASE_URL=http://10.0.2.2/
adb -s emulator-5554 install -r build\app\outputs\flutter-apk\app-debug.apk
adb -s emulator-5554 shell am start -n com.worktodo.worktodo_app/.MainActivity
```

测试账号：`e2e_user` / `e2e-password-123`（邮箱+手机已验证）。

### 状态图例

| 标记 | 含义 |
|------|------|
| ✅ 已实现 | 正式前端有对等 UI，且已接后端（或纯前端即可） |
| 🟨 部分实现 | 有页面/壳，但设计稿模块缺失或未接后端 / 用 mock |
| ❌ 未实现 | 设计稿有，正式前端无对等能力 |
| 🔧 后端已有·前端未接 | API 在 `backend/` 已存在，缺前端接线 |
| 🆕 需补后端 | 产品要做则需新 API/表；或刻意不做需改文案 |

---

## 1. 设计稿文件清单（逐屏 ID）

| ID | 设计稿路径 | 预览图 | 设计标题（HTML `<title>`） |
|----|------------|--------|---------------------------|
| D0 | `UI/stitch_smart_task_manager/productivity_flow/DESIGN.md` | — | Focus Blue 设计系统 |
| D1 | `UI/stitch_smart_task_manager/flow_productivity_1/code.html` | `.../screen.png` | 快速创建任务 |
| D2 | `UI/stitch_smart_task_manager/flow_productivity_2/code.html` | `.../screen.png` | 通知提醒设置 |
| D3 | `UI/stitch_smart_task_manager/flow_productivity_3/code.html` | `.../screen.png` | 收件箱 |
| D4 | `UI/stitch_smart_task_manager/flow_productivity_4/code.html` | `.../screen.png` | 仪表板 |
| D5 | `UI/stitch_smart_task_manager/flow_productivity_5/code.html` | `.../screen.png` | 设置 |
| D6 | `UI/stitch_smart_task_manager/flow_productivity_6/code.html` | `.../screen.png` | 研发协作看板 |
| D7 | `UI/stitch_smart_task_manager/flow_productivity_7/code.html` | `.../screen.png` | 日历 |
| D8 | `UI/stitch_smart_task_manager/flow_productivity_8/code.html` | `.../screen.png` | Team Chat |

**设计稿导航骨架（多数屏侧栏）**：Dashboard / My Tasks / Calendar / Settings（早期 Stitch 较简）。  
**正式前端导航（已扩展）**：见 `frontend/src/components/Sidebar.tsx` — dashboard、people-axis、tasks、kanban、calendar、reports、team、messages、inbox、settings。

---

## 2. 逐屏对照总表（设计 → 前端 → 后端）

### D0 · 设计系统

| 设计能力 | 正式前端 | 状态 | 后端 |
|----------|----------|------|------|
| Focus Blue `#0058be`、中性面、Inter、圆角、280px 侧栏 | `frontend` Tailwind / theme；`App.tsx` | ✅ | 不需要 |
| Task 列表顶 Success 进度条 | `MyTasksView.tsx` | ✅ | — |
| 移动端底部 FAB 新建任务 | `Sidebar.tsx` 底栏中心钮 | ✅ | — |
| Checkbox 完成 → Success Green + 删除线 | 各任务列表有完成态 | 🟨 视觉未严格跟 token | — |

---

### D1 · 快速创建任务（模态）

| # | 设计稿模块 | 正式前端路径 | 状态 | 后端现状 | Codex 待办 |
|---|------------|--------------|------|----------|------------|
| D1-01 | 模态：任务内容 textarea | `frontend/src/components/modals/NewTaskModal.tsx` | ✅ | `POST /tasks` | — |
| D1-02 | 备注细节 | 同上 description | ✅ | `description` | — |
| D1-03 | 优先级选择 | 同上 | ✅ | `priority` 0/1/2 | — |
| D1-04 | 截止日期 | 同上 dueDate/dueTime | ✅ 日期与时间合并写入 `due_date` | `due_date` | — |
| D1-05 | **来源条：微信会话名 +「查看原文」** | 无 | ❌ | 🆕 无「微信来源任务」模型 | 若做：任务 `origin_meta` / `source_channel` + 查看原文 API |
| D1-06 | **备注「自动提取」徽章（从聊天抽）** | 无 | ❌ | 🆕 LLM 抽取 | 可接既有 LLM 配置后做 `POST /tasks/extract-from-chat` |
| D1-07 | 页脚「添加附件」 | `NewTaskModal.tsx` 文件选择 + 创建后上传 | ✅ | `POST /tasks/{id}/attachments` | 部分附件失败会明确提示 |
| D1-08 | 页脚「添加标签」快捷 | 标签快捷条 + `tag_ids` | ✅ | `/tags` + create `tag_ids` | — |
| D1-09 | （正式多出）状态/类别/负责人/子任务 | `NewTaskModal.tsx` | ✅ 状态/分类真实落库；未伪造个人指派人/子任务 | 分类/标签 API；个人任务无多指派人 | 项目成员指派仍按项目人轴口径处理 |
| D1-10 | 创建 / 取消 | 同上 → `App.handleCreateTask` | ✅ 标题、状态、分类、标签、项目、日期时间会落库；附件创建后上传 | `POST /tasks` + attachments | 微信来源/LLM 抽取仍延期 |

**API 层**：`frontend/src/api/backend.ts` → `createTask` 已发送 title/description/priority/status/category/tag/project/due_date 等字段；附件走创建后的 `POST /tasks/{id}/attachments`。

---

### D2 · 通知提醒设置

| # | 设计稿模块 | 正式前端路径 | 状态 | 后端现状 | Codex 待办 |
|---|------------|--------------|------|----------|------------|
| D2-01 | **独立「通知提醒设置」整页** | 塞进 `SettingsView.tsx` 通知 Tab | 🟨 | — | 可拆独立 View 或路由 |
| D2-02 | 邮件提醒开关 | Settings 通知勾选 | ✅ 云端合并保存（不覆盖 SMTP 凭证） | 用户 `notify_pref` / SMTP | — |
| D2-03 | 浏览器/桌面推送开关 | Settings push/desktop | 🟨 偏好已云同步，浏览器订阅授权仍需接线 | `/notifications/subscribe` VAPID | 接 Web Push 订阅流程 |
| D2-04 | **微信提醒（服务号）开关** | Settings 微信开关 | 🟨 偏好已云同步，服务号绑定/模板消息沿用现有后端 | wx / notify 通道 | 绑定流程仍需产品配置 |
| D2-05 | **静音时段（起止时间）** | Settings 时间控件 | ✅ | `notify_pref.quiet_hours` | — |
| D2-06 | **周末全天免打扰** | Settings 复选框 | ✅ | `notify_pref.weekend_mute` | — |

**对照旧实现**：`frontend-react-archive/src/pages/SettingsPage.tsx`、`backend/app/api/v1/notifications.py`。

---

### D3 · 收件箱（邮件式左右分栏）

| # | 设计稿模块 | 正式前端路径 | 状态 | 后端现状 | Codex 待办 |
|---|------------|--------------|------|----------|------------|
| D3-01 | 左邮件列表 + 右阅读窗 | `InboxView.tsx` 协作通知列表 + 详情窗 | 🟨 **产品口径已明确为协作收件箱，不伪装 Gmail** | 协作通知：`GET /notifications/collab` ✅ | 外部邮件 Inbox 不在本期范围 |
| D3-02 | 筛选：全部 / 未读 / 需回复 | `InboxView.tsx` | ✅ | 协作通知 `read` + payload | — |
| D3-03 | 顶栏搜索邮件 | `InboxView.tsx` 通知搜索 | ✅ | 客户端筛选 | — |
| D3-04 | 归档 / 删除 / 标未读 | 标已读/全部已读 | 🟨 仅协作通知读状态；无外邮归档删除 | `mark-read` / `read-all` | — |
| D3-05 | 正文、发件人、收件组 | 无 | ❌ | 🆕 | — |
| D3-06 | 附件 PDF 卡片 | 无 | ❌ | 🆕 / 证据文件可部分复用 | — |
| D3-07 | 底部快捷回复 | 无 | ❌ | 🆕 | — |
| D3-08 | 「转为任务」CTA | 列表有，接 `NewTaskModal` | 🟨 | `POST /tasks` | 保留；阅读窗语境缺失 |
| D3-09 | （正式另做）集成列表 + org-sync | `InboxView.tsx` + `api/shell.ts` | 🟨 | `GET /companies/{id}/integrations`（常需超管） | 权限文案；普通成员空列表属预期 |

**结论**：设计稿是 **Gmail 式 Inbox**；本期正式前端明确采用 **Collab 通知 + 集成配置**，不伪装外部 Gmail/IMAP。外部邮件正文、归档删除和快捷回复列为后续产品范围。

---

### D4 · 仪表板

| # | 设计稿模块 | 正式前端路径 | 状态 | 后端现状 | Codex 待办 |
|---|------------|--------------|------|----------|------------|
| D4-01 | 问候 + 高优计数 | `DashboardView.tsx` | ✅ | 任务列表聚合 | 可选 `GET /tasks/stats` |
| D4-02 | 统计四卡 | 同上 | ✅ | 同上 | — |
| D4-03 | 周进度环 | 同上 | ✅ | 本地算 | — |
| D4-04 | 即将到期列表 | 同上 | 🟨 相对「X 小时」文案弱 | 任务 `due_date` | 前端文案 |
| D4-05 | 最近动态 | `App.tsx` 仅显示真实项目 activity；无数据为空 | 🟨 选中具体项目才有真实数据，全盘不注入演示动态 | `GET /projects/{id}/activity` | 全盘聚合 activity 可后续补 |
| D4-06 | （正式多出）进人轴 Banner | `DashboardView` / 导航 | ✅ 超出设计稿 | 人轴 API | — |

---

### D5 · 设置

| # | 设计稿模块 | 正式前端路径 | 状态 | 后端现状 | Codex 待办 |
|---|------------|--------------|------|----------|------------|
| D5-01 | 个人资料 | `SettingsView.tsx` | ✅ | `PUT /users/me` | — |
| D5-02 | 头像更换 | `SettingsView.tsx` 头像 URL | ✅ URL 持久化；尚未做文件上传 | 用户 avatar 字段 | 文件上传可后续补 |
| D5-03 | 通知偏好 | 见 D2 | 🟨 | 见 D2 | — |
| D5-04 | 任务默认优先级/分类 | Settings | 🟨 本地 settings | 无专用云端（可放 ui-prefs） | 可选扩 prefs |
| D5-05 | 外观：浅/深 + 主题色 | Settings + `App` `putUiPrefs` | ✅ | `GET/PUT /users/me/ui-prefs` | — |
| D5-06 | 语言 | Navbar + prefs | ✅ | ui-prefs | — |
| D5-07 | **安全设置** | `SettingsView.tsx` 改密表单 | ✅ | `PUT /users/me/password` | — |
| D5-08 | **账单与订阅** | 无 | ❌ | 🆕（或公司 license） | 产品决定；可隐藏入口 |
| D5-09 | **数据与隐私** | 无 | ❌ | 🆕 | 或静态页 |
| D5-10 | 设置页内退出登录 | `SettingsView.tsx` + `Navbar` | ✅ | `POST /auth/logout` | — |
| D5-11 | 危险区删除账号 | 有演示按钮？ | 🟨 | 🆕 一般无删号 API | 确认产品 |

**登录/注册（设计稿无独立屏，产品必需，已补）**：

| # | 能力 | 前端 | 状态 | 后端 |
|---|------|------|------|------|
| AUTH-01 | 密码登录 | `LoginGate.tsx` | ✅ | `POST /auth/login` |
| AUTH-02 | 验证码登录 | 同上 | ✅ | `POST /auth/login-code` + send-code |
| AUTH-03 | 邮箱注册+邮箱码 | 同上 | ✅ | `POST /auth/register` + send-code |
| AUTH-04 | 注册可选手机+短信码 | 同上 | ✅ | 同上 |
| AUTH-05 | 登录后双验证门 | `VerifyGate.tsx` | ✅ | `/users/me/verification*` |

---

### D6 · 研发协作看板

| # | 设计稿模块 | 正式前端路径 | 状态 | 后端现状 | Codex 待办 |
|---|------------|--------------|------|----------|------------|
| D6-01 | 三列：待办/进行中/已完成 | `KanbanView.tsx` | ✅ | 任务 status 0/1/2 | — |
| D6-02 | 卡片拖拽改状态 | 同上 → `App.handleUpdateTaskStatus` | ✅ | `PUT/PATCH /tasks` | — |
| D6-03 | 卡片标签/优先级/负责人头像 | 部分有；负责人常空 | 🟨 | 个人任务无 assignee 模型 | 产品：看板=个人任务 or 项目任务 |
| D6-04 | 列内「+」新建 | 有 | ✅ | createTask | — |
| D6-05 | **顶部成员头像叠层 +N** | `KanbanView.tsx` | ✅ | `GET /projects/{id}/members` | — |
| D6-06 | **顶部筛选按钮** | 搜索/优先级/分类筛选 | ✅ | 前端筛选 | — |
| D6-07 | 「正常运行 · 最后更新」状态条 | `KanbanView.tsx` | ✅ 无活动时明确显示暂无记录 | activity 时间 | — |
| D6-08 | 卡片 drag_indicator | 整卡拖，无拖柄视觉 | 🟨 | — | UI |
| D6-09 | 已完成「完成于昨日」 | 弱 | 🟨 | `completed_at` | 前端相对时间 |
| D6-10 | 看板列配置 / WIP | 无（刻意） | ❌ 刻意不做 | 🆕 若要做列配置表 | 保持三列即可 |

---

### D7 · 日历

| # | 设计稿模块 | 正式前端路径 | 状态 | 后端现状 | Codex 待办 |
|---|------------|--------------|------|----------|------------|
| D7-01 | 月网格 + 日 pill | `CalendarView.tsx` | ✅ 真翻月（本地日期安全） | 任务列表即可 | — |
| D7-02 | 月/周/日切换 | `CalendarView.tsx` | ✅ 月/周/日均渲染 | 不需要专用 API | — |
| D7-03 | 右侧当日日程 | 有列表 | 🟨 少时段轴 | due_date | 时间轴 UI |
| D7-04 | 效率条 / 今日展望 | 部分有 | 🟨 | 本地算 | — |
| D7-05 | 任务拖到日期格 | `CalendarView.tsx` HTML DnD | ✅ | `PUT /tasks` 改 due_date | — |

---

### D8 · 团队沟通（三栏 IM）

| # | 设计稿模块 | 正式前端路径 | 状态 | 后端现状 | Codex 待办 |
|---|------------|--------------|------|----------|------------|
| D8-01 | 发帖 / 点赞 | `MessagesView.tsx` | ✅（有公司时；无公司显示提示） | shell: channels/messages/like | — |
| D8-02 | 频道切换 + 搜索 | 同上 | 🟨 固定 3 频道 | `GET /companies/{id}/channels` | — |
| D8-03 | **三栏：会话 \| 对话 \| 右栏** | `MessagesView.tsx` | ✅ 右栏成员/在线状态/项目任务拼现有 API | channels + members/presence + tasks | 文件 Tab 仍待后端附件模型 |
| D8-04 | 群组 vs 直接消息分区 + 预览行 | 弱（频道按钮） | ❌ | 🆕 真私信会话表；现 `direct` 只是频道 key | 产品拍板 |
| D8-05 | 顶栏成员叠层 / 在线人数 | `MessagesView.tsx` 右栏成员与状态 | ✅ | members + presence | — |
| D8-06 | **语音 / 视频通话** | 无 | ❌ | 🆕 | 通常外包 WebRTC；可砍 |
| D8-07 | 消息内文件卡片 | 无 | ❌ | 🆕 消息附件；或复用 storage | — |
| D8-08 | 系统活动气泡 | 无 | ❌ | 可拼 activity | 前端 |
| D8-09 | 输入区表情 / 附件 | 无 | ❌ | 🆕 附件 | — |
| D8-10 | 右栏 Tab：文件 / 任务 / 关于 | 无 | ❌ | 🆕 + 🔧 项目任务列表 | — |
| D8-11 | 最近分享文件 + 下载 | 无 | ❌ | 🆕 | — |
| D8-12 | 固定链接（Figma 等） | 无 | ❌ | 🆕 `pinned_links` | — |

**API**：`frontend/src/api/shell.ts`；后端 `backend/app/api/v1/shell.py`、`models/shell.py`。

---

## 3. 设计稿没有、正式前端额外有的能力（勿当「设计欠账」）

| 能力 | 前端路径 | 后端 | 状态 |
|------|----------|------|------|
| **人轴责任链**（产品核心） | `PeopleAxisView.tsx` | tree/nodes/move/evidence/layout/final-owner/axis-audit | ✅ 选中真实项目；`all` 显示选择项目提示，不注入 mock |
| 报表 Reports | `ReportsView.tsx` | `GET /tasks/stats/trend`；KPI 本地 | 🟨 |
| 团队页 Team | `TeamView.tsx` | members/invitations/presence | ✅ 需选项目 |
| 通知中心弹层 | `NotificationsModal.tsx` | `/notifications/collab*` | ✅ |
| 任务详情抽屉 | `TaskDetailDrawer.tsx` | update/delete task | 🟨 无人轴节点关联编辑 UI |
| 我的任务列表 | `MyTasksView.tsx` | `/tasks*` | ✅ |

### 人轴（额外）后端/前端残留

| # | 项 | 前端 | 状态 | 后端 | Codex |
|---|----|------|------|------|-------|
| PA-01 | 读树/写人/事项/挂载/证据 | `PeopleAxisView.tsx` | ✅ projectId 真实时 | nodes API | — |
| PA-02 | 布局偏移 | 拖拽 → `putNodeLayout` | ✅ | `PUT /nodes/{id}/layout` | — |
| PA-03 | 终责轴向偏移 | 滑条 | ✅ | `PUT .../final-owner-position` | — |
| PA-04 | 人轴审计 | 按钮 `runAxisAudit` | ✅ 启发式非 Gemini | `POST .../axis-audit` | 勿接前端 Gemini |
| PA-05 | 全盘概览人轴 | `PeopleAxisView.tsx` 强制选择真实项目 | 🟨 不再注入 mock；跨项目聚合仍未做 | 🆕 跨项目树 | 后续做聚合或保持项目级 |
| PA-06 | 任务 ↔ 节点关联编辑 | `linkedNodeId` 只读映射 | 🟨 | 🔧 `Task.project_node_id` | Drawer UI |
| PA-07 | 证据 kind/URL | 已提交 | ✅ | EvidenceSubmit 扩展字段 | — |

---

## 4. 后端缺口汇总（按优先级，给 Codex 排期）

### P0 — 设计验收阻塞或体验假数据

1. **去掉 / 收敛 mock 回退（已完成）**：启动失败不注入 mock 任务，人轴 `all`、Messages 无公司显示空状态和可操作提示，`TEAM_MEMBERS` 已从运行路径移除。
2. **日历真翻月 + 周/日视图（已完成）**：`CalendarView.tsx` 使用本地日期工具和真实任务数据。
3. **Settings 资料保存与通知云同步（已完成）**：`PUT /users/me` 与 `notify_pref` 合并保存，不覆盖 SMTP/LLM 凭证。
4. **D3 产品口径（已确定）**：本期为协作收件箱；真邮件 Inbox 不在范围。

### P1 — 设计稿明确有、需前后端一起做

| 优先级 | 项 | 后端动作 | 前端动作 |
|--------|----|----------|----------|
| P1 | D1 微信来源建任务 | `source_meta` / 原文链接 | NewTaskModal 来源条 |
| P1 | D2 静音时段 / 周末免打扰 / 微信渠道 | `notify_pref` 扩展 | Settings 通知 Tab 已接；Web Push 订阅/微信绑定延期 |
| P1 | D8 IM 三栏 + 附件 + 固定链接 | 三栏成员/presence/任务已接；附件、pinned_links、真私信延期 | MessagesView 已重做布局 |
| P1 | D6 看板成员叠层+筛选 | 复用 members | Kanban 头栏已接 |
| P1 | D5 安全设置（改密） | 已有改密 API | Settings 入口已接 |

### P2 — 后端已有、主要接线

| 项 | API | 前端文件 |
|----|-----|----------|
| 分类/标签 | `/categories`、`/tags` | NewTaskModal / 设置 |
| 任务附件 | `/tasks/{id}/attachments` | NewTaskModal / Drawer |
| 任务关联人轴节点 | `PUT /tasks` `project_node_id` | TaskDetailDrawer |
| 任务 stats KPI | `GET /tasks/stats` | ReportsView |
| 汇报策略 | `report-policies` / `reports/run` | ReportsView（设计稿无，可选） |
| SMTP / WebPush / 个人 LLM | `notifications.py` | 从 `frontend-react-archive` 迁页 |
| 集成列表权限提示 | `GET .../integrations` | InboxView |

### P3 — 刻意不做或低优先级（需写进产品说明）

| 项 | 建议 |
|----|------|
| 前端 Gemini | **禁止**；用 axis-audit |
| 看板列配置/WIP | 保持三列 |
| 语音/视频通话 | 砍或外链 |
| 账单订阅 | 无 SaaS 计费则隐藏 |

---

## 5. APP 端对照（给 Codex）

| 项 | 路径 / 事实 | 状态 |
|----|-------------|------|
| 工程 | `app/` Flutter | Android 为主 |
| 正式壳 | `app/lib/screens/web_shell_screen.dart` | WebView 加载 `WEB_BASE_URL`（默认 `http://10.0.2.2/`） |
| 入口开关 | `app/lib/config/api_config.dart` `USE_WEB_SHELL=true` | 旧原生壳：`USE_WEB_SHELL=false` |
| 产物 | `app/build/app/outputs/flutter-apk/app-debug.apk` | **是 APK，不是 iOS** |
| 包名 / 桌面名 | `com.worktodo.worktodo_app` / Manifest label **`WorkTodo`** | 应用抽屉查找此名 |
| 图标 | `app/android/app/src/main/res/mipmap-*/ic_launcher.png` | Flutter 默认图标，未品牌化 |
| LAUNCHER | `AndroidManifest.xml` 已声明 MAIN+LAUNCHER | 已安装；未必钉在 Home 第一屏 |
| iOS | 未出包 | 本机无完整 iOS 发布流程时不要假设有桌面图标 |

**设计稿落地在 APP 上的含义**：APP WebView = 与 `frontend/` 同一套页面；补设计缺口改 Web 即可同步到 APP（刷新 WebView）。

---

## 6. 关键文件索引（Codex 常用）

```
UI/stitch_smart_task_manager/          # 设计验收唯一对照
frontend/src/App.tsx                   # 壳、鉴权、VerifyGate、数据加载
frontend/src/components/LoginGate.tsx
frontend/src/components/VerifyGate.tsx
frontend/src/components/Sidebar.tsx
frontend/src/components/views/*.tsx    # 各业务页
frontend/src/components/modals/*.tsx
frontend/src/api/backend.ts
frontend/src/api/shell.ts
frontend/src/api/auth.ts
frontend/src/api/client.ts
frontend/src/data/mockData.ts          # 仅保留本地 UI 偏好；演示记录不在运行路径使用
backend/app/api/v1/auth.py
backend/app/api/v1/tasks.py
backend/app/api/v1/projects.py
backend/app/api/v1/nodes.py
backend/app/api/v1/shell.py
backend/app/api/v1/bindings.py         # collab notifications
backend/app/api/v1/notifications.py    # push/smtp/llm
backend/app/api/v1/users.py            # me + verification
app/lib/main.dart
app/lib/screens/web_shell_screen.dart
docker-compose.yml
docs/UI设计稿-正式前端-后端缺口对照清单_Codex接手.md  # 本文件
```

---

## 7. 建议 Codex 开工顺序

1. 读本文件 §2 全表，打开对应 `code.html` + `screen.png` 肉眼对一下。  
2. P0：去 mock、日历翻月、Settings `PUT /users/me`、D3 产品二选一。  
3. P1：按设计稿补 D1 来源 / D2 静音 / D8 三栏 / D6 头栏。  
4. P2：接线已有 API（分类标签附件、节点关联、stats、旧通知配置页）。  
5. 每完成一块：更新本文件对应行状态（✅/🟨/❌），并重启 Docker frontend（或依赖热重载）；APP WebView 刷新即可。  
6. **不要**用本机 `cargo`/`uvicorn` 顶替 Docker；**不要**前端直连 Gemini。

---

## 8. 快速矩阵（一页纸）

| 设计 ID | 正式前端主文件 | 总体 | 后端补什么 |
|---------|----------------|------|------------|
| D0 DESIGN | theme / Sidebar | ✅ | — |
| D1 建任务 | `NewTaskModal.tsx` | ✅/🟨 | 状态/分类/标签/附件已接；微信来源与 LLM 抽取暂不做 |
| D2 通知设置 | `SettingsView.tsx` | ✅/🟨 | 偏好云同步；Web Push 订阅与微信绑定仍待配置 |
| D3 收件箱 | `InboxView.tsx` | 🟨 | 明确为协作收件箱；外邮 API 不在本期 |
| D4 仪表板 | `DashboardView.tsx` | ✅/🟨 | 全盘 activity |
| D5 设置 | `SettingsView.tsx` | ✅/🟨 | users/me、改密已接；账单/删除账号无后端故意不展示 |
| D6 看板 | `KanbanView.tsx` | ✅/🟨 | 头栏 members + 筛选；无 WIP |
| D7 日历 | `CalendarView.tsx` | ✅/🟨 | 月/周/日和拖动已接，时段轴仍简化 |
| D8 聊天 | `MessagesView.tsx` | ✅/🟨 | 三栏/成员/presence/任务已接；附件/真私信/通话不在本期 |
| （+）人轴 | `PeopleAxisView.tsx` | ✅/🟨 | 全盘树；节点-任务关联 UI |
| （+）AUTH | Login/VerifyGate | ✅ | 已接 |

---

*文档结束。接手以本文件 + `UI/stitch_smart_task_manager/*/code.html` + `frontend/src` 三方对照为准。*
