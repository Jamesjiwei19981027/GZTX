# GZTX 移动端原生底座开发者指南 (T01–T09)

> 本文档面向后续所有原生功能模块（T01 登录注册、T02 工作、T03 项目、T04 人轴、T05 材料、T06 知识、T07 汇报、T08 消息、T09 我的）的开发者。底座已封装好接口客户端、全局登录态、自适应控件库、分 Tab 路由骨架与测试工具，遵循以下指引即可快速开发与交付。

---

## 1. 目录所有权与协作规范

- **只修改自己的目录**：各任务包仅在 `lib/features/<自己目录>/` 与 `test/features/<自己目录>/` 下编写业务逻辑，并修改 `lib/features/<自己目录>/routes.dart`。
- **不要直接改动共享底座**：如需增添公共依赖或全局能力，在任务回传报告中提出“共享改动申请”，由总控统一合并。
- **全中文文案**：界面展示文案、错误提示、按钮操作一律使用精炼中文，严禁英文残留。

---

## 2. 如何发起网络请求 (`ApiClient`)

底座在 `lib/core/api/` 提供了统一的 API 客户端，自动处理基地址配置（`--dart-define=API_BASE_URL`）、令牌安全存储、默认 30 秒超时控制（超时抛出 `NetworkException`）、并发 401 单飞无感续期，以及最终 401 失败时的全局自动登出清理。

### 2.1 获取 ApiClient
```dart
import 'package:worktodo_app/core/auth/auth_provider.dart';

// 方式一：在 Widget 树中通过上下文直接读取
final client = context.apiClient;

// 方式二：在服务或数据层直接使用
import 'package:worktodo_app/core/api/api_client.dart';
final client = ApiClient();
```

### 2.2 请求与统一信封解包
后端接口返回 `{code: 200, message: "success", data: ...}` 标准信封时，`ApiClient` 会自动解包并直接返回 `data`；当 `code != 200` 或 HTTP 状态码异常时，会自动抛出结构化异常：

```dart
try {
  // 发起 GET 请求（无需手动拼接 token，已自动附带；默认 30s 超时）
  final dynamic data = await context.apiClient.get(
    '/tasks',
    query: {'status': '0', 'page': '1'},
  );
  // data 即为接口返回的业务载荷（无需再访问 ['data']）
} on ValidationException catch (e) {
  // 422 参数校验错误，e.errors 提供字段名与错误信息的 Map
  showAppToast(context, e.message, type: ToastType.error);
} on ApiException catch (e) {
  // 业务失败，e.message 自动提取后端下发的中文 message 或 detail
  showAppToast(context, e.message, type: ToastType.error);
} on NetworkException catch (e) {
  // 断网或连接超时（超过 30s 自动转为 NetworkException）
  showAppToast(context, '网络连接异常或请求超时，请检查网络', type: ToastType.warning);
} on AuthException catch (e) {
  // 登录态失效且无法续期，底层已自动清理凭据并由路由守卫重定向至登录页
  showAppToast(context, e.message, type: ToastType.error);
}
```

---

## 3. 如何获取与使用全局状态（用户、企业、项目）

通过 `lib/core/auth/auth_provider.dart` 的 Context 拓展，可直接响应式获取当前用户与工作区：

```dart
import 'package:worktodo_app/core/auth/auth_provider.dart';

// 当前用户信息（User 模型）
final user = context.currentUser;
final nickname = user?.displayName; // 优先昵称，回退用户名

// 当前所在企业/公司
final company = context.currentCompany;
final companyId = company?.id;

// 当前选中的项目
final project = context.currentProject;
final projectId = project?.id;

// 切换当前项目
context.authStateRead.selectProject(newProject);

// 切换当前企业
await context.authStateRead.selectCompany(newCompany);
```

---

## 4. 如何注册页面与路由

每个任务模块拥有预建的 `lib/features/<目录>/routes.dart`。各模块开发只需在此文件中增加具体页面路由，总路由 `app_router.dart` 会自动聚合。

```dart
// 在 lib/features/work/routes.dart 中：
final List<RouteBase> workRoutes = [
  GoRoute(
    path: '/work',
    name: 'work-root',
    builder: (context, state) => const WorkRootScreen(),
    routes: [
      GoRoute(
        path: 'kanban',
        name: 'work-kanban', // 命名沿用 REGISTERED_SCREENS
        builder: (context, state) => const WorkKanbanScreen(),
      ),
      GoRoute(
        path: 'task/:id',
        name: 'work-task-detail',
        builder: (context, state) => TaskDetailScreen(
          taskId: state.pathParameters['id']!,
        ),
      ),
    ],
  ),
];
```

### 页面跳转与传参：
```dart
// 跳转子页面
context.push('/work/kanban');

// 路由返回
context.pop();
```

### 4.1 Tab 点击与原生页面栈行为（与网页版有意不同的差异说明）
- **切 Tab 保留各自页面栈**：在工作 Tab 进入二级页面后切换到人轴 Tab，再切回工作 Tab，二级页面依然保留，不会丢失浏览进度。
- **再次点击当前 Tab 回到该 Tab 根页**：当用户已经处于某个 Tab（例如工作 Tab 二级页）时，再次点击底部的“工作”Tab，将重置该分支栈并直接回到工作根页。
  > **与网页版差异及理由**：在手机网页版中点击当前选中 Tab 为无操作（no-op）；但在移动端原生 App 规范（如 iOS App Store、微信等）中，再次点击当前处于激活状态的底部 Tab 项代表快速回到该模块首页/顶部，相比网页版的无操作更符合移动端用户的单手操作直觉与原生操作习惯。

### 4.2 返回键裁决规则与运行时实现方式说明
返回行为依照 `mobileRoutes.ts` 规定的四步裁决顺序在 Flutter 原生运行时落地：
1. **优先关闭弹层**：在 Flutter 架构中，所有对话框（Dialog）、底部浮层（BottomSheet）、操作菜单（ActionSheet）均作为独立的 `ModalRoute` 压入当前 Navigator 栈。因此系统的返回键事件或 PopScope 默认首先弹出最顶层的 `ModalRoute`，天然实现“先关弹层”，无需业务页面显式手动接管。
2. **未保存内容二次确认拦截**：在包含表单编辑的页面外层包裹 `AppBackScope(isDirty: _hasUnsavedChanges)`。当 `isDirty == true` 时，`AppBackScope` 会拦截系统返回键或左滑返回手势，弹出红色警示二次确认框（“放弃并退出 / 继续编辑”）。
3. **页面正常出栈**：在非 dirty 状态且无浮层弹层时，当前二级页执行 `context.pop()` 正常退出页面。
4. **Tab 根页退出应用**：当已处于 5 个 Tab 的根页面且栈中已无更多页面时，触发系统默认的切后台或退出应用操作。
`resolveBackAction` 纯函数作为该四步决策的算法逻辑定义与单元测试真源。

```dart
import 'package:worktodo_app/design/design.dart';

// 在有编辑表单的页面最外层使用 AppBackScope
AppBackScope(
  isDirty: _hasUnsavedChanges, // 当有改动且未保存时为 true
  child: AppScaffold(
    title: '编辑任务',
    body: ...,
  ),
)
```

---

## 5. 自适应控件库使用指南 (`lib/design/`)

同一个控件在 iOS 端渲染为 Cupertino 风格、在 Android 端渲染为 Material 风格。统一自 `package:worktodo_app/design/design.dart` 导出：

### 5.1 常用控件一览

| 控件类型 | 组件名称 | iOS 端表现 | Android 端表现 |
|---|---|---|---|
| 页面骨架 | `AppScaffold` | `CupertinoPageScaffold` + `CupertinoNavigationBar` | `Scaffold` + `AppBar` |
| 底部 5 Tab 导航栏 | `AppTabBar` | `CupertinoTabBar`（内置可选 `badges` 徽标映射与消息未读数支持） | Material 3 `NavigationBar`（支持徽标红点与数字） |
| 分段切换 | `AppSegmentedControl` | 胶囊式滑动指示器 (`CupertinoSlidingSegmentedControl`) | Material 下划线指示器 |
| 按钮 | `AppButton` | 触感压暗圆角按钮 | Material 3 `ElevatedButton` / `OutlinedButton` |
| 输入框 | `AppTextField` | 浅灰圆角底框，支持一键清空与自增高 | Material 3 轮廓输入框 |
| 开关 | `AppSwitch` | `CupertinoSwitch` | Material 3 `Switch` |
| 列表项与分组 | `AppListSection` / `AppListTile` | 卡片内嵌分组、内联细分割线、iOS 箭头 | Material ListTile 与卡片容器 |
| 图标集 | `AppIcon('name')` | 自动映射 `CupertinoIcons` | 自动映射 Material `Icons` |
| 二次确认框 | `showAppConfirmDialog` | `CupertinoAlertDialog` | Material `AlertDialog` (危险操作红字警示) |
| 操作菜单 | `showAppActionSheet` | `CupertinoActionSheet` | 底部弹出操作表单列表 |
| 底部面板 | `showAppBottomSheet` | iOS 风格半屏模态窗，带关闭手柄 | Material 3 Modal Bottom Sheet |
| 日期选择器 | `showAppDatePicker` | 滚轮式弹出日期弹层 (`CupertinoDatePicker`) | 日历网格式对话框 (`showDatePicker`) |
| 日期时间选择器 | `showAppDateTimePicker` | 滚轮式弹出日期+时间 (`dateAndTime`) | 日期+时间对话框组合 (`showDatePicker` + `showTimePicker`) |
| 状态提示 | `AppEmptyState` / `AppErrorState` | 统一空状态、无权限提示与重试入口 | 统一空状态、无权限提示与重试入口 |
| 轻提示 | `showAppToast` | 顶部悬浮圆角自适应气泡（支持单例去重与 dispose） | 顶部悬浮圆角自适应气泡（支持单例去重与 dispose） |

### 5.2 控件使用示例
```dart
import 'package:worktodo_app/design/design.dart';

// 1. 按钮使用
AppButton(
  label: '保存任务',
  variant: AppButtonVariant.primary, // primary | secondary | danger
  size: AppButtonSize.md, // sm | md | lg
  isLoading: _submitting,
  onPressed: _handleSave,
);

// 2. 危险二次确认弹窗
final confirmed = await showAppConfirmDialog(
  context: context,
  title: '确认删除',
  message: '删除后此任务将移入回收站。',
  confirmLabel: '删除',
  isDestructive: true,
);

// 3. 自适应图标（完全对齐 Web 端 AppIcon.tsx 命名）
AppIcon('work')
AppIcon('axis')
AppIcon('filter')
AppIcon('trash')
```

---

## 6. 如何编写测试与双平台截图对比（Golden Tests）

### 6.1 组件与双平台 Golden 截图测试（跨平台约定）
> **重要约定**：
> - **Golden 只在 Windows 上生成和比对**：由于不同操作系统（Windows、macOS、Linux CI）底层字体光栅化渲染引擎与亚像素抗锯齿存在微小差异，**所有 Golden 像素比对测试必须添加 `tags: ['golden']` 标签**。
> - **CI 默认跳过 Golden 测试**：CI 流水线（特别是 Linux 容器）默认执行 `flutter test --exclude-tags golden`，避免跨平台像素抖动导致误报；本地 Windows 开发者在修改控件外观时执行 `flutter test --update-goldens` 进行基准图生成与比对。
> - **开源中文字体与图标字体内置装载**：测试环境会自动装载仓库内的开源中文字体（`Noto Sans SC` 子集，带 OFL 许可证）以及 `FontManifest.json` 中定义的全部图标字体（MaterialIcons、CupertinoIcons），彻底杜绝方块乱码；若装载失败测试将直接报错中断，严禁静默降级。

```dart
import 'package:flutter_test/flutter_test.dart';
import '../../helpers/golden_test_helper.dart';

void main() {
  testWidgets(
    '我的页面渲染与双平台外观对比',
    tags: ['golden'], // 必须标记 golden 标签，CI 默认跳过
    (tester) async {
      await testAdaptiveGolden(
        tester: tester,
        widget: const MyFeatureScreen(),
        goldenFileNamePrefix: 'my_feature_screen',
      );
    },
  );
}
```
本地运行 `flutter test --update-goldens` 即可在 Windows 上分别生成并比对 iOS 与 Android 两张基准截图。

### 6.2 320/430 宽、字号 200%、深色模式适配测试
```dart
import '../../helpers/responsive_checker.dart';

testWidgets('多尺寸与极端无障碍适配检查', (tester) async {
  await ResponsiveChecker.checkAdaptiveLayout(
    tester: tester,
    widget: const MyFeatureScreen(),
  );
});
```

---

## 7. 运行与调试

```bash
# 1. 运行静态代码检查（必须 0 错误 0 警告）
cd app && flutter analyze

# 2. 运行所有常规单元测试（CI 默认执行，排除 Windows 专有的 golden 像素比对）
flutter test --exclude-tags golden

# 3. 在本地 Windows 上执行并生成/校验 Golden 截图
flutter test test/design/component_gallery_golden_test.dart

# 4. 以原生重构模式启动 APP（连接至本地后端）
flutter run -d <设备ID> --dart-define=USE_NATIVE=true
```
