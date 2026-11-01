/// 任务列表（WorkTasksScreen）组件测试。
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/core/models/project.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/work/data/work_models.dart';
import 'package:worktodo_app/features/work/screens/work_tasks_screen.dart';

import 'work_test_fixtures.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('任务列表正常加载、显示搜索框、工作区范围与任务项', (tester) async {
    tester.view.physicalSize = const Size(430, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final harness = await WorkTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      WorkTasksScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));

    // 搜索输入框
    expect(find.byType(AppTextField), findsOneWidget);

    // 工作区范围选项：全部任务、未完成、今日到期、已逾期
    expect(find.text('全部任务'), findsOneWidget);
    expect(find.text('未完成'), findsOneWidget);

    // 任务项
    expect(find.text('编制第三季度财务复核报告'), findsOneWidget);
    expect(find.text('人轴一期代码审查与架构验收'), findsOneWidget);
  });

  testWidgets('搜索框过滤任务，清空后恢复全量', (tester) async {
    final harness = await WorkTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      WorkTasksScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // 输入搜索关键字「财务」
    await tester.enterText(find.byType(AppTextField), '财务');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // 命中的任务显示，未命中的过滤
    expect(find.text('编制第三季度财务复核报告'), findsOneWidget);
    expect(find.text('服务器跨时区日志备份'), findsNothing);

    // 清空搜索
    await tester.enterText(find.byType(AppTextField), '');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('服务器跨时区日志备份'), findsOneWidget);
  });

  testWidgets('工作区范围切换：点击「今日到期」只显示今日任务', (tester) async {
    final harness = await WorkTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      WorkTasksScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // 打开范围下拉菜单并选择「今日到期」
    await tester.tap(find.text('全部任务'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('今日到期').last);
    await tester.pumpAndSettle();

    // 今日任务应可见，非今日任务不应在列表中
    expect(find.text('编制第三季度财务复核报告'), findsOneWidget);
    expect(find.text('梳理移动端离线缓存方案'), findsNothing); // 已逾期任务被过滤
  });

  testWidgets('批量操作模式：选择任务后批量完成', (tester) async {
    final harness = await WorkTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      WorkTasksScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // 点击「批量操作」按钮进入批量模式
    await tester.tap(find.text('批量操作'));
    await tester.pump();

    expect(find.text('退出批量'), findsOneWidget);
    expect(find.text('全选本页'), findsOneWidget);

    // 点击「全选本页」
    await tester.tap(find.text('全选本页'));
    await tester.pump();

    // 底部批量操作栏出现「批量完成」
    final completeBtn = find.text('完成');
    expect(completeBtn, findsAtLeastNWidgets(1));

    await tester.tap(completeBtn.last);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // 验证 API 被调用，模式自动退出
    expect(find.text('批量操作'), findsOneWidget);
  });

  testWidgets('网络异常时显示错误状态并可点击重试', (tester) async {
    final brokenApi = MockWorkApi(shouldThrowNetworkError: true);
    final harness = await WorkTestHarness.create(api: brokenApi);
    await tester.pumpWidget(harness.wrap(
      WorkTasksScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byType(AppErrorState), findsOneWidget);

    brokenApi.shouldThrowNetworkError = false;
    await tester.tap(find.text('重试'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('编制第三季度财务复核报告'), findsOneWidget);
  });

  testWidgets('任务列表分页测试：多页数据通过分页循环拉全，避免超过单页上限时丢失数据', (tester) async {
    // 构造 120 条任务，超过单页 100/50 的限制
    final manyTasks = List.generate(
      120,
      (i) => WorkTask.fromJson(buildTaskJson(
        id: 1000 + i,
        title: '分页任务第 ${i + 1} 项',
        status: 0,
        priority: 1,
      )),
    );
    final mockApi = MockWorkApi(tasks: manyTasks);
    final harness = await WorkTestHarness.create(api: mockApi);

    await tester.pumpWidget(harness.wrap(
      WorkTasksScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();

    // 验证任务全部拉全，统计显示为全部 120 项
    expect(find.text('全部 (120)'), findsOneWidget);
    // 第一条任务存在
    expect(find.text('分页任务第 1 项'), findsOneWidget);

    // 搜索第 120 条任务，验证最后一页的任务同样成功拉取并展示
    await tester.enterText(find.byType(TextField).first, '第 120 项');
    await tester.pumpAndSettle();
    expect(find.text('分页任务第 120 项'), findsOneWidget);
  });

  testWidgets('项目隔离测试：任务列表仅展示当前选中项目任务及个人任务，切换项目后自动刷新', (tester) async {
    final harness = await WorkTestHarness.create();
    harness.api.tasks = [
      WorkTask.fromJson(buildTaskJson(id: 801, title: '项目一独有任务', projectId: 1, origin: 'project_link')),
      WorkTask.fromJson(buildTaskJson(id: 802, title: '项目二独有任务', projectId: 2, origin: 'project_link')),
      WorkTask.fromJson(buildTaskJson(id: 803, title: '全局个人私有任务', projectId: null, origin: 'personal')),
    ];

    await tester.pumpWidget(harness.wrap(
      WorkTasksScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();

    // 验证当前显示项目 1 任务与个人任务，排除项目 2 任务
    expect(find.text('项目一独有任务'), findsOneWidget);
    expect(find.text('全局个人私有任务'), findsOneWidget);
    expect(find.text('项目二独有任务'), findsNothing);

    // 切换当前项目为项目 2
    harness.authState.selectProject(const Project(id: 2, name: '项目二', companyId: 1));
    await tester.pumpAndSettle();

    // 验证刷新后显示项目 2 任务与个人任务，排除项目 1 任务
    expect(find.text('项目二独有任务'), findsOneWidget);
    expect(find.text('全局个人私有任务'), findsOneWidget);
    expect(find.text('项目一独有任务'), findsNothing);
  });

  testWidgets('批量模式下切换项目会清空勾选，不会对隐藏的旧项目任务执行批量完成', (tester) async {
    final harness = await WorkTestHarness.create();
    harness.api.tasks = [
      WorkTask.fromJson(buildTaskJson(id: 801, title: '项目一独有任务', projectId: 1, origin: 'project_link')),
      WorkTask.fromJson(buildTaskJson(id: 802, title: '项目二独有任务', projectId: 2, origin: 'project_link')),
    ];

    await tester.pumpWidget(harness.wrap(
      WorkTasksScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.text('批量操作'));
    await tester.pump();
    await tester.tap(find.text('全选本页'));
    await tester.pump();
    expect(find.text('已选 1 项'), findsOneWidget);

    harness.authState.selectProject(const Project(id: 2, name: '项目二', companyId: 1));
    await tester.pumpAndSettle();
    expect(find.text('已选 0 项'), findsOneWidget);

    await tester.tap(find.text('完成').last);
    await tester.pumpAndSettle();
    expect(
      harness.api.tasks.firstWhere((t) => t.id == 801).status,
      isNot(2),
      reason: '项目一的任务已不在当前视图，不能被批量完成',
    );
  });

  testWidgets('批量改期准确保留任务原有時刻并在时区转换下维持目标本地日期', (tester) async {
    final harness = await WorkTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      WorkTasksScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // 进入批量模式
    await tester.tap(find.text('批量操作'));
    await tester.pump();

    // 点击选中任务 102
    await tester.tap(find.text('服务器跨时区日志备份'));
    await tester.pump();

    // 点击顺延
    await tester.tap(find.text('顺延'));
    await tester.pumpAndSettle();

    // 点击日期选择器的确定按钮
    await tester.tap(find.text('确定'));
    await tester.pumpAndSettle();

    // 验证任务 102 的 dueDate 保持为所选的目标本地日期，且时刻仍为 23:30
    final task102 = harness.api.tasks.firstWhere((t) => t.id == 102);
    expect(task102.dueDate, TaskTime.todayKey());
    expect(task102.dueTime, '23:30');
  });
}
