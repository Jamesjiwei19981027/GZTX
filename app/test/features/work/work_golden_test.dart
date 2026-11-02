/// 工作 Tab 全部 11 个页面在 iOS / Android 双平台的视觉 Golden 截图测试。
library;

import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:worktodo_app/core/auth/auth_state.dart';
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

import '../../helpers/golden_test_helper.dart';
import 'work_test_fixtures.dart';

/// 截图基准图是 2026-11-02 生成的：固定时钟，让页面里的“今天/逾期/日历月份”与运行日期无关。
void goldenAtFixedDay(
  String description,
  Future<void> Function(WidgetTester tester) body, {
  List<String> tags = const [],
}) {
  testWidgets(description, tags: tags, (tester) {
    return withClock(Clock.fixed(DateTime(2026, 11, 2, 9)), () => body(tester));
  });
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Widget wrapWithAuth(AuthState auth, Widget child) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthState>.value(value: auth),
      ],
      child: child,
    );
  }

  goldenAtFixedDay(
    '工作根页 (work-root) 双平台 Golden',
    tags: ['golden'],
    (tester) async {
      final harness = await WorkTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: wrapWithAuth(
          harness.authState,
          WorkRootScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'work_root',
      );
    },
  );

  goldenAtFixedDay(
    '任务列表页 (work-tasks) 双平台 Golden',
    tags: ['golden'],
    (tester) async {
      final harness = await WorkTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: wrapWithAuth(
          harness.authState,
          WorkTasksScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'work_tasks',
      );
    },
  );

  goldenAtFixedDay(
    '工作看板页 (work-kanban) 双平台 Golden',
    tags: ['golden'],
    (tester) async {
      final harness = await WorkTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: wrapWithAuth(
          harness.authState,
          WorkKanbanScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'work_kanban',
      );
    },
  );

  goldenAtFixedDay(
    '工作日历页 (work-calendar) 双平台 Golden',
    tags: ['golden'],
    (tester) async {
      final harness = await WorkTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: wrapWithAuth(
          harness.authState,
          WorkCalendarScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'work_calendar',
      );
    },
  );

  goldenAtFixedDay(
    '统计报表页 (work-statistics) 双平台 Golden',
    tags: ['golden'],
    (tester) async {
      final harness = await WorkTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: wrapWithAuth(
          harness.authState,
          WorkStatisticsScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'work_statistics',
      );
    },
  );

  goldenAtFixedDay(
    '回收站页 (work-trash) 双平台 Golden',
    tags: ['golden'],
    (tester) async {
      final harness = await WorkTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: wrapWithAuth(
          harness.authState,
          WorkTrashScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'work_trash',
      );
    },
  );

  goldenAtFixedDay(
    '任务详情页 (work-task-detail) 双平台 Golden',
    tags: ['golden'],
    (tester) async {
      final harness = await WorkTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: wrapWithAuth(
          harness.authState,
          WorkTaskDetailScreen(taskId: 101, api: harness.api),
        ),
        goldenFileNamePrefix: 'work_task_detail',
      );
    },
  );

  goldenAtFixedDay(
    '新建编辑任务页 (work-task-edit) 双平台 Golden',
    tags: ['golden'],
    (tester) async {
      final harness = await WorkTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: wrapWithAuth(
          harness.authState,
          WorkTaskEditScreen(
            taskId: 101,
            api: harness.api,
            authState: harness.authState,
          ),
        ),
        goldenFileNamePrefix: 'work_task_edit',
      );
    },
  );

  goldenAtFixedDay(
    '快速新建页 (work-quick-add) 双平台 Golden',
    tags: ['golden'],
    (tester) async {
      final harness = await WorkTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: wrapWithAuth(
          harness.authState,
          WorkQuickAddScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'work_quick_add',
      );
    },
  );

  goldenAtFixedDay(
    '全局搜索页 (work-search) 双平台 Golden',
    tags: ['golden'],
    (tester) async {
      final harness = await WorkTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: wrapWithAuth(
          harness.authState,
          WorkSearchScreen(
            api: harness.api,
            authState: harness.authState,
            initialQuery: '复核',
          ),
        ),
        goldenFileNamePrefix: 'work_search',
      );
    },
  );

  goldenAtFixedDay(
    '聊天文本提取页 (work-chat-extract) 双平台 Golden',
    tags: ['golden'],
    (tester) async {
      final harness = await WorkTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: wrapWithAuth(
          harness.authState,
          WorkChatExtractScreen(
            api: harness.api,
            authState: harness.authState,
            initialText: '请在周五下班前整理完毕交付报告并发送给产品总监。',
          ),
        ),
        goldenFileNamePrefix: 'work_chat_extract',
      );
    },
  );
}
