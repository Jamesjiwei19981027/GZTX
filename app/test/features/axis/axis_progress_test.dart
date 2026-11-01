import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/screens/axis_progress_screen.dart';

import 'axis_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<void> pumpProgress(WidgetTester tester, AxisTestHarness harness) async {
    tester.view.physicalSize = const Size(430, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(harness.wrap(AxisProgressScreen(
      nodeId: 102,
      api: harness.api,
    )));
    await tester.pumpAndSettle();
  }

  testWidgets('进度页显示百分比、状态与进度记录时间轴', (tester) async {
    final harness = await AxisTestHarness.create();
    await pumpProgress(tester, harness);

    expect(find.text('进度与记录'), findsOneWidget);
    expect(find.text('70%'), findsOneWidget);
    expect(find.text('进行中'), findsOneWidget);
    expect(find.textContaining('状态变更 · 70%'), findsOneWidget);
    expect(find.textContaining('进度更新 · 40%'), findsOneWidget);
    expect(find.textContaining('补齐员工端原型'), findsOneWidget);
  });

  testWidgets('进度接口失败时显示中文原因与重试', (tester) async {
    final harness = await AxisTestHarness.create();
    harness.helper.whenGet(
      '/nodes/102/progress',
      AxisTestHarness.errorBody(500, '进度服务暂不可用'),
      statusCode: 500,
    );
    await pumpProgress(tester, harness);

    expect(find.text('无法加载进度'), findsOneWidget);
    expect(find.text('进度服务暂不可用'), findsOneWidget);
    expect(find.text('重试'), findsOneWidget);
  });
}
