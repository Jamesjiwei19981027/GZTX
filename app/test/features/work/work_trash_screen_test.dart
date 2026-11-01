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
    // 后端无物理删除接口前，不展示彻底删除按钮，避免误导用户
    expect(find.text('彻底删除'), findsNothing);

    // 点击恢复
    await tester.tap(find.text('恢复'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(seconds: 3));

    // 任务移入 tasks 列表
    expect(harness.api.trash.any((t) => t.id == 991), isFalse);
    expect(harness.api.tasks.any((t) => t.id == 991), isTrue);
  });

  testWidgets('回收站不提供伪彻底删除按钮，只支持恢复', (tester) async {
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

    // 验证绝无“彻底删除”按钮，也没有“已彻底删除”的 Toast 提示
    expect(find.text('彻底删除'), findsNothing);
    expect(find.text('已彻底删除'), findsNothing);
    expect(find.text('恢复'), findsOneWidget);
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
