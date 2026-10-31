# 首页 AI、趋势与日历实施计划

> **For agentic workers:** 使用 superpowers:executing-plans 在当前会话逐项实施。设计已获用户批准，无需再次确认。

**Goal:** Web 与正式 APP 同步优化首页，并修复全部项目快速添加及季度统计错误。

**Architecture:** 两端复用 React 首页组件和统计请求；后端统一自然周/月/季度、本地日期边界与任务可见权限。日程变更采用独立只读历史记录，提交后的汇报快照保持独立。

**Tech Stack:** React、TypeScript、FastAPI、SQLAlchemy、Alembic、pytest、Playwright、Android ADB。

**Spec:** 本会话已确认设计：AI → 三卡片 → 趋势 → 日历 → 项目进度 → 新建任务 → 重点待办。

## Global Constraints

- Web 与正式 APP 使用共享界面，五个主 Tab 不变；保留旧路由与返回。
- 保留共享工作区已有修改，不重置文件、不重建 AVD、不改 SDK。
- 原截止时间与修改历史保留，个人任务历史不可由他人读取。
- 趋势与首页相同项目范围，包含当前可见的个人任务；不使用失败时假数据。

### Task 1: 统计口径与日程历史

**Files:** backend/app/services/task_statistics.py；backend/app/api/v1/tasks.py、shell.py；backend/app/models/task_schedule.py；对应迁移与 backend/tests/test_home_statistics.py。

- [x] 添加回归：真实季度、跨时区边界、以前创建近期完成、被指派可见、项目与个人范围、他人隔离。
- [x] 执行 pytest 并观察预期失败。
- [x] 统一统计窗口：周一至今天、当月第一日至今天、季度第一日至今天，传 timezone_offset（东八区480）。query 使用 owner OR assignee 可见过滤，并应用 project_id OR personal。
- [x] 日程修改写 task_schedule_changes(old_due_date,new_due_date,actor_user_id)，GET /tasks/{id}/schedule-history 按任务可见性读取；包含批量顺延。
- [x] 验证保存、清除日期、重复相同日期不产生虚假历史，以及已有汇报快照不被改写。

### Task 2: 共享首页与两处 BUG

**Files:** frontend/src/components/WorkAssistantEntry.tsx、TaskTrendCard.tsx、WorkbenchOverview.tsx；DashboardView.tsx、MobileWorkScreens.tsx、MobileStatisticsScreen.tsx；api/shell.ts；App.tsx；MobileRouteOutlet.tsx；e2e/work-home-simplification.spec.ts。

- [x] 添加浏览器回归并观察缺失功能失败：日期单击与双击、过去日期、项目请求范围、季度保留、快速添加个人归属。
- [x] 创建共享 AI 入口：告诉 AI 最新进展、查看汇报；置于三卡片之前。
- [x] 创建共享周/月趋势图，放三卡片之后，可展开详细统计；请求失败提供重试，不显示旧范围数据。
- [x] 日期按钮使用稳定月份网格、touch-action: manipulation；同日期连续点击触发新增一次，单击仅选择。
- [x] 删除右上记录及快速记录栏；保留旧快捷键，将 QuickAddModal projectId 原样传入。
- [x] 统计详情真实请求季度，显示完整时段趋势，逾期作为状态子集呈现。
- [x] 日程编辑显示可展开的原时间与变更历史，两端共享。

### Task 3: 验证与交付

- [x] pytest 目标套件、Web TypeScript 检查、构建及相关 E2E。
- [x] 在现有 Android APP 与桌面 Web 真实后端验证首页顺序、周月切换、项目切换、双击日期新增保存、日程历史、返回。
- [x] 更新清单、交付记录和截图；明确 iOS/微信设备未验收。
- [x] 聚焦代码复核，修复具体发现后补跑相关验证。

不提交共享工作区的其他改动，不部署生产。
