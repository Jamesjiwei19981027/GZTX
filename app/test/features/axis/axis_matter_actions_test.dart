import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/axis/screens/axis_node_detail_screen.dart';
import 'package:worktodo_app/features/axis/data/axis_matter_patch.dart';

import 'axis_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('事项最小patch清除日期且保持负责人，日期输入拒绝无效日期', () {
    final original = {
      ...AxisTestHarness.nodeDetail(id: 201, type: 'work_item', title: '原名称'),
      'due_at': '2026-11-01T12:00:00',
      'assignees': [
        {'user_id': 11, 'role_key': 'primary'}
      ]
    };
    expect(
        buildAxisMatterPatch(original,
            title: '原名称', dueDate: '', assigneeUserId: 11),
        {'due_at': null});
    expect(buildAxisMatterPatch(original, title: '原名称', dueDate: '2026-11-01'),
        isEmpty);
    expect(validAxisDateInput('2026-02-31'), isFalse);
    expect(validAxisDateInput('2026-12-10'), isTrue);
  });

  Future<void> showMatter(WidgetTester tester, AxisTestHarness harness) async {
    tester.view.physicalSize = const Size(430, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(resetToastForTesting);
    await tester.pumpWidget(harness.wrap(
        AxisNodeDetailScreen(nodeId: 201, projectId: 1, api: harness.api)));
    await tester.pumpAndSettle();
  }

  testWidgets('事项编辑提交最小PATCH并刷新名称日期负责人', (tester) async {
    final harness = await AxisTestHarness.create(isPm: true);
    harness.helper.register('PATCH', '/nodes/201', {'id': 201});
    await showMatter(tester, harness);
    await tester.tap(find.byKey(const Key('axis-matter-edit')));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byKey(const Key('axis-matter-title')), '更新后的交付方案');
    await tester.enterText(
        find.byKey(const Key('axis-matter-date')), '2026-12-10');
    await tester.tap(find.byKey(const Key('axis-matter-assignee')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('赵晨').last);
    await tester.pumpAndSettle();
    harness.helper.whenGet('/nodes/201', {
      ...AxisTestHarness.nodeDetail(
          id: 201, parentId: 102, type: 'work_item', title: '更新后的交付方案'),
      'due_at': '2026-12-10T23:59:59'
    });
    await tester.tap(find.byKey(const Key('axis-matter-save')));
    await tester.pumpAndSettle();
    final patch =
        harness.helper.history.lastWhere((record) => record.method == 'PATCH');
    expect(patch.url.path, '/api/v1/nodes/201');
    expect(patch.body, {
      'title': '更新后的交付方案',
      'due_at': '2026-12-10T23:59:59',
      'assignees': [
        {'user_id': 13, 'role_key': 'primary'}
      ]
    });
    expect(find.text('更新后的交付方案'), findsOneWidget);
    await tester.pump(const Duration(seconds: 4));
  });

  testWidgets('删除先确认取消不发请求，确认后可撤销恢复', (tester) async {
    final harness = await AxisTestHarness.create(isPm: true);
    harness.helper.whenDelete('/nodes/201', {'id': 201, 'is_deleted': true});
    harness.helper.whenPost('/nodes/201/restore', {'id': 201});
    await showMatter(tester, harness);
    await tester.tap(find.byKey(const Key('axis-matter-delete')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('取消'));
    await tester.pumpAndSettle();
    expect(harness.helper.history.where((record) => record.method == 'DELETE'),
        isEmpty);
    await tester.tap(find.byKey(const Key('axis-matter-delete')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('确认删除'));
    await tester.pumpAndSettle();
    expect(find.text('事项已删除'), findsOneWidget);
    await tester.tap(find.byKey(const Key('axis-matter-undo')));
    await tester.pumpAndSettle();
    expect(find.text('交互原型设计'), findsOneWidget);
    expect(
        harness.helper.history
            .where((record) => record.method == 'DELETE')
            .length,
        1);
    expect(
        harness.helper.history
            .where((record) =>
                record.method == 'POST' && record.url.path.endsWith('/restore'))
            .length,
        1);
    await tester.pump(const Duration(seconds: 16));
  });

  testWidgets('显式只读事项不出现编辑删除入口', (tester) async {
    final permissions = AxisTestHarness.defaultPermissions(isPm: false);
    (permissions['node_permissions'] as Map)['201'] = {
      'can_edit_person': false
    };
    final harness = await AxisTestHarness.create(permissions: permissions);
    await showMatter(tester, harness);
    expect(find.byKey(const Key('axis-matter-edit')), findsNothing);
    expect(find.byKey(const Key('axis-matter-delete')), findsNothing);
  });

  testWidgets('删除失败保留事项与错误，不出现撤销入口', (tester) async {
    final harness = await AxisTestHarness.create(isPm: true);
    harness.helper.whenDelete(
        '/nodes/201', AxisTestHarness.errorBody(403, '项目已归档，禁止写入'),
        statusCode: 403);
    await showMatter(tester, harness);
    await tester.tap(find.byKey(const Key('axis-matter-delete')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('确认删除'));
    await tester.pumpAndSettle();
    expect(find.text('交互原型设计'), findsOneWidget);
    expect(find.byKey(const Key('axis-matter-undo')), findsNothing);
    expect(find.text('项目已归档，禁止写入'), findsOneWidget);
    await tester.pump(const Duration(seconds: 4));
  });
}
