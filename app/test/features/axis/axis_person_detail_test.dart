import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/axis/screens/axis_node_detail_screen.dart';

import 'axis_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<void> pumpDetail(
    WidgetTester tester,
    AxisTestHarness harness, {
    int nodeId = 102,
  }) async {
    tester.view.physicalSize = const Size(430, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(resetToastForTesting);
    await tester.pumpWidget(harness.wrap(
      AxisNodeDetailScreen(
        nodeId: nodeId,
        projectId: AxisTestHarness.projectId,
        api: harness.api,
      ),
    ));
    await tester.pumpAndSettle();
  }

  testWidgets('人员详情显示上下级、责任事项与操作入口', (tester) async {
    final harness = await AxisTestHarness.create();
    await pumpDetail(tester, harness);

    expect(find.text('林悦 · 责任详情'), findsOneWidget);
    expect(find.text('设计负责人 · 设计部'), findsOneWidget);
    expect(find.text('王宁'), findsOneWidget);
    expect(find.text('次级人员'), findsOneWidget);
    expect(find.text('编辑人员'), findsOneWidget);
    expect(find.text('节点权限'), findsOneWidget);
    expect(find.text('责任事项'), findsOneWidget);
    expect(find.text('交互原型设计'), findsOneWidget);
  });

  testWidgets('项目经理不能移除次级人员：按钮不出现且说明原因', (tester) async {
    final harness = await AxisTestHarness.create(isPm: true);
    await pumpDetail(tester, harness);

    expect(find.text('查看移除影响与交接'), findsNothing);
    expect(
      find.textContaining('次级人员只能由其主轴负责人移除'),
      findsOneWidget,
    );
  });

  testWidgets('删除必须先看预览，并选择交接人后提交 preview_token', (tester) async {
    final permissions = AxisTestHarness.defaultPermissions(isPm: true);
    (permissions['node_permissions'] as Map)['102']['can_delete_person'] = true;
    final harness = await AxisTestHarness.create(
      isPm: true,
      permissions: permissions,
    );
    harness.helper.whenDelete(
      '/nodes/102',
      {'id': 102, 'is_deleted': true, 'revoked_user_ids': <int>[]},
      query: {
        'preview_token': 'preview-token-102',
        'handover_to_node_id': '104',
      },
    );
    await pumpDetail(tester, harness);

    await tester.tap(find.text('查看移除影响与交接'));
    await tester.pumpAndSettle();
    expect(
      harness.helper.history.any(
        (r) => r.url.path == '/api/v1/nodes/102/deletion-preview',
      ),
      isTrue,
    );
    expect(find.textContaining('将影响 1 个下辖节点'), findsOneWidget);
    expect(find.text('交互原型设计 · 事项'), findsOneWidget);

    await tester.tap(find.text('赵晨'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('确认交接并移除'));
    await tester.pumpAndSettle();

    final deleteRequest = harness.helper.history.firstWhere(
      (r) => r.method == 'DELETE' && r.url.path == '/api/v1/nodes/102',
      orElse: () => throw StateError('未发出删除请求'),
    );
    expect(deleteRequest.url.queryParameters['preview_token'],
        'preview-token-102');
    expect(deleteRequest.url.queryParameters['handover_to_node_id'], '104');
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('次级人员默认不开放频道，授权后可开启并写回权限', (tester) async {
    final harness = await AxisTestHarness.create();
    harness.helper.register(
      'PATCH',
      '/nodes/102',
      AxisTestHarness.nodeDetail(),
    );
    await pumpDetail(tester, harness);

    final channelSwitch = find.byKey(const Key('axis-channel-switch'));
    expect(channelSwitch, findsOneWidget);
    await tester.tap(channelSwitch);
    await tester.pumpAndSettle();

    final patch = harness.helper.history.firstWhere(
      (r) => r.method == 'PATCH' && r.url.path == '/api/v1/nodes/102',
      orElse: () => throw StateError('未发出权限更新请求'),
    );
    expect(
      (patch.body as Map)['responsibility_permissions']['channel_access'],
      isTrue,
    );
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('深链进入详情（不带 projectId）时通过人轴总览反查项目', (tester) async {
    final harness = await AxisTestHarness.create();
    tester.view.physicalSize = const Size(430, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(resetToastForTesting);
    await tester.pumpWidget(harness.wrap(
      AxisNodeDetailScreen(nodeId: 102, api: harness.api),
    ));
    await tester.pumpAndSettle();

    expect(find.text('林悦 · 责任详情'), findsOneWidget);
    expect(
      harness.helper.history.any(
        (r) => r.url.path == '/api/v1/users/me/people-axis',
      ),
      isTrue,
    );
  });

  testWidgets('事项详情显示所属人员与进度入口', (tester) async {
    final harness = await AxisTestHarness.create();
    await pumpDetail(tester, harness, nodeId: 201);

    expect(find.text('事项详情'), findsOneWidget);
    expect(find.text('交互原型设计'), findsOneWidget);
    expect(find.text('责任人'), findsOneWidget);
    expect(find.textContaining('林悦'), findsOneWidget);
    expect(find.text('查看进度与记录'), findsOneWidget);
  });
}
