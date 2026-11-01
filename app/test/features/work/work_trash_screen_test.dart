import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:worktodo_app/features/work/data/work_models.dart';
import 'package:worktodo_app/features/work/screens/work_trash_screen.dart';

import 'work_test_fixtures.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('回收站正确渲染保留提示、软删列表与恢复操作', (tester) async {
    final harness = await WorkTestHarness.create();
    final trashItem = WorkTask.fromJson(buildTaskJson(
      id: 991,
      title: '旧版需求评审文档归档',
      status: 0,
      deletedAt: '2026-10-25T10:00:00Z',
    ));
    harness.api.trash.clear();
    harness.api.trash.add(trashItem);

    await tester.pumpWidget(harness.wrap(
      WorkTrashScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();

    expect(find.text('回收站'), findsOneWidget);
    expect(find.textContaining('保留 30 天'), findsOneWidget);
    expect(find.text('旧版需求评审文档归档'), findsOneWidget);
    expect(find.text('恢复'), findsOneWidget);
    expect(find.text('彻底删除'), findsOneWidget);

    // 点击恢复
    await tester.tap(find.text('恢复'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(seconds: 3));

    // 任务移入 tasks 列表
    expect(harness.api.trash.any((t) => t.id == 991), isFalse);
    expect(harness.api.tasks.any((t) => t.id == 991), isTrue);
  });

  testWidgets('彻底删除二次确认取消时不执行删除', (tester) async {
    final harness = await WorkTestHarness.create();
    final trashItem = WorkTask.fromJson(buildTaskJson(
      id: 992,
      title: '误删的会议纪要草稿',
      status: 0,
      deletedAt: '2026-10-26T14:00:00Z',
    ));
    harness.api.trash.clear();
    harness.api.trash.add(trashItem);

    await tester.pumpWidget(harness.wrap(
      WorkTrashScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();

    // 点击彻底删除
    await tester.tap(find.text('彻底删除'));
    await tester.pumpAndSettle();

    // 弹出二次确认弹窗
    expect(find.text('彻底删除任务'), findsOneWidget);
    expect(find.textContaining('确定要彻底删除任务「误删的会议纪要草稿」吗？'), findsOneWidget);

    // 点击取消
    await tester.tap(find.text('取消'));
    await tester.pumpAndSettle();

    // 弹窗关闭，任务未被删除
    expect(find.text('彻底删除任务'), findsNothing);
    expect(harness.api.trash.any((t) => t.id == 992), isTrue);
    expect(find.text('误删的会议纪要草稿'), findsOneWidget);
  });

  testWidgets('彻底删除二次确认确认后调用 purge 移除项', (tester) async {
    final harness = await WorkTestHarness.create();
    final trashItem = WorkTask.fromJson(buildTaskJson(
      id: 993,
      title: '失效废弃的临时脚本',
      status: 0,
      deletedAt: '2026-10-27T08:00:00Z',
    ));
    harness.api.trash.clear();
    harness.api.trash.add(trashItem);

    await tester.pumpWidget(harness.wrap(
      WorkTrashScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();

    // 点击彻底删除
    await tester.tap(find.text('彻底删除'));
    await tester.pumpAndSettle();

    // 弹窗确定按钮
    final confirmBtn = find.descendant(
      of: find.byType(AlertDialog),
      matching: find.text('彻底删除'),
    );
    expect(confirmBtn, findsOneWidget);

    await tester.tap(confirmBtn);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(seconds: 3));

    // 回收站已被清空
    expect(harness.api.trash.isEmpty, isTrue);
    expect(find.text('回收站空空如也'), findsOneWidget);
  });

  testWidgets('回收站为空时展示空状态提示', (tester) async {
    final harness = await WorkTestHarness.create();
    harness.api.trash.clear();

    await tester.pumpWidget(harness.wrap(
      WorkTrashScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();

    expect(find.text('回收站空空如也'), findsOneWidget);
    expect(find.text('最近未有被删除的任务'), findsOneWidget);
  });
}
