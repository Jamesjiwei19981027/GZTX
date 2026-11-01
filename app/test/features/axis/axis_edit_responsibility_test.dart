import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/axis/screens/axis_edit_responsibility_screen.dart';

import 'axis_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  /// 后端人树里一个人员可以有 primary / collaborator / observer 多条指派
  /// （`node_assignments`），PATCH 带 assignees 时是整份替换。
  List<Map<String, dynamic>> treeWithSharedAssignees() {
    final tree = AxisTestHarness.defaultTree();
    final person = tree.firstWhere(
      (node) => (node['children'] as List).any((child) => child['id'] == 102),
    );
    final lin = (person['children'] as List)
        .firstWhere((child) => child['id'] == 102) as Map<String, dynamic>;
    lin['assignees'] = [
      {
        'user_id': 11,
        'role_key': 'primary',
        'display_name': '林悦',
        'avatar_url': null,
      },
      {
        'user_id': 13,
        'role_key': 'collaborator',
        'display_name': '赵晨',
        'avatar_url': null,
      },
      {
        'user_id': 14,
        'role_key': 'observer',
        'display_name': '观察者',
        'avatar_url': null,
      },
    ];
    return tree;
  }

  Future<void> pumpEdit(WidgetTester tester, AxisTestHarness harness) async {
    tester.view.physicalSize = const Size(430, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(resetToastForTesting);
    await tester.pumpWidget(harness.wrap(
      AxisEditResponsibilityScreen(
        personId: 102,
        projectId: AxisTestHarness.projectId,
        api: harness.api,
      ),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('编辑人员职责：回填姓名、岗位、部门并保存', (tester) async {
    final harness = await AxisTestHarness.create();
    harness.helper.register('PATCH', '/nodes/102', AxisTestHarness.nodeDetail());
    await pumpEdit(tester, harness);

    expect(find.text('编辑人员职责'), findsOneWidget);
    expect(find.text('林悦'), findsWidgets);
    expect(find.text('设计负责人'), findsWidgets);
    expect(find.text('设计部'), findsWidgets);

    await tester.enterText(find.byKey(const Key('axis-form-name')), '林悦（改）');
    await tester.enterText(find.byKey(const Key('axis-form-role')), '高级设计负责人');
    await tester.pump();

    await tester.tap(find.text('保存人员'));
    await tester.pumpAndSettle();

    final patch = harness.helper.history.firstWhere(
      (r) => r.method == 'PATCH' && r.url.path == '/api/v1/nodes/102',
      orElse: () => throw StateError('未发出保存请求'),
    );
    expect((patch.body as Map)['title'], '林悦（改）');
    expect((patch.body as Map)['description'], contains('高级设计负责人'));
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('编辑时修改直属上级会调用移动接口', (tester) async {
    final harness = await AxisTestHarness.create(isPm: true);
    harness.helper.register('PATCH', '/nodes/102', AxisTestHarness.nodeDetail());
    harness.helper.whenPost(
      '/nodes/102/move',
      AxisTestHarness.nodeDetail(),
    );
    await pumpEdit(tester, harness);

    await tester.tap(find.byKey(const Key('axis-form-supervisor')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('赵晨（产品负责人）'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('保存人员'));
    await tester.pumpAndSettle();

    final move = harness.helper.history.firstWhere(
      (r) => r.method == 'POST' && r.url.path == '/api/v1/nodes/102/move',
      orElse: () => throw StateError('未发出调整上级请求'),
    );
    expect((move.body as Map)['new_parent_id'], 104);
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('有未保存修改时返回会二次确认', (tester) async {
    final harness = await AxisTestHarness.create();
    await pumpEdit(tester, harness);

    await tester.enterText(find.byKey(const Key('axis-form-name')), '改过的名字');
    await tester.pump();

    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();

    expect(find.text('放弃修改？'), findsWidgets);
    expect(find.text('继续编辑'), findsWidgets);
    expect(find.text('放弃并退出'), findsWidgets);
  });

  testWidgets('已有 3 条指派时只改职务保存，PATCH 仍是 3 条且角色不变', (tester) async {
    final harness = await AxisTestHarness.create(
      isPm: true,
      tree: treeWithSharedAssignees(),
    );
    harness.helper.register('PATCH', '/nodes/102', AxisTestHarness.nodeDetail());
    await pumpEdit(tester, harness);

    await tester.enterText(
      find.byKey(const Key('axis-form-role')),
      '高级设计负责人',
    );
    await tester.pump();
    await tester.tap(find.text('保存人员'));
    await tester.pumpAndSettle();

    final patch = harness.helper.history.firstWhere(
      (r) => r.method == 'PATCH' && r.url.path == '/api/v1/nodes/102',
      orElse: () => throw StateError('未发出保存请求'),
    );
    final assignees = (patch.body as Map)['assignees'] as List;
    expect(assignees, hasLength(3));
    expect(
      assignees.map((item) => item['user_id']).toList(),
      [11, 13, 14],
      reason: '协作者与观察者必须原样保留',
    );
    expect(
      assignees.map((item) => item['role_key']).toList(),
      ['primary', 'collaborator', 'observer'],
    );
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('改选主负责人时只替换主负责人那一条，其余指派保留', (tester) async {
    final harness = await AxisTestHarness.create(
      isPm: true,
      tree: treeWithSharedAssignees(),
    );
    harness.helper.register('PATCH', '/nodes/102', AxisTestHarness.nodeDetail());
    await pumpEdit(tester, harness);

    await tester.tap(find.byKey(const Key('axis-form-member')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('陈宇 (axis_dev)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('保存人员'));
    await tester.pumpAndSettle();

    final patch = harness.helper.history.firstWhere(
      (r) => r.method == 'PATCH' && r.url.path == '/api/v1/nodes/102',
      orElse: () => throw StateError('未发出保存请求'),
    );
    final assignees = ((patch.body as Map)['assignees'] as List)
        .cast<Map<String, dynamic>>();
    expect(assignees, hasLength(3));
    expect(assignees.first, {'user_id': 12, 'role_key': 'primary'});
    expect(
      assignees.skip(1).map((item) => item['role_key']).toList(),
      ['collaborator', 'observer'],
    );
    await tester.pump(const Duration(seconds: 3));
  });
  testWidgets('把协作者提为主负责人时保留其原协作者指派，只去掉旧主负责人', (tester) async {
    final harness = await AxisTestHarness.create(
      isPm: true,
      tree: treeWithSharedAssignees(),
    );
    harness.helper.register('PATCH', '/nodes/102', AxisTestHarness.nodeDetail());
    await pumpEdit(tester, harness);

    await tester.tap(find.byKey(const Key('axis-form-member')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('赵晨 (axis_product)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('保存人员'));
    await tester.pumpAndSettle();

    final patch = harness.helper.history.firstWhere(
      (r) => r.method == 'PATCH' && r.url.path == '/api/v1/nodes/102',
      orElse: () => throw StateError('未发出保存请求'),
    );
    final assignees = ((patch.body as Map)['assignees'] as List)
        .cast<Map<String, dynamic>>();
    expect(assignees, [
      {'user_id': 13, 'role_key': 'primary'},
      {'user_id': 13, 'role_key': 'collaborator'},
      {'user_id': 14, 'role_key': 'observer'},
    ]);
    await tester.pump(const Duration(seconds: 3));
  });
}
