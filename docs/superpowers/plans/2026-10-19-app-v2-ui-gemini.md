# APP V2 全量 UI 与 iOS 适配 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task when that skill is available. Steps use checkbox (`- [ ]`) syntax for tracking. 用户指定由 Gemini 实施；本计划不授权向其他聊天发送消息或自动创建子智能体。技能不可用时按本计划的任务与验收门槛执行。

**Goal:** 将用户已批准的 100 张 APP 页面 / 状态设计实现为可操作、接真实接口的移动 UI，同时完成 iOS 风格适配，保留人轴、逐级 AI 汇报、项目隔离及三端状态一致性。

**Architecture:** 继续使用 Flutter WebView 作为默认 APP 宿主，React/Vite/TypeScript 提供自适应移动 UI，复用现有 API、认证与领域状态。新增移动 Shell、导航栈、语义化设计组件及受限宿主桥接；桌面布局保持既有入口。按模块替换页面，避免另建一套任务、权限或汇报业务状态。

**Tech Stack:** React 19、TypeScript、Vite 6、Tailwind 4、现有 lucide-react / React Flow / Recharts、Flutter、webview_flutter、已有 cupertino_icons、Playwright、ADB。

**Spec:** [设计与来源](../../design-review/app-v2-2026-10-19/README.md)、[manifest](../../design-review/app-v2-2026-10-19/manifest.json)、[iOS 补充规范](../../design-review/app-v2-2026-10-19/IOS-ADAPTATION.md)。用户已批准视觉基准并授权 iOS 优化。设计认可不等于接口已经存在，也不等于各端已测试。

## Global Constraints

- 保留人轴作为人员、岗位、上下级、事项和权限事实来源；AI 协助汇报，不能自行改变责任或任务完成状态。
- 每个项目的智能体、会话、材料、草稿、检索和缓存隔离；总领导接收项目摘要封装。
- 五个主导航固定为“工作、人轴、AI、消息、我的”。主要操作目标至少 48 × 48 逻辑尺寸。
- 主色 `#0058BE`；基准字号、图标、安全区域、动态字体、Sheet 与手势采用 iOS 补充规范。
- 100 张图包含页面、弹层、模式与适配状态，不能机械生成 100 个重复路由。
- 示例姓名、任务数量、报告文本和成功状态不得进入真实账号的生产数据回退。
- 保留 `frontend/src/api/client.ts` 的认证、错误响应和刷新逻辑；不另造 token、成员角色、项目权限或报告状态。
- 现有后端 API 语义、权限、迁移与生产部署文件不属于 UI 改版的默认修改范围。需要扩展时先记录接口缺口，相关状态不得报完成。
- 桌面 Web 及旧深链保持可用；小程序共享数据格式、枚举和已读行为保持兼容。
- 不回滚当前工作区已有改动，不删除未追踪文件，不把他人代码计作本任务成果。禁止 `git reset --hard`、`git clean`、自动 stash、`git add .`。
- UI 代码不显示 Docker、开发端口、SDK 路径等普通用户无需决策的实现信息。诊断详情进入开发开关。
- Android AVD 与 SDK 遵守用户限制；只用 ADB 正常关闭模拟器。iOS 原生验收需要 Mac / iPhone，Windows 浏览器模拟不能替代。
- 全部任务结尾更新逐页跟踪表，区分“UI 实现、接口接入、Android 实测、iOS 实测”。依赖阻塞不计作完成。

---

## 0. 当前源码事实与迁移风险

1. `app/lib/main.dart` 默认进入 `WebShellScreen`，修改旧 `app/lib/screens/shell_screen.dart` 不会自动改变默认 APP。
2. `frontend/src/App.tsx` 使用 `ViewMode` 与 `?view=` / `?taskId=`，没有现成的 React Router。不要在没有迁移兼容时更换路由库。
3. `Navbar.tsx` 的桌面控件与 `Sidebar.tsx` 的六位置移动底栏是本轮替换重点。
4. 全局 Material Symbols 字体有 `24px` 定义。移动图标统一迁移到 SVG 组件，不能只增加更多字号覆盖。
5. `ReportsView.tsx` 同时包含统计、个人汇报、管理者收件箱、项目与总领导汇总，需要按职责拆分并继续共用请求层。
6. 普通“新建任务”已经修复全部项目归属；当前 `QuickAddModal` 的 App 传参仍有把 `all` 回退为首个项目的风险。T05 必须增加真实回归，覆盖普通创建、快速创建、聊天提取三个入口。
7. `frontend/src/api/` 的现有文件为 `auth.ts`、`backend.ts`、`client.ts`、`shell.ts`、`reports.ts`、`projectWiki.ts`、`knowledge.ts`、`delegations.ts`、`notifications.ts` 等；不存在的 `agents.ts`、`org.ts`、`sso.ts` 不能被当成已有依赖。
8. 设计图没有独立画出既有“统计报表全页”和“快捷键帮助”。功能仍需保留：统计放在“工作 → 统计”，帮助放在“我的 → 帮助”，桌面键盘快捷键继续可用。
9. 当前报告类型具备 `status`、`parent_user_id`、`read` / `read_at` 等字段，但没有可以直接证明 AI 已阅读 / 执行完成的通用字段。不能照抄设计中的四个绿色成功节点。
10. 当前全量测试、41 项浏览器测试与 Android 26 项检查是改版前基线；新布局实施后必须重测，不能复用旧结果宣布新版本通过。

## 1. 文件边界与公共接口

### 现有入口：按需修改

- `frontend/src/App.tsx`：继续协调认证、项目、真实任务与全局状态，接入响应式 Shell。
- `frontend/src/types.ts`、`frontend/src/utils/deepLink.ts`：保留旧枚举和链接解析，扩展移动子页面参数。
- `frontend/src/index.css`：保持桌面样式，导入局部移动 token；禁止无条件修改全站根字号。
- `frontend/src/components/Navbar.tsx`、`Sidebar.tsx`：桌面继续使用，移动入口由新 Shell 接管。
- `frontend/src/components/views/`、`components/modals/`：迁移具体功能，保留共享业务处理器。
- `app/lib/screens/web_shell_screen.dart`：统一安全区域、键盘、返回、运行环境桥接、错误与调试界面。
- `app/lib/main.dart`、`app/lib/config/api_config.dart`：只处理必要的宿主配置与测试开关。
- `app/ios/Runner/AppDelegate.swift`、`Info.plist`：仅在现有插件与 Flutter 能力确实不足时做有依据的 iOS 配置；不预先引入无关原生改动。

### 新增职责分区

```text
frontend/src/mobile/
  MobileAppShell.tsx
  mobile.css
  runtime/
    runtimeTypes.ts
    nativeBridge.ts
    NativeRuntimeProvider.tsx
  navigation/
    mobileRoutes.ts
    MobileNavigationProvider.tsx
    MobileRouteOutlet.tsx
  ui/
    AppIcon.tsx
    MobileTopBar.tsx
    MobileTabBar.tsx
    MobileSheet.tsx
    MobileConfirm.tsx
    MobileField.tsx
    MobileList.tsx
    MobileState.tsx
  features/
    auth/
    projects/
    work/
    tasks/
    people-axis/
    wiki/
    reports/
    messages/
    settings/
frontend/src/utils/taskScope.ts
app/lib/platform/app_runtime.dart
app/lib/platform/web_shell_bridge.dart
```

每个功能目录按“页面 / 控制器 / 小型展示组件”拆分；不要把所有新页面塞进一个巨型文件。优先复用既有处理器与 API，不复制两份完成任务、提交报告或权限判定逻辑。

### 必须先固定的 TypeScript 契约

下列为新增接口要求，不是声称源码已经存在：

```ts
export type MobileTab = 'work' | 'axis' | 'ai' | 'messages' | 'me'
export type UiPlatform = 'web' | 'android' | 'ios'
export type TextRole = 'body' | 'caption' | 'navTitle' | 'displayTitle'

export type NativeRuntime = {
  v: 1
  platform: UiPlatform
  surface: 'browser' | 'app'
  colorScheme: 'light' | 'dark'
  textSizes: Record<TextRole, number>
  safeAreaOwner: 'native' | 'web'
  reduceMotion: boolean
  reduceTransparency: boolean
  capabilities: { haptics: boolean; nativeBack: boolean }
}

export type MobileRoute = {
  tab: MobileTab
  screen: string
  presentation: 'page' | 'sheet' | 'dialog'
  params: {
    projectId?: string
    taskId?: string
    nodeId?: string
    reportId?: string
  }
}

export type BackAction = 'confirm-discard' | 'close-overlay' | 'pop-detail' | 'root'
export function parseNativeRuntime(input: unknown): NativeRuntime | null
export function resolveBackAction(state: {
  currentDirty: boolean
  overlayOpen: boolean
  detailOpen: boolean
}): BackAction
export function normalizeTaskScope(projectId: string | null | undefined): {
  project_id: number | null
  origin: 'personal' | 'project_link'
}
```

`screen` 只能来自 `mobileRoutes.ts` 中登记的页面键，入口参数解析后校验，不任意执行字符串。路由、平台和本地存储都不授予业务权限。

## 2. 依赖与任务顺序

T00 → T01 → T02 → T03 建立基础。T04—T12 按模块接入。T13 检查兼容与缺口。T14 完成浏览器和真实 Android。T15 完成可完成的 iOS 交付与总验收，缺少 Mac / iPhone 的项保持待验证。

### T00：记录基线、能力与逐页归属

**Files:** Inspect `frontend/`、`app/`、`backend/app/api/v1/`；Update `docs/design-review/app-v2-2026-10-19/IMPLEMENTATION-TRACKER.md`；Create 同目录 `API-GAPS.md`、`IMPLEMENTATION-REPORT.md`。

**Consumes:** 已批准 100 页 manifest、现有全量功能清单。**Produces:** 每页的组件、真实入口、API 能力、测试证据位置与缺口编号。

- [ ] 运行 `git status --short`，记录已修改和未追踪的文件清单，辨认现有改动后再编辑；如创建隔离目录，必须包含当前已批准设计与现有未提交实现，不能从旧 HEAD 漏掉它们。
- [ ] 读取所有设计页备注，按本计划填写实现归属，保持编号稳定。
- [ ] 对照现有客户端函数和后端路由确认请求 / 响应。测试中的模拟 `published`、假返回值不能作为 API 存在的证据。
- [ ] 记录运行中的服务和设备；复用可用设备，不重启用户正在手工验证的模拟器。需要隔离数据时新建测试数据库与端口。
- [ ] 在 API-GAPS 中登记第 4 节列出的能力，区分“已有接口缺 UI”“已有 UI 缺接口”“有接口需真实配置”。
- [ ] 记录当前基线测试命令与结果；本任务开始后产生的失败要区分基线失败和新引入回归。

**Gate:** 100 个 ID 都有归属；缺口有真实源码依据；没有修改业务数据或覆盖未提交文件。

### T01：语义化设计组件与运行环境契约

**Files:** Create `mobile/runtime/runtimeTypes.ts`、`nativeBridge.ts`、`NativeRuntimeProvider.tsx`；Create `mobile/ui/AppIcon.tsx`、`MobileField.tsx`、`MobileList.tsx`、`MobileState.tsx`、`mobile/mobile.css`；Modify `frontend/src/index.css`；Create `frontend/scripts/test-mobile-runtime.ts`。

**Consumes:** NativeRuntime 类型与 iOS 规范。**Produces:** `parseNativeRuntime()`、运行环境 Provider、统一 UI 组件与局部 token。

- [ ] 先为未知协议版本、非法平台、非有限字号、缺失字段写失败测试；输入必须按运行时 schema 校验，不能直接 `as NativeRuntime`。
- [ ] 为普通浏览器提供稳定默认值；桥接尚未就绪时不伪装已有原生能力。
- [ ] 建立 body、caption、navTitle、displayTitle、图标、间距、颜色和触控 token。移动样式只在移动 Shell / APP 生效。
- [ ] 用已有 lucide-react 实现 AppIcon，提供名称、用途尺寸、状态和可访问属性；移除移动路径对 Material Symbols 连字的依赖。
- [ ] 完成表单、列表、加载、失败和禁用说明组件；按钮提交中防重复点击。
- [ ] 实现深浅色、减少动态效果 / 透明度回退；检查 iOS 字体来源与离线字体回退。

测试至少包含：

```ts
import assert from 'node:assert/strict'
import { parseNativeRuntime } from '../src/mobile/runtime/nativeBridge'
assert.equal(parseNativeRuntime({ v: 999 }), null)
assert.equal(parseNativeRuntime({ v: 1, platform: 'unknown' }), null)
assert.equal(parseNativeRuntime(null), null)
```

**Run:** `cd frontend`，`npx tsx scripts/test-mobile-runtime.ts`，`npm run lint`。

**Gate:** 320 / 390 / 430 宽度的列表、表单和图标没有溢出；测试证明非法原生消息不会改变运行状态。

### T02：五个主导航与移动页面栈

**Files:** Create `mobile/navigation/mobileRoutes.ts`、`MobileNavigationProvider.tsx`、`MobileRouteOutlet.tsx`、`mobile/ui/MobileTopBar.tsx`、`MobileTabBar.tsx`、`MobileSheet.tsx`、`MobileConfirm.tsx`、`mobile/MobileAppShell.tsx`；Modify `App.tsx`、`utils/deepLink.ts`；Create `scripts/test-mobile-navigation.ts`、`e2e/mobile-navigation.spec.ts`。

**Consumes:** T01 运行环境 / 组件。**Produces:** 页栈、Tab 栈、`resolveBackAction()`、旧链接兼容与统一关闭语义。

- [ ] 先测试返回优先级和脏表单保护，避免系统返回与页面返回触发两次 pop。
- [ ] root Tab 与二级页面分离；保留筛选与滚动，刷新 / 深链能定位同一实体。
- [ ] 保留 `?view=tasks&taskId=...` 等旧链接，新参数与旧参数共存；项目 ID 不放进可授予权限的客户端状态。
- [ ] APP 无论手机还是平板都进入新自适应 Shell；普通浏览器小于 768 使用移动布局，768—1023 采用平板布局，1024 及以上保留桌面。在窗口宽度变化时维护编辑状态。
- [ ] 映射 dashboard/tasks/kanban/calendar/trash 到工作，people-axis 到人轴，AI 汇报到 AI，会话 / 收件箱到消息，个人设置 / 团队到我的。原统计报表新增明确的“工作 → 统计”入口。
- [ ] 普通详情保留 Tab 可达；全屏编辑或通话独立显示，返回原上下文。为 Sheet 处理焦点、背景不可交互及关闭后的焦点恢复。

核心测试：

```ts
import assert from 'node:assert/strict'
import { resolveBackAction } from '../src/mobile/navigation/mobileRoutes'
assert.equal(resolveBackAction({currentDirty:true,overlayOpen:true,detailOpen:true}), 'confirm-discard')
assert.equal(resolveBackAction({currentDirty:false,overlayOpen:true,detailOpen:true}), 'close-overlay')
assert.equal(resolveBackAction({currentDirty:false,overlayOpen:false,detailOpen:true}), 'pop-detail')
assert.equal(resolveBackAction({currentDirty:false,overlayOpen:false,detailOpen:false}), 'root')
```

**Run:** `npx tsx scripts/test-mobile-navigation.ts`、`npx playwright test --project=chromium e2e/mobile-navigation.spec.ts`、`npm test`。

**Gate:** 五个 Tab 都可达；旧链接、浏览器返回、表单取消和刷新恢复通过；没有两套重复顶栏 / 底栏。

### T03：Flutter 宿主与 Android / iOS 平台行为

**Files:** Create `app/lib/platform/app_runtime.dart`、`web_shell_bridge.dart`；Modify `app/lib/screens/web_shell_screen.dart`；按需修改 `main.dart` 和 iOS 原生入口；Create `app/test/app_runtime_test.dart`、`web_shell_navigation_test.dart`。

**Consumes:** T01 消息协议、T02 页面栈。**Produces:** 真实原生运行环境、返回协调、系统字号和平台能力桥接。

- [ ] 为不同 TextScaler 的语义字号计算、非法桥接消息、返回消费结果建立可独立运行测试；WebView 依赖通过适配器注入，单元测试不创建真实平台 WebView。
- [ ] 采用 iOS 规范的 SafeArea / 键盘责任划分；Flutter 已消耗的 inset 不在网页再次加入。
- [ ] 接入平台、系统颜色、各语义字号、减少动态效果和受支持能力；系统设置变化时重新通知网页。
- [ ] 系统返回先交给移动栈；根页按平台默认行为处理。iOS 原生侧滑启停与 Web 状态保持一致，避免与人轴画布冲突。
- [ ] 宿主只允许当前应用来源使用桥接；消息版本、类型、数据长度 / 字段校验。外部 URL 使用允许的 http/https 规则，不把任意 JS 或本地命令作为桥接动作。
- [ ] 平台手势、haptic、文件选择等使用已支持的插件能力；如需新增平台包，确认锁文件兼容并记录原因，不能直接导入未声明的传递依赖。
- [ ] 调试网址条改为显式开发开关，默认隐藏；真实错误页提供重试和普通用户能理解的说明，技术细节折叠到开发诊断。

新增纯计算接口与测试示例：

```dart
// app_runtime.dart，使用 package:flutter/widgets.dart 的 TextScaler。
class AppTextSizes {
  const AppTextSizes({required this.body, required this.caption,
    required this.navTitle, required this.displayTitle});
  final double body;
  final double caption;
  final double navTitle;
  final double displayTitle;
}

AppTextSizes textSizesFor(TextScaler scaler, {required bool isIOS}) {
  return AppTextSizes(
    body: scaler.scale(isIOS ? 17 : 16),
    caption: scaler.scale(isIOS ? 13 : 12),
    navTitle: scaler.scale(isIOS ? 17 : 18),
    displayTitle: scaler.scale(isIOS ? 28 : 22),
  );
}

// app_runtime_test.dart
test('iOS semantic body follows supplied system scaler', () {
  expect(textSizesFor(TextScaler.linear(2), isIOS: true).body, 34);
});
```

**Run:** `cd app`，`dart analyze`、`flutter test`、Android debug APK 构建。Windows 记录 iOS 原生行为待验证。

**Gate:** 实际 Android APK 能显示新 Shell，字体仅缩放一次；当前身份、项目和编辑内容不因运行环境更新丢失。

### T04：认证、工作区、项目与成员

**设计 ID：01—04、07—11、51、52、79—81。**

**Files:** Modify `components/LoginGate.tsx`、`VerifyGate.tsx`、`modals/WorkspaceSetupModal.tsx`、`views/TeamView.tsx`；Create `mobile/features/auth/MobileAuthScreens.tsx`、`projects/MobileProjectScreens.tsx`、`projects/MobileTeamScreens.tsx`；复用 `api/auth.ts`、`backend.ts`、`shell.ts`；Create `e2e/mobile-auth-projects.spec.ts`。

- [ ] 为账号登录 / 验证码切换、验证完成继续原动作、失败保留输入、过期邀请及无权限状态编写浏览器用例。
- [ ] 接入注册 / 邮箱验证 / 手机验证，显示真实冷却和错误；不新增不可用的找回密码重置成功链路。
- [ ] 验证码登录按实际登录接口支持渠道展示。手机验证是独立的账号校验流程，不能据此推断已经支持手机号验证码登录。
- [ ] 项目选择明确公司、角色与当前项目；全部项目仅做个人总览。
- [ ] 创建项目、创建公司、邀请与接受邀请复用实际字段与许可要求；删除 / 归档类操作只有接口和权限齐备时才开放。
- [ ] 团队与成员详情接入当前项目人员；人轴、材料和 AI 报告可见性继续受服务端控制。
- [ ] iOS 使用系统输入和短流程 Sheet；验证成功回到原流程，不跳失上下文。

**Run:** `npx playwright test --project=chromium e2e/mobile-auth-projects.spec.ts e2e/smoke.spec.ts`。

**Gate:** 真正登录、创建 / 邀请 / 接受后的状态可回查；失败不清输入；切项目不残留旧成员资料。

### T05：工作台、任务、看板、日历与搜索

**设计 ID：05、06、12—19、64、65、82—85；另保留原统计报表与快捷键帮助。**

**Files:** Modify `App.tsx`、`views/DashboardView.tsx`、`MyTasksView.tsx`、`KanbanView.tsx`、`CalendarView.tsx`、`TrashView.tsx`、`ReportsView.tsx`、`modals/NewTaskModal.tsx`、`QuickAddModal.tsx`、`TaskDetailDrawer.tsx`、`GlobalSearchModal.tsx`、`ShortcutHelpModal.tsx`；Create `mobile/features/work/MobileWorkScreens.tsx`、`MobileStatisticsScreen.tsx`、`mobile/features/tasks/MobileTaskScreens.tsx`、`utils/taskScope.ts`；Create `scripts/test-task-scope.ts`、`e2e/mobile-tasks.spec.ts`。

- [ ] 先写任务范围回归，覆盖全部项目、指定项目、非法项目 ID。三个创建入口复用同一范围规范化函数。
- [ ] 保留当前 `handleCreateTask`、完成 / 取消完成、删除 / 恢复、重复任务、子任务、标签与附件语义；成员与日期不随布局迁移改变。
- [ ] 员工工作台突出待办 / 待确认 / 待汇报；管理者突出下属待审、风险与待决策。统计数字来自真实可见数据。
- [ ] 任务详情采用移动页面或合适 Sheet；只读责任关联任务显示来源和前往人轴入口。
- [ ] 快速添加、聊天提取和完整表单都显示清楚所属范围；生成失败保留原文，不把草稿当成已创建任务。
- [ ] 批量操作显示部分失败与撤销；日期和重复规则复用现有工具，不能重新手写时区解释。
- [ ] 看板提供“移动状态”替代精确拖拽；月 / 周日历、今天、点日期新建和全局搜索都可用。
- [ ] 拆出原报表趋势、状态分布与团队负载，在手机上纵向排列、可读图例；保留时间范围。帮助与桌面快捷键继续工作。

测试及范围函数要求：

```ts
import assert from 'node:assert/strict'
import { normalizeTaskScope } from '../src/utils/taskScope'
assert.deepEqual(normalizeTaskScope('all'), {project_id:null,origin:'personal'})
assert.deepEqual(normalizeTaskScope('2'), {project_id:2,origin:'project_link'})
assert.throws(() => normalizeTaskScope('invalid'))
assert.throws(() => normalizeTaskScope('-1'))
```

`normalizeTaskScope` 将 `all` / `null` / `undefined` 解释为个人范围；正整数字符串为项目范围，其余拒绝。App 不再以首个项目替代个人范围。

**Run:** `npx tsx scripts/test-task-scope.ts`、`npm test`、`npx playwright test --project=chromium e2e/mobile-tasks.spec.ts e2e/smoke.spec.ts`。

**Gate:** 实际 API 回查新建来源正确；新建、完成、恢复、搜索、日期和批量操作闭环；原统计与帮助有可达入口。

### T06：人轴责任链、画布与人员权限

**设计 ID：20—25、30、86、87。**

**Files:** Modify `views/PeopleAxisView.tsx`、`PeopleAxisFlowCanvas.tsx`、`ResponsibilityWorkspace.tsx`、`ResponsibilityParts.tsx`、`EditResponsibilityPerson.tsx`、`ResponsibilityPermissionFields.tsx`、`peopleAxisFlowLayout.ts`、`responsibility.css`；Create `mobile/features/people-axis/MobileAxisScreens.tsx`；Extend `e2e/people-axis-native.spec.ts` 与实际 Android 脚本。

- [ ] 先以现有布局 / 边测试冻结父子关系、端口和持久化；为移动列表 / 画布互相定位补交互用例。
- [ ] 默认聚焦“直属领导—我—直属下属”，项目全貌仍可切换；横纵布局、缩放、适配、定位、展开及拖拽继续可用。
- [ ] 人员节点附上可追溯汇报状态和进入报告入口；状态缺失显示未知 / 待同步，不写入模拟成功。
- [ ] 新增 / 编辑人员、部门岗位、关联成员、权限及调整上级全部走原 API；自身、后代与跨项目上级不可选。
- [ ] 画布只在自己的容器内平移，长名称可读，不牺牲其他页面返回和滚动。
- [ ] 只调整可视结构，保持已有后端“人员节点解析直属领导、排除自己”的修复；调整后新汇报路径需要回查验证。

**Run:** `npm test`、`npx playwright test --project=chromium e2e/people-axis-native.spec.ts`、更新后的 `npx tsx scripts/test-people-axis-android.ts`。

**Gate:** 真实 APK 中人轴操作、触摸拖拽、权限保存、重新加载和汇报跳转通过。

### T07：材料、进度、委托、审计与 Wiki

**设计 ID：26—29、31—34、88。**

**Files:** Modify `PeopleAxisView.tsx`、`ProjectWikiPanel.tsx`、`modals/DelegationModal.tsx`、`projectWiki.css`；Create `mobile/features/wiki/MobileWikiScreens.tsx`、`mobile/features/people-axis/MobileEvidenceScreens.tsx`；Reuse `api/projectWiki.ts`、`knowledge.ts`、`delegations.ts`、`backend.ts`、`shell.ts`；Extend `e2e/project-wiki.spec.ts`、Create `e2e/mobile-materials.spec.ts`。

- [ ] 为无权限上传、上传失败保留选择、草稿不可见、发布失败、审计失败和委托撤销写行为断言。
- [ ] 材料说明、文件选择、证据包详情、引用跳转、下载和进度记录保持可追溯。
- [ ] 上传格式、大小与错误使用实际接口约束。文件选择与下载在 APK 内验证；缺少宿主支持时登记平台缺口。
- [ ] 委托动作、有效期和撤销复用现有服务字段；过期状态按真实记录展示。
- [ ] 审计显示任务运行状态和真实结果；未配置模型时保留原页面与重试说明。
- [ ] Wiki 已发布 / 草稿 / 搜索分开，生成与发布分开；原接口按证据包生成草稿，不能擅自改成无材料生成。
- [ ] 完整保留来源引用与项目搜索权限，不把证据已提交等同于验收通过。

**Run:** `npx playwright test --project=chromium e2e/project-wiki.spec.ts e2e/mobile-materials.spec.ts`，再在真实 APK 上传 / 下载测试文件。

**Gate:** 材料可回查、Wiki 可追踪来源、委托撤销生效；未配置 / 无权限场景无假成功。

### T08：个人项目 AI、草稿、提交与历史

**设计 ID：35—39。**

**Files:** Modify `views/ReportsView.tsx`、`api/reports.ts`；Create `mobile/features/reports/MyAgentScreen.tsx`、`MyReportEditor.tsx`、`ReportDetailScreen.tsx`、`ReportSources.tsx`、`reportCapabilities.ts`；按真实接口在 `api/` 增加已有 agent API 的封装；Create `e2e/mobile-report-personal.spec.ts`。

- [ ] 先用真实接口写草稿生成失败、手动编辑提交、直属领导正确、切项目不串草稿的用例。
- [ ] AI 对话进入当前项目授权会话；没有项目时先选择项目，不将全部项目混为一个上下文。
- [ ] 生成草稿继续使用 `generateMyReportDraft()`，返回 422 / 未配置模型时原样显示原因；不得降级为假模型报告。
- [ ] 编辑、提交、历史详情使用现有函数和来源字段；保存草稿 / 正式版本历史能力按 API 核实后决定。
- [ ] 提交页只显示已被证实的接收者、提交时间、阅读状态。AI 收到 / 已处理没有记录时显示“状态暂不可确认”。
- [ ] 防重复提交；旧请求返回时校验项目 / 用户上下文，不能覆盖当前项目编辑器。

**Run:** `npx playwright test --project=chromium e2e/mobile-report-personal.spec.ts e2e/report-ui.spec.ts`，真实 APK 生成失败 → 手动编辑 → 提交 → 查看详情。

**Gate:** 无模型与有真实模型分开验收；个人提交的直属领导不是自己；来源、项目与消息状态可回查。

### T09：管理者、项目对照、总领导与缺口页面

**设计 ID：40—43、95、99、100。**

**Files:** Create `mobile/features/reports/ManagerReportInbox.tsx`、`ProjectReportScreen.tsx`、`LeadershipReportScreen.tsx`、`ReportReviewScreen.tsx`；Modify `ReportsView.tsx`、`api/reports.ts`；Create `e2e/mobile-report-manager.spec.ts`；Update `API-GAPS.md`。

- [ ] 验证普通成员不能通过路由参数进入管理功能；以服务端权限和接口返回范围决定直属 / 全部下属视图。
- [ ] 读取、标记已读、同步智能体、项目汇总和总领导摘要复用真实请求；消息变化后刷新相关节点与计数。
- [ ] 对照结果只展示已有快照与冲突字段能够支持的内容；不由前端臆造“已完成”或材料核验结论。
- [ ] 项目汇总与“审核后正式发布”分开。若只有 aggregate 接口，显示“生成项目汇总”，不得假造发布确认流程已落库。
- [ ] 上级追问、差异处理意见、历史不可变版本等缺接口时完成页面结构 / 错误说明并登记依赖；不将“发送普通聊天”冒充专门追问闭环。
- [ ] 总领导跨项目只接收允许的项目摘要封装，不能把项目原始材料和 agent session 混进请求上下文。

**Run:** `npx playwright test --project=chromium e2e/mobile-report-manager.spec.ts e2e/report-ui.spec.ts`，真实 APK 成员提交 → 管理者读取 → 项目汇总 → 另项目不可见。

**Gate:** 所有成功状态有真实依据；缺口 ID 与受影响页一一对应；未实现发布 / 追问 / 确认不计作功能完成。

### T10：会话、通知、文件、邮件与通话

**设计 ID：44—50、89、98。**

**Files:** Modify `views/MessagesView.tsx`、`InboxView.tsx`、`modals/NotificationsModal.tsx`；Create `mobile/features/messages/MobileMessageScreens.tsx`、`MobileInboxScreens.tsx`、`MobileCallScreen.tsx`；Reuse `api/shell.ts`；Create `e2e/mobile-messages.spec.ts`。

- [ ] 用真实后端验证会话读取 / 发送、点赞、文件、关联任务、固定链接和通知已读；外部邮件与站内通知分开状态。
- [ ] 聊天详情使用单列与可达输入栏；会话资料从右侧栏改为二级页面，不丢文件 / 任务 / 关于页签。
- [ ] 创建 / 修改 / 归档频道、成员邀请、复制链接有实际结果和错误反馈。
- [ ] 通知搜索、筛选、已读 / 未读、归档 / 恢复、删除 / 回复 / 转任务保留；转任务进入草稿编辑。
- [ ] IMAP / 外部邮件未配置时显示真实状态；归档 / 删除 / 恢复不影响原任务，边界说明清楚。
- [ ] 通话连接、权限、静音、视频、扬声器、结束的状态来自真实 WebRTC / 宿主能力；未配置服务不出现“通话中”。
- [ ] iOS 检查输入法、键盘、系统文件选择和外部链接；普通网页推送与原生推送分开记录。

**Run:** `npx playwright test --project=chromium e2e/mobile-messages.spec.ts`，`npm test`；实际 APK 发送 / 上传 / 回读。通话另列真实服务与设备测试记录。

**Gate:** API 数据与 UI 一致；通知同步可验证；没有真实权限 / TURN 条件的通话项保持依赖状态。

### T11：我的、账号、通知与管理员配置

**设计 ID：53—63、90—94。**

**Files:** Modify `views/SettingsView.tsx`、`NotificationSettingsView.tsx`；Create `mobile/features/settings/MobileSettingsScreens.tsx`、`AdminIntegrationScreens.tsx`；Reuse `api/auth.ts`、`notifications.ts`、`shell.ts`；仅为真实存在的服务增加明确封装；Create `e2e/mobile-settings.spec.ts`。

- [ ] 设置页拆分为可返回子页；资料、密码、主题、语言、默认分类 / 优先级、免打扰与发送记录都可达。
- [ ] 保存后在同一会话与其他端回读一致；服务失败保留表单，密码 / 密钥不回显。
- [ ] 普通成员不显示公司级 SMTP、模型、ASR、存储、组织 / SSO 写操作；管理员入口按真实权限决定。
- [ ] Push、微信、邮件测试展示真实权限和服务状态，不将浏览器订阅当作 APP 原生推送成功。
- [ ] iOS 字体与深色 / 减少动态效果跟随系统，按规范桥接，避免和用户已有服务端偏好冲突。
- [ ] 账单、授权、数据保留与应用版本使用实际返回；帮助覆盖统计、任务、人轴、汇报和桌面快捷键。

**Run:** `npx playwright test --project=chromium e2e/mobile-settings.spec.ts`、`npm test`；实际 APK 修改资料 / 默认值并在 Web 回读。

**Gate:** 配置写入与回读真实；未配置渠道状态准确；成员不因设备或路由获得更高管理权限。

### T12：空态、失败、危险操作及全局适配

**设计 ID：66—78、96、97。**

**Files:** Extend `mobile/ui/`、`runtime/`、`mobile.css`、`WebShellScreen`；Create `e2e/mobile-adaptation.spec.ts`、`e2e/mobile-failure-states.spec.ts`。

- [ ] 验证未选项目、空列表、首次进入、启动同步、网络中断、403、422、500 和会话失效；每个状态提供有意义的下一步。
- [ ] 需要离线草稿时按 `userId + projectId + formKind + entityId` 隔离，退出登录清理该用户数据；不得存明文密钥或自动重发高风险请求。
- [ ] 删除任务、归档项目、撤销授权、重置布局和删除账号各自说明影响；取消不能写数据。
- [ ] 覆盖 320 / 360 / 390 / 430 宽度、834 平板、844 横屏；150% / 200% 文字、大字号类别、深色、减少动态效果。
- [ ] 文本允许换行；图标尺寸与点击区分开；长邮件、长人名、空头像与字体加载失败都可用。
- [ ] 键盘打开时输入与提交按钮可达；关闭键盘恢复合理位置，避免页面高度反复抖动。
- [ ] Dialog 焦点、Tab 顺序、读屏标签与状态变化提示符合语义；仅用颜色的状态增加文字。

**Run:** `npx playwright test --project=chromium e2e/mobile-adaptation.spec.ts e2e/mobile-failure-states.spec.ts`；真实 Android 系统字体设置与键盘复验。

**Gate:** 不使用禁止字体缩放、整页 scale 或全局 overflow hidden 掩盖内容损失；模拟与真实设备证据分别记录。

### T13：桌面 Web、小程序共享契约与缺口核对

**Files:** Existing `frontend/e2e/` / `scripts/`；`miniprogram/` 仅检查或做必要兼容；Update 功能清单、API-GAPS 和跟踪表。

- [ ] 运行桌面登录、任务、日历、搜索、回收站、人轴、Wiki、报告与设置回归。断点切换后桌面不出现手机重复导航。
- [ ] 保留原 ViewMode、API 枚举、通知 read 字段、项目 / 公司参数、重复任务和日期序列化语义。
- [ ] 对同一测试账号：APP 提交 → Web 管理者读取；APP 已读 → Web 刷新同步；小程序回读同一记录。真实三端不足时明确未验证端。
- [ ] 小程序静态检查与共享接口检查可先做；微信开发者工具 / 真机未执行不得写“小程序验收通过”。
- [ ] 所有 API-GAPS 关联影响页和可复现用例；区分缺接口、缺凭证、缺平台和实施未完成。
- [ ] 所有原功能都能在新导航定位，包括统计、帮助、低频管理设置；逐页核对跟踪表 100 个 ID。

**Gate:** 未更改服务端协议；桌面无回归；三端验证状态与证据一致。

### T14：全量页面操作、实际 Android APK 与交付证据

**Files:** Extend `frontend/scripts/test-android-core.ts`、`test-people-axis-android.ts`；Create `e2e/mobile-screen-coverage.spec.ts`；Update 跟踪表与 IMPLEMENTATION-REPORT。

- [ ] 为每个编号关联真实路由 / 触发动作。状态图通过可复现条件触发，不要求一张图一个路由。
- [ ] 枚举实际可见的按钮、菜单项、表单和链接；每项写触发条件、预期请求 / UI、成功 / 失败、证据。禁止只统计“页面加载成功”。
- [ ] 数据修改使用隔离测试库和角色，执行请求后回查持久化、权限与跨项目范围。
- [ ] `cd frontend` 执行 `npm run lint`、`npm test`、`npm run build` 和受影响浏览器 E2E；桌面原回归继续通过。
- [ ] `cd app` 执行 `dart analyze`、`flutter test`、Android debug 构建，并实际安装到已开机的 Pixel_9_Pro。
- [ ] 用 ADB 点击 / 触摸与真实 API 检查任务、项目、人轴、报告、消息、设置、附件、系统返回和键盘；定位变化后修改用例选择器，不削弱断言。
- [ ] 截图与 JSON 放到 `frontend/android-acceptance/test-results/app-v2/`，避免 Playwright 清理统一 test-results 目录。
- [ ] 在报告中列出真实模型、外部邮箱、推送、通话、相机 / 麦克风等依赖是否满足。未满足即记录未验证，不能用 mocked API 宣称外部服务可用。

常用命令（在相应目录运行）：

```powershell
# frontend
npm run lint
npm test
npm run build
npx playwright test --project=chromium e2e/smoke.spec.ts e2e/people-axis-native.spec.ts e2e/project-wiki.spec.ts e2e/report-ui.spec.ts
$env:AXIS_ANDROID_CDP='http://127.0.0.1:9223'
$env:AXIS_LIVE_PROJECT_ID='1'
npx tsx scripts/test-people-axis-android.ts
npx tsx scripts/test-android-core.ts

# app，明确指向隔离服务；发布环境改为真实 HTTPS 地址
dart analyze
flutter test
flutter build apk --debug --dart-define=USE_WEB_SHELL=true --dart-define=WEB_BASE_URL=http://127.0.0.1:5174/ --dart-define=API_BASE_URL=http://127.0.0.1:8011/api/v1
```

APK 使用 loopback 地址时先建立 ADB reverse；WebView PID 重启后读取实际调试 socket，不能沿用旧 PID。服务被其他任务占用时改用新的隔离端口，不修改对方进程。

**Gate:** 逐页 UI 可达与按钮证据齐全；真实 Android 检查通过；跟踪表没有凭模拟结果填写的设备通过状态。

### T15：iOS 平台验证与最终交接

**Files:** `app/ios/`、T03 桥接与导航；跟踪表、IMPLEMENTATION-REPORT、API-GAPS。

- [ ] 在 Windows 完成可执行的 Dart、静态代码与浏览器 WebKit 预检查，明确这些不是 iOS Simulator 测试。
- [ ] 在 Mac 安装对应 Flutter / Xcode 环境后执行 `flutter build ios --simulator --debug`，在 iPhone 模拟器实际运行默认 WebView 入口；签名与真实发布另设门槛。
- [ ] 验证 iOS 侧滑 / Tab 栈 / Sheet、Dynamic Type、VoiceOver、深色、减少动态效果、键盘、文件选择和系统权限。
- [ ] iPad 验证双栏、窗口缩放、分屏与横屏；不将手机布局等比放大。
- [ ] 真实 iPhone 检查需要硬件的能力；无设备 / Mac 时保留明确的依赖阻塞和可直接执行的后续命令。
- [ ] 汇总 100 页状态、原功能保留状态、Android / iOS / Web / 小程序结果、接口缺口、截图和可复现步骤。
- [ ] 只对证据完整的项标记完成；“UI 已实现”与“全量上线放行”独立报告。源码与设计有必要差异时写明原因，交由用户复核具体页面。

**Gate:** Gemini 交付可运行代码及证据；用户能明确知道哪些完成、哪些依赖、哪些尚未测试。

## 3. 逐模块统一验收步骤

每个 T04—T12 的交付都执行：

1. 对照设计编号与页面备注，登记真实入口及保留的全部原控件。
2. 为关键业务状态 / 返回 / 隔离先写可复现失败用例，确认失败原因后实现。
3. 展示层接入已有处理器或真实 API，处理 loading、success、error、403 和配置缺失。
4. 运行该任务列出的测试，截图并回查真实写入；静态样式调整不额外堆叠无意义镜像测试。
5. 回看桌面与共享状态，更新逐页表和接口缺口；不把其他任务的旧通过记录写成本任务新证据。
6. 按当前仓库允许的方式保存可审阅变更；提交时仅选本任务文件，不提交测试库、凭证、APK 或无关文件。

## 4. 必须核实的服务与能力缺口

在 T00 为每一项记录真实路由 / 客户端函数 / 数据字段；以下是当前源码检查发现的风险，不是完整后端设计。

- **G01 AI 接收 / 已处理回执，38、40、95：** 已提交和人已读有字段；AI session 中写入消息不代表 AI 已执行。缺少独立回执时使用未知状态。
- **G02 草稿保存与不可变历史，37、39：** 区分生成草稿、直接提交、编辑后提交；核实 API 是否支持独立保存、撤回和版本历史，不能擅自覆盖已提交记录后声称不可变。
- **G03 汇总后正式发布，42：** aggregate 返回封装不等于已实现管理者确认发布工作流；未提供确认接口时只交付真实汇总能力。
- **G04 上级追问闭环，49、99：** 普通通知回复能力不能自动证明已有报告追问队列、已解决状态和审计。
- **G05 差异确认持久化，41、100：** 展示 conflicts 与保存核验决定是两种能力；缺写接口则不显示保存成功。
- **G06 直属 / 全部下属与过期统计，06、40：** 先核实后端返回范围和周期数据。客户端不能通过抓取所有人资料绕开读权限。
- **G07 APP 原生推送、音频视频和文件平台集成，26、45—47、57、90、91：** 浏览器 API 可用不能证明 WebView 系统能力可用。
- **G08 公司管理 / SSO / ASR / 存储的移动前端，10、60、61、92—94：** 有后端路由但缺前端封装时补准确封装；没有真实 route/schema 时记录能力阻塞，不猜请求字段。
- **G09 本地草稿、原生字体 / SafeArea / 返回桥接，67、73、74、78：** 属于本轮客户端应实现和实测的能力，不以设计文字替代。
- **G10 账号、短信、真实模型、邮件、微信、TURN 与签名：** 需要外部服务 / 操作者配置。UI 必须可解释不可用原因，不能注入假结果。

API-GAPS 每条必须包含：缺口编号、影响页、现有代码证据、所需请求 / 响应字段、权限范围、UI 临时表现、负责端、验证步骤及当前状态。

## 5. 最终交付清单

- [ ] 真实可运行的移动 UI 与默认 Android APK 入口。
- [ ] 已批准 100 页逐项状态及新导航位置，iOS 平台差异逐项记录。
- [ ] 统计、帮助等设计图未单列原功能的保留记录。
- [ ] 实际 API 接入、不可用原因、未完成接口与外部依赖清单。
- [ ] Web / Android / iOS / 小程序分别列出的测试结果，不混用模拟与真机结论。
- [ ] 真实截图、按钮操作记录、测试命令与失败复现，不仅是一句“全部通过”。
- [ ] 仅限本任务变更的文件摘要，无凭证、真实用户资料、测试数据库或自动部署。

## 6. 本计划自检

- 100 页按 T04—T12 唯一归属；基础组件 / 导航 / 原生宿主覆盖 T01—T03。
- iOS 规范中的布局、字体、手势、Sheet、安全区域、输入和无障碍分别落在 T01—T03、T12、T15。
- 三端契约、真实 Android 与 iOS 设备边界分别落在 T13—T15。
- 缺接口 / 凭证 / 平台的状态通过 G01—G10 记录，不用前端成功提示掩盖。
- 所有“Create”文件均为待 Gemini 实施的目标；本次只制定计划，没有声称这些模块已存在或测试通过。
