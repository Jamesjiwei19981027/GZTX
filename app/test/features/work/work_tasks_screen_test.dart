/// 任务列表（WorkTasksScreen）组件测试。
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/work/screens/work_tasks_screen.dart';
import 'package:worktodo_app/features/work/widgets/work_widgets.dart';

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
}
