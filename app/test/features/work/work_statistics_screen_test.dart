/// 工作统计报表（WorkStatisticsScreen）组件测试。
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/core/models/project.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/work/data/work_api.dart';
import 'package:worktodo_app/features/work/data/work_models.dart';
import 'package:worktodo_app/features/work/screens/work_statistics_screen.dart';

import 'work_test_fixtures.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('统计报表展示标题、周期分段切换、四大指标卡', (tester) async {
    tester.view.physicalSize = const Size(430, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final harness = await WorkTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      WorkStatisticsScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // 页面标题
    expect(find.text('工作统计报表'), findsOneWidget);

    // 周期分段切换
    expect(find.text('本周'), findsOneWidget);
    expect(find.text('本月'), findsOneWidget);
    expect(find.text('本季度'), findsOneWidget);

    // 四大核心指标卡
    expect(find.text('事项总数'), findsOneWidget);
    expect(find.text('已完成事项'), findsOneWidget);
    expect(find.text('进行中事项'), findsOneWidget);
    expect(find.text('逾期未结'), findsOneWidget);
  });

  testWidgets('点击切换统计周期为「本月」', (tester) async {
    final harness = await WorkTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      WorkStatisticsScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    await tester.tap(find.text('本月'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // 依然展示指标卡，数据重新拉取
    expect(find.text('事项总数'), findsOneWidget);
  });

  testWidgets('网络异常时显示错误状态并可点击重试', (tester) async {
    final brokenApi = MockWorkApi(shouldThrowNetworkError: true);
    final harness = await WorkTestHarness.create(api: brokenApi);

    await tester.pumpWidget(harness.wrap(
      WorkStatisticsScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byType(AppErrorState), findsOneWidget);

    brokenApi.shouldThrowNetworkError = false;
    await tester.tap(find.text('重试'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('事项总数'), findsOneWidget);
  });

  test('WorkApi.timezoneOffsetMinutes 返回正确的时区偏移符号（东区为正）', () {
    final expected = DateTime.now().timeZoneOffset.inMinutes;
    expect(WorkApi.timezoneOffsetMinutes, expected);
    // 在东八区（480分钟）环境下，数值必须大于等于 0 且为正数，而不是取负后的负数
    if (DateTime.now().timeZoneOffset >= Duration.zero) {
      expect(WorkApi.timezoneOffsetMinutes >= 0, isTrue);
    }
  });

  testWidgets('成员工作量统计根据选定统计周期过滤历史任务', (tester) async {
    tester.view.physicalSize = const Size(430, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final harness = await WorkTestHarness.create();
    harness.api.tasks = [
      WorkTask(
        id: 901,
        title: '去年的年度审计',
        status: 2,
        createdAt: DateTime(2025, 1, 1),
        completedAt: DateTime(2025, 1, 2),
        assignees: const [TaskAssignee(userId: 1, displayName: '张经理', roleKey: 'admin')],
      ),
      WorkTask(
        id: 902,
        title: '本周的重点汇报',
        status: 0,
        createdAt: DateTime.now(),
        dueDate: TaskTime.todayKey(),
        assignees: const [TaskAssignee(userId: 1, displayName: '张经理', roleKey: 'admin')],
      ),
    ];

    await tester.pumpWidget(harness.wrap(
      WorkStatisticsScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // 默认周期为本周，张经理应当只有 1 项任务（本周的重点汇报），不统计去年的年度审计
    expect(find.text('已承接 1 项 · 完成 0 项'), findsOneWidget);
    expect(find.text('已承接 2 项 · 完成 1 项'), findsNothing);
  });

  testWidgets('成员工作量统计按用户ID聚合，避免同名成员合并统计', (tester) async {
    tester.view.physicalSize = const Size(430, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final harness = await WorkTestHarness.create();
    harness.api.tasks = [
      // 成员 10 (张三)
      WorkTask(
        id: 911,
        title: '张三A的任务',
        status: 0,
        createdAt: DateTime.now(),
        assignees: const [TaskAssignee(userId: 10, displayName: '张三')],
      ),
      // 成员 20 (同名张三) 承接两项任务
      WorkTask(
        id: 912,
        title: '张三B的任务1',
        status: 0,
        createdAt: DateTime.now(),
        assignees: const [TaskAssignee(userId: 20, displayName: '张三')],
      ),
      WorkTask(
        id: 913,
        title: '张三B的任务2',
        status: 2,
        createdAt: DateTime.now(),
        assignees: const [TaskAssignee(userId: 20, displayName: '张三')],
      ),
    ];

    await tester.pumpWidget(harness.wrap(
      WorkStatisticsScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // 应该分别展示两条张三的独立记录，而不是被合并成一条「已承接 3 项」
    expect(find.text('已承接 2 项 · 完成 1 项'), findsOneWidget);
    expect(find.text('已承接 1 项 · 完成 0 项'), findsOneWidget);
    expect(find.text('已承接 3 项'), findsNothing);
  });

  testWidgets('统计页成员工作量按当前项目隔离，并在切换项目时自动刷新', (tester) async {
    tester.view.physicalSize = const Size(430, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final harness = await WorkTestHarness.create();
    harness.api.tasks = [
      WorkTask(
        id: 921,
        title: '项目一重点任务',
        projectId: 1,
        origin: 'project_link',
        status: 1,
        createdAt: DateTime.now(),
        dueDate: TaskTime.todayKey(),
        assignees: const [TaskAssignee(userId: 101, displayName: '李工程师')],
      ),
      WorkTask(
        id: 922,
        title: '项目二重点任务',
        projectId: 2,
        origin: 'project_link',
        status: 1,
        createdAt: DateTime.now(),
        dueDate: TaskTime.todayKey(),
        assignees: const [TaskAssignee(userId: 102, displayName: '王架构师')],
      ),
    ];

    await tester.pumpWidget(harness.wrap(
      WorkStatisticsScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();

    // 默认处于项目 1：只展示李工程师，不展示王架构师
    expect(find.text('李工程师'), findsOneWidget);
    expect(find.text('王架构师'), findsNothing);

    // 切换到项目 2
    harness.authState.selectProject(const Project(id: 2, name: '项目二', companyId: 1));
    await tester.pumpAndSettle();

    // 切换后：只展示王架构师，不展示李工程师
    expect(find.text('王架构师'), findsOneWidget);
    expect(find.text('李工程师'), findsNothing);
  });
}
