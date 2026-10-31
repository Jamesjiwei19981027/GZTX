# 工作首页入口精简与日历编辑

日期：2026-10-21。Web 与正式 APP 的共享 React 界面同步完成。

## 用户看到的变化

- 首页下方取消“我的任务列表、任务看板、日程日历、回收站”四个独立工具入口，保留首页整月日历和统计入口。
- 点击首页顶端“待办事项、今日到期、已逾期”进入任务看板，并自动选择对应任务范围。
- 在任务页顶部切换“任务看板／任务列表”。筛选范围在切换视图时保留；全部任务可查看已完成任务，其他三种范围只显示未完成任务。
- 回收站放在任务页“更多”中，恢复任务后返回原任务视图和筛选范围，恢复结果即时同步。
- 首页日历选择日期后展示当天全部安排；点击任务时间或标题直接编辑。修改日期或时刻、保存后，任务立即移动到新的日程日期，刷新后仍保持。
- “添加当天日程”带入当前选中的日期。无日程的日期也可直接添加。
- 桌面 Web 侧栏收敛为“任务管理”一个入口，任务列表和回收站按相同规则承载。旧任务、看板、日历、回收站路由继续可用。

## 保存与同步

APP 的任务编辑、创建和回收站恢复都会更新主任务状态，首页日历和任务列表及时刷新。个人／项目归属沿用现有服务端权限。

复审后补齐快速添加／聊天提取任务的即时同步，确保在项目内编辑个人任务仍保持个人归属。任务编辑弹层接入 APP 系统返回，未保存的日期、清单和成员修改会先提示确认；关闭弹层不弹出底层页面。弹层关闭回调在 React 状态更新器之外执行。

桌面新增可编辑的日期／时刻及“保存日程”；APP 直接复用任务编辑面板。失败保留输入并可重试。清空日期和时刻会发送显式 `due_date: null`，避免只清空前端显示而保留服务端旧日程。

实际联调修复后端任务更新的日期类型错误：`UTCDateTime` 序列化将 Python 日期转成字符串，直接写 ORM DateTime 导致 HTTP 500。更新时单独使用经过校验的日期与提醒对象，保持 UTC 入库、带 Z 出参；未提交日期字段时保留旧值。

## 验证证据

- 浏览器相关测试 39 项通过：工作首页与复审边界 17 项；首页／项目详情 3 项；既有移动反馈 12 项；知识导航 1 项；移动页面覆盖 1 项；键盘回归 5 项。接口响应使用测试夹具，不能替代下述实际 APP 联调。
- 后端日期、任务、清单、兼容与权限回归：45 项通过。包含带时区、UTC、无时区日期更新、撤销日程、保留原日期以及提醒更新。
- Web 类型检查、契约测试、生产构建通过。构建仍有已有大分块提示。
- 真实桌面 Web 与 Pixel_9_Pro / Android 15 正式 APP：7 项联调通过，无 API 拦截。两端均完成日历改期与刷新持久化、首页直达看板与列表切换、“更多”回收站恢复及返回原列表；安卓另验证真实系统返回键关闭日程编辑弹层，并在最终弹层修复后单独复验通过。
- 真实联调只操作隔离调试库中新建、带 `[UI验收-...]` 前缀的个人任务，结束后通过 API 软删除测试任务。未修改已有业务任务。

结果：`frontend/android-acceptance/test-results/work-home/result.json`。截图同目录：`desktop-calendar.png`、`desktop-workspace.png`、`android-calendar.png`、`android-workspace.png`。

最终系统返回复验：`frontend/android-acceptance/test-results/work-home-back/result.json`。设置 `WORK_HOME_ANDROID_BACK_ONLY=true` 后，同一脚本仅运行该项，避免重复其他已经通过的真实链路。

复测脚本：`frontend/scripts/test-work-home-live.ts`。本次没有修改原生壳，模拟器中已安装的正式 Flutter APP 直接加载最新共享界面；iOS 和微信真机未验收。

```powershell
cd E:\workspace\gongzuotix\frontend
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:5177'
npx playwright test e2e/work-home-simplification.spec.ts e2e/home-project-overview.spec.ts e2e/mobile-feedback.spec.ts e2e/mobile-screen-coverage.spec.ts e2e/report-keyboard.spec.ts e2e/mobile-knowledge-navigation.spec.ts
npx tsx scripts/test-work-home-live.ts
```
