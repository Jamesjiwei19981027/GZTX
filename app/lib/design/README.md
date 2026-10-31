# GZTX 移动端原生底座开发者指南 (T01–T09)

> 本文档面向后续所有原生功能模块（T01 登录注册、T02 工作、T03 项目、T04 人轴、T05 材料、T06 知识、T07 汇报、T08 消息、T09 我的）的开发者。底座已封装好接口客户端、全局登录态、自适应控件库、分 Tab 路由骨架与测试工具，遵循以下指引即可快速开发与交付。

---

## 1. 目录所有权与协作规范

- **只修改自己的目录**：各任务包仅在 `lib/features/<自己目录>/` 与 `test/features/<自己目录>/` 下编写业务逻辑，并修改 `lib/features/<自己目录>/routes.dart`。
- **不要直接改动共享底座**：如需增添公共依赖或全局能力，在任务回传报告中提出“共享改动申请”，由总控统一合并。
- **全中文文案**：界面展示文案、错误提示、按钮操作一律使用精炼中文，严禁英文残留。

---

## 2. 如何发起网络请求 (`ApiClient`)

底座在 `lib/core/api/` 提供了统一的 API 客户端，自动处理基地址配置（`--dart-define=API_BASE_URL`）、令牌安全存储与并发 401 单飞无感续期。

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
  // 发起 GET 请求（无需手动拼接 token，已自动附带）
  final dynamic data = await context.apiClient.get(
    '/tasks/',
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
  // 断网或连接超时
  showAppToast(context, '网络连接异常，请检查网络', type: ToastType.warning);
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

### 表单未保存拦截（返回键安全守护）：
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
| 分段切换 | `AppSegmentedControl` | 胶囊式滑动指示器 (`CupertinoSlidingSegmentedControl`) | Material 下划线指示器 |
| 按钮 | `AppButton` | 触感压暗圆角按钮 | Material 3 `ElevatedButton` / `OutlinedButton` |
| 输入框 | `AppTextField` | 浅灰圆角底框，支持一键清空与自增高 | Material 3 轮廓输入框 |
| 开关 | `AppSwitch` | `CupertinoSwitch` | Material 3 `Switch` |
| 列表项与分组 | `AppListSection` / `AppListTile` | 卡片内嵌分组、内联细分割线、iOS 箭头 | Material ListTile 与卡片容器 |
| 图标集 | `AppIcon('name')` | 自动映射 `CupertinoIcons` | 自动映射 Material `Icons` |
| 二次确认框 | `showAppConfirmDialog` | `CupertinoAlertDialog` | Material `AlertDialog` (危险操作红字警示) |
| 操作菜单 | `showAppActionSheet` | `CupertinoActionSheet` | 底部弹出操作表单列表 |
| 底部面板 | `showAppBottomSheet` | iOS 风格半屏模态窗，带关闭手柄 | Material 3 Modal Bottom Sheet |
| 日期选择器 | `showAppDatePicker` | 滚轮式弹出弹层 (`CupertinoDatePicker`) | 日历网格式对话框 (`showDatePicker`) |
| 状态提示 | `AppEmptyState` / `AppErrorState` | 统一空状态、无权限提示与重试入口 | 统一空状态、无权限提示与重试入口 |
| 轻提示 | `showAppToast` | 顶部悬浮圆角自适应气泡 | 顶部悬浮圆角自适应气泡 |

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

### 6.1 组件与双平台 Golden 截图测试
在 `test/features/<任务名>/` 目录下编写测试，使用 `test/helpers/golden_test_helper.dart`：

```dart
import 'package:flutter_test/flutter_test.dart';
import '../../helpers/golden_test_helper.dart';

void main() {
  testWidgets('我的页面渲染与双平台外观对比', (tester) async {
    await testAdaptiveGolden(
      tester: tester,
      widget: const MyFeatureScreen(),
      goldenFileNamePrefix: 'my_feature_screen',
    );
  });
}
```
运行 `flutter test --update-goldens` 即可在本地 Windows 上分别生成 iOS 与 Android 两张基准截图，中文已自动加载宋体/黑体，不会出现豆腐块乱码。

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
# 1. 运行静态代码检查
cd app && flutter analyze

# 2. 运行所有单元测试与 Golden 截图测试
flutter test

# 3. 以原生重构模式启动 APP（连接至本地后端）
flutter run -d <设备ID> --dart-define=USE_NATIVE=true
```
