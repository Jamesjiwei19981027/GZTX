/// 工作 Tab 全部 11 个页面在双平台多尺寸（320窄屏、430宽屏、200%字号、深色模式）无溢出适配测试。
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/work/screens/work_calendar_screen.dart';
import 'package:worktodo_app/features/work/screens/work_chat_extract_screen.dart';
import 'package:worktodo_app/features/work/screens/work_kanban_screen.dart';
import 'package:worktodo_app/features/work/screens/work_quick_add_screen.dart';
import 'package:worktodo_app/features/work/screens/work_root_screen.dart';
import 'package:worktodo_app/features/work/screens/work_search_screen.dart';
import 'package:worktodo_app/features/work/screens/work_statistics_screen.dart';
import 'package:worktodo_app/features/work/screens/work_task_detail_screen.dart';
import 'package:worktodo_app/features/work/screens/work_task_edit_screen.dart';
import 'package:worktodo_app/features/work/screens/work_tasks_screen.dart';
import 'package:worktodo_app/features/work/screens/work_trash_screen.dart';

import '../../helpers/responsive_checker.dart';
import 'work_test_fixtures.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Widget provideAuth(AuthState auth, Widget child) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthState>.value(value: auth),
      ],
      child: child,
    );
  }

  final pageBuilders = <String, Widget Function(WorkTestHarness h)>{
    'work-root': (h) => WorkRootScreen(api: h.api, authState: h.authState),
    'work-tasks': (h) => WorkTasksScreen(api: h.api, authState: h.authState),
    'work-kanban': (h) => WorkKanbanScreen(api: h.api, authState: h.authState),
    'work-calendar': (h) =>
        WorkCalendarScreen(api: h.api, authState: h.authState),
    'work-statistics': (h) =>
        WorkStatisticsScreen(api: h.api, authState: h.authState),
    'work-trash': (h) => WorkTrashScreen(api: h.api, authState: h.authState),
    'work-task-detail': (h) =>
        WorkTaskDetailScreen(taskId: 101, api: h.api),
    'work-task-edit': (h) =>
        WorkTaskEditScreen(api: h.api, authState: h.authState),
    'work-quick-add': (h) =>
        WorkQuickAddScreen(api: h.api, authState: h.authState),
    'work-search': (h) =>
        WorkSearchScreen(api: h.api, authState: h.authState),
    'work-chat-extract': (h) =>
        WorkChatExtractScreen(api: h.api, authState: h.authState),
  };

  for (final entry in pageBuilders.entries) {
    testWidgets('多尺寸无溢出适配测试: ${entry.key}', (tester) async {
      final harness = await WorkTestHarness.create();
      await ResponsiveChecker.checkAdaptiveLayout(
        tester: tester,
        widget: provideAuth(harness.authState, entry.value(harness)),
      );
      await tester.pumpAndSettle();
    });
  }

  testWidgets('矮屏横屏画布（800x600）工作台展示错误状态或空状态无布局溢出', (tester) async {
    tester.view.physicalSize = const Size(800, 600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final brokenApi = MockWorkApi(shouldThrowNetworkError: true);
    final harness = await WorkTestHarness.create(api: brokenApi);

    await tester.pumpWidget(harness.wrap(
      WorkRootScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byType(AppErrorState), findsOneWidget);
  });
}
