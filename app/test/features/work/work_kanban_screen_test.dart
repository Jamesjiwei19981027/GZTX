/// 工作看板（WorkKanbanScreen）组件测试。
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/work/screens/work_kanban_screen.dart';

import 'work_test_fixtures.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('工作看板展示待办、进行中、已完成三列及卡片', (tester) async {
    tester.view.physicalSize = const Size(800, 1000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final harness = await WorkTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      WorkKanbanScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // 三列标题
    expect(find.text('待办事项'), findsOneWidget);
    expect(find.text('进行中'), findsOneWidget);
    expect(find.text('已完成'), findsOneWidget);

    // 提示文案
    expect(find.text('长按卡片可拖到其它状态列，松手即保存'), findsOneWidget);

    // 卡片展示
    expect(find.text('编制第三季度财务复核报告'), findsOneWidget);
  });

  testWidgets('拖拽 LongPressDraggable 卡片到目标列 DragTarget 触发状态更新', (tester) async {
    tester.view.physicalSize = const Size(800, 1000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final harness = await WorkTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      WorkKanbanScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // 寻找待办列中的「编制第三季度财务复核报告」(id: 101) 的拖拽手柄
    final card = find.text('编制第三季度财务复核报告');
    expect(card, findsOneWidget);

    // 寻找目标列：进行中 列的 DragTarget
    final inProgressTarget = find.ancestor(
      of: find.text('进行中'),
      matching: find.byType(DragTarget<int>),
    );
    expect(inProgressTarget, findsOneWidget);

    // 长按卡片开始拖拽
    final gesture = await tester.startGesture(tester.getCenter(card));
    await tester.pump(const Duration(milliseconds: 600)); // 触发长按
    await gesture.moveTo(tester.getCenter(inProgressTarget));
    await tester.pump();
    await gesture.up();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // 验证任务状态更新为进行中 (status: 1)
    final updated = harness.api.tasks.firstWhere((t) => t.id == 101);
    expect(updated.status, 1);
  });

  testWidgets('人轴锁定事项不可在看板直接改状态，给出提示', (tester) async {
    addTearDown(resetToastForTesting);
    tester.view.physicalSize = const Size(800, 1000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final harness = await WorkTestHarness.create();
    await tester.pumpWidget(harness.wrap(
      WorkKanbanScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    // 寻找人轴锁定任务「人轴一期代码审查与架构验收」(id: 104)
    final lockedCard = find.text('人轴一期代码审查与架构验收');
    expect(lockedCard, findsOneWidget);

    // 尝试拖到已完成列
    final doneTarget = find.ancestor(
      of: find.text('已完成'),
      matching: find.byType(DragTarget<int>),
    );
    expect(doneTarget, findsOneWidget);

    final gesture = await tester.startGesture(tester.getCenter(lockedCard));
    await tester.pump(const Duration(milliseconds: 600));
    await gesture.moveTo(tester.getCenter(doneTarget));
    await tester.pump();
    await gesture.up();
    await tester.pump();

    // 弹出只读警告 Toast
    expect(find.text('该事项由人轴责任节点同步，不能在看板直接改状态'), findsOneWidget);
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('网络异常时显示错误状态并可点击重试', (tester) async {
    final brokenApi = MockWorkApi(shouldThrowNetworkError: true);
    final harness = await WorkTestHarness.create(api: brokenApi);

    await tester.pumpWidget(harness.wrap(
      WorkKanbanScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byType(AppErrorState), findsOneWidget);

    brokenApi.shouldThrowNetworkError = false;
    await tester.tap(find.text('重试'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('待办事项'), findsOneWidget);
  });
}
