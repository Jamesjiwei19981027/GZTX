/// 工作统计报表（WorkStatisticsScreen）组件测试。
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
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
}
