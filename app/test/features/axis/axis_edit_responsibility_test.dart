import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/axis/screens/axis_edit_responsibility_screen.dart';

import 'axis_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

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
}
