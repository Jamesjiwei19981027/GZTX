import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/axis/screens/axis_node_detail_screen.dart';
import 'package:worktodo_app/features/axis/screens/axis_progress_screen.dart';

import 'axis_test_harness.dart';

/// 人轴详情页的路由行为：
/// - 深链进入别的项目的节点时，材料/知识库链接必须带解析出的项目 ID；
/// - 同一路由换节点 ID 时必须重新加载，不能旧数据配新 ID。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const secondProjectId = 2;

  void mockSecondProject(AxisTestHarness harness) {
    harness.helper.whenGet(
      '/projects/$secondProjectId/tree',
      {'project_id': secondProjectId, 'nodes': AxisTestHarness.defaultTree()},
      query: {'format': 'nested'},
    );
    harness.helper.whenGet(
      '/projects/$secondProjectId/members',
      AxisTestHarness.membersPayload(),
    );
    harness.helper.whenGet(
      '/projects/$secondProjectId/my-permissions',
      AxisTestHarness.defaultPermissions(isPm: false),
    );
    harness.helper.whenGet(
      '/projects/$secondProjectId',
      AxisTestHarness.projectJson(id: secondProjectId, name: '第二个项目'),
    );
  }

  /// 只挂载人轴详情/进度和一个占位材料页，用来断言跳转时带的参数。
  GoRouter buildRouter(AxisTestHarness harness, {required int projectId}) {
    int? idOf(GoRouterState state) => int.tryParse(
          state.pathParameters['id'] ?? '',
        );
    return GoRouter(
      initialLocation: '/axis/node/102',
      routes: [
        GoRoute(
          path: '/axis/node/:id',
          builder: (context, state) => AxisNodeDetailScreen(
            nodeId: idOf(state) ?? 0,
            projectId: projectId,
            api: harness.api,
          ),
        ),
        GoRoute(
          path: '/axis/node/:id/progress',
          builder: (context, state) => AxisProgressScreen(
            nodeId: idOf(state) ?? 0,
            projectId: int.tryParse(
              state.uri.queryParameters['projectId'] ?? '',
            ),
            api: harness.api,
          ),
        ),
        GoRoute(
          path: '/evidence/submit',
          name: 'axis-evidence-submit',
          builder: (context, state) => Scaffold(
            body: Text(
              'submit:${state.uri.queryParameters['projectId']}:'
              '${state.uri.queryParameters['nodeId']}',
            ),
          ),
        ),
        GoRoute(
          path: '/evidence/wiki',
          builder: (context, state) => Scaffold(
            body: Text('wiki:${state.uri.queryParameters['projectId']}'),
          ),
        ),
      ],
    );
  }

  Future<GoRouter> pumpRouted(
    WidgetTester tester,
    AxisTestHarness harness, {
    required int projectId,
  }) async {
    tester.view.physicalSize = const Size(430, 2200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(resetToastForTesting);

    final router = buildRouter(harness, projectId: projectId);
    await tester.pumpWidget(
      ChangeNotifierProvider<AuthState>.value(
        value: harness.authState,
        child: MaterialApp.router(
          routerConfig: router,
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: const [Locale('zh', 'CN')],
        ),
      ),
    );
    await tester.pumpAndSettle();
    return router;
  }

  testWidgets('深链进入项目 B 的节点时，材料与知识库链接都带项目 B', (tester) async {
    final harness = await AxisTestHarness.create();
    mockSecondProject(harness);
    // 全局仍选中项目 A，详情页解析出的是 B。
    expect(harness.authState.currentProject?.id, AxisTestHarness.projectId);

    final router =
        await pumpRouted(tester, harness, projectId: secondProjectId);
    expect(find.text('林悦 · 责任详情'), findsOneWidget);

    await tester.ensureVisible(find.text('提交材料'));
    await tester.tap(find.text('提交材料'));
    await tester.pumpAndSettle();
    expect(find.text('submit:2:102'), findsOneWidget);

    router.pop();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('打开项目知识库'));
    await tester.tap(find.text('打开项目知识库'));
    await tester.pumpAndSettle();
    expect(find.text('wiki:2'), findsOneWidget);

    router.pop();
    await tester.pumpAndSettle();
    // 「材料」Tab 里的提交入口同样要带项目 B。
    await tester.tap(find.text('材料'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('提交新证据材料'));
    await tester.pumpAndSettle();
    expect(find.text('submit:2:102'), findsOneWidget);
  });

  testWidgets('进度页的提交材料入口沿用详情页解析出的项目', (tester) async {
    final harness = await AxisTestHarness.create();
    mockSecondProject(harness);
    await pumpRouted(tester, harness, projectId: secondProjectId);

    await tester.tap(find.text('进度'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('查看进度与记录'));
    await tester.pumpAndSettle();
    expect(
      harness.helper.history.any(
        (r) => r.url.path == '/api/v1/nodes/102/progress',
      ),
      isTrue,
    );

    await tester.ensureVisible(find.text('提交材料'));
    await tester.tap(find.text('提交材料'));
    await tester.pumpAndSettle();
    expect(find.text('submit:2:102'), findsOneWidget);
  });

  testWidgets('同一路由换节点 ID 时重新加载，不保留旧节点数据', (tester) async {
    final harness = await AxisTestHarness.create();
    final router = await pumpRouted(
      tester,
      harness,
      projectId: AxisTestHarness.projectId,
    );
    expect(find.text('林悦 · 责任详情'), findsOneWidget);
    expect(find.text('事项详情'), findsNothing);

    router.go('/axis/node/201');
    await tester.pumpAndSettle();

    expect(
      harness.helper.history.any((r) => r.url.path == '/api/v1/nodes/201'),
      isTrue,
      reason: '换节点后必须重新拉取新节点',
    );
    expect(find.text('事项详情'), findsOneWidget);
    expect(find.text('交互原型设计'), findsOneWidget);
    expect(find.text('林悦 · 责任详情'), findsNothing);
  });

  testWidgets('只有node_id的通知进度链接提交材料时反查真实项目，不用全局项目', (tester) async {
    final harness = await AxisTestHarness.create();
    mockSecondProject(harness);
    harness.helper.whenGet('/users/me/people-axis', {
      'projects': [
        {
          'project_id': 2,
          'nodes': [
            {'id': 102}
          ]
        }
      ],
    });
    final router = await pumpRouted(tester, harness, projectId: 2);
    router.go('/axis/node/102/progress');
    await tester.pumpAndSettle();
    expect(harness.authState.currentProject?.id, AxisTestHarness.projectId);
    await tester.ensureVisible(find.text('提交材料'));
    await tester.tap(find.text('提交材料'));
    await tester.pumpAndSettle();
    expect(find.text('submit:2:102'), findsOneWidget);
  });
}
