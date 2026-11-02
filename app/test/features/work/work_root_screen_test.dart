/// 工作 Tab 根页（WorkRootScreen）组件测试。
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/core/models/project.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/work/data/work_models.dart';
import 'package:worktodo_app/features/work/screens/work_root_screen.dart';
import 'package:worktodo_app/features/work/widgets/work_home_sections.dart';
import 'package:worktodo_app/features/work/widgets/work_trend_card.dart';
import 'package:worktodo_app/features/work/widgets/work_widgets.dart';

import 'work_test_fixtures.dart';

class _DelayedTokensStorage implements TokenStorage {
  @override
  int sessionGeneration = 0;
  final Completer<void> _ready = Completer<void>();
  String? _access;
  String? _refresh;
  int clears = 0;

  @override
  String? get accessToken => _access;

  @override
  String? get refreshToken => _refresh;

  @override
  bool get hasAccess => _access != null;

  void completeInit() {
    _access = 'saved-access';
    _refresh = 'saved-refresh';
    if (!_ready.isCompleted) {
      _ready.complete();
    }
  }

  @override
  Future<void> init() async {
    await _ready.future;
  }

  @override
  Future<void> save(
      {required String access,
      String? refresh,
      bool preserveSession = false}) async {
    if (!preserveSession) sessionGeneration++;
    _access = access;
    _refresh = refresh;
  }

  @override
  Future<void> clear() async {
    sessionGeneration++;
    clears++;
    _access = null;
    _refresh = null;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('工作首页展示 Header、重点待办、AI 入口、统计卡、趋势图与项目进度', (tester) async {
    tester.view.physicalSize = const Size(430, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final harness = await WorkTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      WorkRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));

    // 1. Header 用户名与项目
    expect(find.text('张三'), findsOneWidget);
    expect(find.text('工作台核心项目'), findsOneWidget);

    // 2. 重点待办与跟进标题与事项
    expect(find.text('重点待办与跟进'), findsOneWidget);
    expect(find.text('编制第三季度财务复核报告'), findsAtLeastNWidgets(1));

    // 3. AI 汇报入口
    expect(find.text('告诉 AI 最新进展'), findsOneWidget);
    expect(find.text('查看汇报'), findsOneWidget);

    // 4. 统计卡
    expect(find.text('待办事项'), findsOneWidget);
    expect(find.text('今日到期'), findsAtLeastNWidgets(1));
    expect(find.text('已逾期'), findsAtLeastNWidgets(1));

    // 5. 趋势图
    expect(find.byType(WorkTrendCard), findsOneWidget);

    // 6. 日程日历
    expect(find.byType(WorkHomeCalendar), findsOneWidget);

    // 7. 项目进度
    expect(find.byType(WorkProjectProgressSection), findsOneWidget);
    expect(find.text('示例企业协作项目'), findsOneWidget);
  });

  testWidgets('重点待办为空时展示空状态提示', (tester) async {
    final emptyApi = MockWorkApi(tasks: const []);
    final harness = await WorkTestHarness.create(api: emptyApi);

    await tester.pumpWidget(harness.wrap(
      WorkRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('暂无待办事项'), findsOneWidget);
  });

  testWidgets('网络断开时显示错误重试状态，点击重试恢复', (tester) async {
    final brokenApi = MockWorkApi(shouldThrowNetworkError: true);
    final harness = await WorkTestHarness.create(api: brokenApi);

    await tester.pumpWidget(harness.wrap(
      WorkRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));

    // 出现错误状态组件
    expect(find.byType(AppErrorState), findsOneWidget);
    expect(find.text('网络连接异常'), findsOneWidget);

    // 修复网络并点击重试
    brokenApi.shouldThrowNetworkError = false;
    await tester.tap(find.text('重试'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('重点待办与跟进'), findsOneWidget);
  });

  testWidgets('点击人轴锁定事项时触发只读提示，不直接修改', (tester) async {
    addTearDown(resetToastForTesting);
    tester.view.physicalSize = const Size(430, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final harness = await WorkTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      WorkRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));

    // 找到人轴锁定任务「人轴一期代码审查与架构验收」的复选框并点击
    final targetTile = find.ancestor(
      of: find.text('人轴一期代码审查与架构验收'),
      matching: find.byType(WorkTaskTile),
    );
    expect(targetTile, findsOneWidget);

    final toggleButton = find.descendant(
      of: targetTile,
      matching: find.bySemanticsLabel('完成任务'),
    );
    expect(toggleButton, findsOneWidget);
    await tester.tap(toggleButton);
    await tester.pump();

    // 验证提示 Toast 出现
    expect(find.text('该事项由人轴责任节点同步，请在责任节点中更新进度'), findsOneWidget);

    // 消化 Toast 定时器
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('启动时登录态初始化未完成时不提前加载，待认证成功后才加载工作台', (tester) async {
    final tokens = _DelayedTokensStorage();
    final requests = <http.Request>[];
    final client = ApiClient(
      tokenStorage: tokens,
      baseUrl: 'https://example.test/api/v1',
      httpClient: MockClient((request) async {
        requests.add(request);
        if (request.url.path.endsWith('/users/me')) {
          return http.Response(
            jsonEncode({
              'code': 200,
              'data': {'id': 1, 'username': 'test', 'nickname': '测试员'},
            }),
            200,
          );
        }
        if (request.url.path.endsWith('/companies/mine')) {
          return http.Response(
            jsonEncode({
              'code': 200,
              'data': {
                'items': [
                  {'id': 1, 'name': '测试公司', 'role': 'owner'}
                ]
              },
            }),
            200,
          );
        }
        if (request.url.path.endsWith('/projects')) {
          return http.Response(
            jsonEncode({
              'code': 200,
              'data': {
                'items': [
                  {'id': 10, 'name': '测试项目', 'company_id': 1}
                ]
              },
            }),
            200,
          );
        }
        if (request.url.path.contains('/tasks')) {
          return http.Response(
            jsonEncode({
              'code': 200,
              'data': {
                'items': [],
                'total': 0,
                'page': 1,
                'page_size': 100,
                'total_pages': 0,
              },
            }),
            200,
          );
        }
        if (request.url.path.contains('/tree')) {
          return http.Response(
            jsonEncode({
              'code': 200,
              'data': {'nodes': []},
            }),
            200,
          );
        }
        return http.Response(jsonEncode({'detail': 'Not found'}), 404);
      }),
    );

    final auth = AuthState(apiClient: client);
    final boot = auth.bootstrap();
    expect(auth.status, AuthStatus.authenticating);

    await tester.pumpWidget(
      ChangeNotifierProvider<AuthState>.value(
        value: auth,
        child: const MaterialApp(home: WorkRootScreen()),
      ),
    );
    await tester.pump();

    // 在认证初始化阶段，尚未发出 /tasks 请求
    expect(requests.where((r) => r.url.path.contains('/tasks')), isEmpty);
    expect(tokens.clears, 0);

    // 完成 token 初始化
    tokens.completeInit();
    await boot;
    await tester.pumpAndSettle();

    // bootstrap 完成后才发出工作台请求
    expect(requests.where((r) => r.url.path.contains('/tasks')), isNotEmpty);
    expect(tokens.clears, 0);
  });

  testWidgets('工作台项目进度请求被迟到的旧响应丢弃，不覆盖新项目结果', (tester) async {
    final harness = await WorkTestHarness.create();
    final completerA = Completer<ProjectProgressSummary>();

    harness.api.onProjectProgress =
        ({required int projectId, String? projectName}) {
      if (projectId == 1) {
        return completerA.future;
      }
      return Future.value(ProjectProgressSummary(
        projectId: projectId,
        projectName: projectName ?? '项目B',
        total: 10,
        completed: 8,
        percent: 80,
      ));
    };

    await tester.pumpWidget(harness.wrap(
      WorkRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // 切换到项目 2
    harness.authState
        .selectProject(const Project(id: 2, name: '项目B', companyId: 1));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // 项目 2 的进度返回，页面显示「项目B」
    expect(find.text('项目B'), findsWidgets);

    // 此时旧请求项目 1 迟到返回
    completerA.complete(const ProjectProgressSummary(
      projectId: 1,
      projectName: '旧项目A',
      total: 20,
      completed: 5,
      percent: 25,
    ));
    await tester.pumpAndSettle();

    // 验证：页面仍然显示「项目B」，旧项目「旧项目A」被丢弃，不会覆盖当前项目进度
    expect(find.text('旧项目A'), findsNothing);
    expect(find.text('项目B'), findsWidgets);
  });
}
