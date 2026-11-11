import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/axis/screens/axis_root_screen.dart';
import 'package:worktodo_app/features/projects/screens/project_switch_screen.dart';
import 'package:worktodo_app/features/work/screens/work_root_screen.dart';
import 'package:worktodo_app/router/app_destination.dart';

import 'support/projects_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  tearDown(resetToastForTesting);

  testWidgets('工作 Tab push 切换页后选项目应返回工作页并更新当前项目', (tester) async {
    final (auth, router) = await _pumpApp(tester);

    expect(auth.currentProject?.id, 11);
    // 点击真实顶部入口，经 AppDestination.push / context.pushNamed 打开。
    await tester.tap(find.text('智能客服 2.0').first);
    await tester.pumpAndSettle();
    expect(find.byType(ProjectSwitchScreen), findsOneWidget);
    expect(router.canPop(), isTrue);

    await tester.tap(find.text('数据中台'));
    await tester.pumpAndSettle();

    expect(auth.currentProject?.id, 12);
    expect(find.byType(ProjectSwitchScreen), findsNothing);
    expect(find.byType(WorkRootScreen), findsOneWidget);
    expect(router.routerDelegate.currentConfiguration.uri.path, '/work');
    expect(find.text('数据中台'), findsWidgets);
    expect(find.text('已切换到「数据中台」'), findsOneWidget);

    // 再打开并切回，确认通知刷新后没有残留页面或损坏 push 的返回栈。
    await tester.tap(find.text('数据中台').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('智能客服 2.0'));
    await tester.pumpAndSettle();
    expect(auth.currentProject?.id, 11);
    expect(find.byType(ProjectSwitchScreen), findsNothing);
    expect(find.byType(WorkRootScreen), findsOneWidget);
    expect(router.canPop(), isFalse);
    await _closeApp(tester);
  });

  testWidgets('点击已选项目也应关闭切换页', (tester) async {
    final (auth, router) = await _pumpApp(tester);
    await tester.tap(find.text('智能客服 2.0').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('智能客服 2.0'));
    await tester.pumpAndSettle();
    expect(auth.currentProject?.id, 11);
    expect(find.byType(ProjectSwitchScreen), findsNothing);
    expect(find.byType(WorkRootScreen), findsOneWidget);
    expect(router.canPop(), isFalse);
    await _closeApp(tester);
  });

  testWidgets('从人轴 push 切换页后应返回人轴并显示新项目', (tester) async {
    final (auth, router) = await _pumpApp(tester, location: '/axis');
    final axisContext = tester.element(find.byType(AxisRootScreen));
    final axisState = tester.state(find.byType(AxisRootScreen));
    // 人轴目前自带项目选择 sheet；覆盖其他入口使用的同一跨模块 push API。
    final popped =
        const AppDestination('project-switch').push<void>(axisContext);
    await tester.pumpAndSettle();
    await tester.tap(find.text('数据中台'));
    await tester.pumpAndSettle();
    await popped;
    expect(auth.currentProject?.id, 12);
    expect(find.byType(ProjectSwitchScreen), findsNothing);
    expect(find.byType(AxisRootScreen), findsOneWidget);
    expect(tester.state(find.byType(AxisRootScreen)), same(axisState));
    expect(find.text('数据中台'), findsOneWidget);
    expect(router.routerDelegate.currentConfiguration.uri.path, '/axis');
    expect(router.canPop(), isFalse);
    await _closeApp(tester);
  });

  for (final location in ['/work', '/axis']) {
    testWidgets('从 $location 选择全部项目应进入工作总览且清除切换页', (tester) async {
      final (auth, router) = await _pumpApp(tester, location: location);
      final entry = location == '/work' ? WorkRootScreen : AxisRootScreen;
      const AppDestination('project-switch')
          .push<void>(tester.element(find.byType(entry)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('全部项目'));
      await tester.pumpAndSettle();
      expect(auth.allProjectsSelected, isTrue);
      expect(auth.currentProject, isNull);
      expect(find.byType(ProjectSwitchScreen), findsNothing);
      expect(find.byType(WorkRootScreen), findsOneWidget);
      expect(router.routerDelegate.currentConfiguration.uri.path, '/work');
      expect(router.canPop(), isFalse);
      await _closeApp(tester);
    });
  }

  testWidgets('系统返回关闭切换页且不改变当前项目', (tester) async {
    final (auth, router) = await _pumpApp(tester);
    await tester.tap(find.text('智能客服 2.0').first);
    await tester.pumpAndSettle();
    expect(await router.routerDelegate.popRoute(), isTrue);
    await tester.pumpAndSettle();
    expect(auth.currentProject?.id, 11);
    expect(find.byType(ProjectSwitchScreen), findsNothing);
    expect(find.byType(WorkRootScreen), findsOneWidget);
    await _closeApp(tester);
  });
}

Future<(AuthState, GoRouter)> _pumpApp(WidgetTester tester,
    {String location = '/work'}) async {
  tester.view.physicalSize = const Size(430, 932);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final harness = ProjectsTestHarness();
  final auth = await harness.bootstrap();
  harness.helper.whenGet('/tasks', {'items': [], 'total': 0});
  harness.helper.whenGet('/notifications/collab', {'items': []});
  harness.helper.whenGet('/users/me/ui-prefs', {'ui': {}});
  for (final (id, name) in [(11, '智能客服 2.0'), (12, '数据中台')]) {
    harness.helper.whenGet('/projects/$id/tree', {'nodes': []});
    harness.helper.whenGet('/projects/$id', projectJson(id: id, name: name));
    harness.helper.whenGet('/projects/$id/members', {'items': []});
    harness.helper.whenGet('/projects/$id/my-permissions', permissionsJson());
    harness.helper.whenGet('/projects/$id/agent-reports', {'items': []});
  }
  // ProjectsTestHarness.pumpApp 挂载真实 AppRouter，包含 refreshListenable
  // 与 StatefulShellRoute；仅 HTTP 响应使用测试数据。
  await harness.pumpApp(tester, location: location);
  final entry = location == '/work' ? WorkRootScreen : AxisRootScreen;
  final router = GoRouter.of(tester.element(find.byType(entry)));
  addTearDown(() async {
    resetToastForTesting();
    await tester.pumpWidget(const SizedBox.shrink());
    router.dispose();
    auth.dispose();
  });
  return (auth, router);
}

Future<void> _closeApp(WidgetTester tester) async {
  resetToastForTesting();
  await tester.pumpWidget(const SizedBox.shrink());
}
