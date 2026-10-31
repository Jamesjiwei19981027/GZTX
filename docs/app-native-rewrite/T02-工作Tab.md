# T02 工作 Tab：首页、任务、看板、日历、统计、回收站、搜索

> 可直接整段粘贴给执行的 AI。前置：T00 已合入。执行前先读 `docs/app-native-rewrite/00-总计划.md` 第五、六、七节，以及 `app/lib/design/README.md`。

## 目标

原生实现“工作”Tab 的全部页面。

## 范围

- 只能改：`app/lib/features/work/`、`app/test/features/work/`。
- 项目切换、新建项目属于 T03，首页上点“切换项目”跳转到 T03 的路由名即可（路由名见 `mobileRoutes.ts`）。
- “告诉 AI 最新进展”入口跳转到 T07 的路由。

## 页面与功能真源（先读）

| 屏幕名 | 内容 | 网页源文件 |
|------|------|------|
| work-root | 首页：当前用户与项目、重点待办与跟进（置顶，最多 5 条，按截止时间）、AI 汇报入口、待办统计卡、任务趋势图、日程日历（双击日期加当天任务）、项目进度简介 | `mobile/features/work/MobileWorkScreens.tsx`、`components/WorkbenchOverview.tsx`、`components/TaskTrendCard.tsx`、`components/WorkAssistantEntry.tsx`、`components/views/DashboardView.tsx` |
| work-tasks | 我的任务列表、筛选、范围切换 | `mobile/features/tasks/MobileTaskScreens.tsx`、`components/views/MyTasksView.tsx`、`components/TaskWorkspaceToolbar.tsx`、`utils/taskWorkspace.ts`、`utils/taskScope.ts` |
| work-task-detail / work-task-edit / work-quick-add | 任务详情、编辑、快速添加（含清单、提醒、重复、分类、标签、排期变更历史） | 同上 + `components/TaskScheduleHistory.tsx` |
| work-kanban | 看板，拖动改状态 | `components/views/KanbanView.tsx` |
| work-calendar | 日历，点日期改任务，过期日期的修改规则对照网页 | `components/views/CalendarView.tsx`、`calendarUtils.ts` |
| work-statistics | 统计报表 | `mobile/features/work/MobileStatisticsScreen.tsx` |
| work-trash | 回收站（恢复、彻底删除二次确认） | `components/views/TrashView.tsx` |
| work-search | 全局搜索 | 网页 Ctrl+K 搜索逻辑（`App.tsx`） |
| work-chat-extract | 从聊天文本 AI 提取任务草稿 | `MobileTaskScreens.tsx` 中相关部分 |

以上路径均相对 `frontend/src/`。接口：Swagger「任务」「分类」「标签」「提醒」分组，以及 `/tasks/stats/trend`。

## 要点

- 截止时间一律 UTC 收发，按本地日期分组显示（日历跨时区边界的测试必须有）。
- 趋势图：用 Flutter 绘图库（如 `fl_chart`），需要时写共享改动申请加依赖。
- 看板拖拽在 iOS／安卓都要有长按拖动的手感和触感反馈。

## 验收标准

- 总计划第六节全部条件。
- 组件测试覆盖：重点待办排序与无截止日期的排列、日历本地日期分组、回收站彻底删除二次确认、快速添加必填校验。
- 安卓模拟器实测：新建任务 → 出现在首页重点待办和日历 → 看板拖到完成 → 删除 → 回收站恢复。

## 必须回传的证据

1. 文件清单；2. `flutter analyze`、`flutter test test/features/work` 输出末尾；3. 每页 iOS／安卓 golden 图路径；4. 模拟器实测截图；5. 与网页版不一致之处；6. 共享改动申请（如有）；7. 发现的接口问题（不要改后端）。
