/// 工作日历（WorkCalendarScreen）组件测试。
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/work/screens/work_calendar_screen.dart';

import 'work_test_fixtures.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('日历页面正常加载月视图、日期单元格与当天任务', (tester) async {
    tester.view.physicalSize = const Size(430, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final harness = await WorkTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      WorkCalendarScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // 页面标题与视图切换按钮
    expect(find.text('日程日历'), findsOneWidget);
    expect(find.text('周视图'), findsOneWidget);
    expect(find.text('今天'), findsOneWidget);

    // 星期表头（一至日）
    expect(find.text('一'), findsOneWidget);
    expect(find.text('日'), findsOneWidget);

    // 当天任务展示
    expect(find.text('编制第三季度财务复核报告'), findsOneWidget);
  });

  testWidgets('月视图与周视图平滑切换', (tester) async {
    final harness = await WorkTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      WorkCalendarScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // 点击切换为周视图
    await tester.tap(find.text('周视图'));
    await tester.pump();

    expect(find.text('月视图'), findsOneWidget);

    // 切回月视图
    await tester.tap(find.text('月视图'));
    await tester.pump();

    expect(find.text('周视图'), findsOneWidget);
  });

  testWidgets('点击过去日期显示过期排期友好提示条', (tester) async {
    final harness = await WorkTestHarness.create();
    // 指定过去日期 2026-10-25
    await tester.pumpWidget(harness.wrap(
      WorkCalendarScreen(
        api: harness.api,
        authState: harness.authState,
        initialDay: '2026-10-25',
      ),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('所选日期已经过去，仍可补录或调整当天日程'), findsOneWidget);
    expect(find.text('当天暂无安排事项'), findsOneWidget);
  });

  testWidgets('网络异常时显示错误状态并可点击重试', (tester) async {
    final brokenApi = MockWorkApi(shouldThrowNetworkError: true);
    final harness = await WorkTestHarness.create(api: brokenApi);

    await tester.pumpWidget(harness.wrap(
      WorkCalendarScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byType(AppErrorState), findsOneWidget);

    brokenApi.shouldThrowNetworkError = false;
    await tester.tap(find.text('重试'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('日程日历'), findsOneWidget);
  });
}
