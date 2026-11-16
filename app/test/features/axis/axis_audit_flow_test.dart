import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/screens/axis_audit_screen.dart';
import 'package:worktodo_app/features/axis/data/axis_audit_models.dart';
import 'axis_audit_fixture.dart';
import 'axis_test_harness.dart';

void main() {
  test('原生接口阻止超过 500 字的要求', () async {
    final harness = await AxisTestHarness.create();
    await expectLater(
        harness.api.createAudit(
            1, AxisAuditScope({'scope': 'self'}), List.filled(501, '字').join()),
        throwsA('自定义审查要求最多 500 字'));
    expect(harness.helper.history.where((r) => r.method == 'POST'), isEmpty);
  });
  Future<void> pump(WidgetTester tester, AxisTestHarness harness) async {
    tester.view.physicalSize = const Size(430, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(harness
        .wrap(AxisAuditScreen(api: harness.api, authState: harness.authState)));
    await tester.pumpAndSettle();
  }

  testWidgets('进入仅加载范围和历史，不自动触发 AI；可查看针对本人的详情', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness);
    await pump(tester, harness);
    expect(find.text('AI 审计'), findsOneWidget);
    expect(harness.helper.history.where((r) => r.method == 'POST'), isEmpty);
    await tester.ensureVisible(find.byKey(const ValueKey('audit-history-8')));
    await tester.tap(find.byKey(const ValueKey('audit-history-8')));
    await tester.pumpAndSettle();
    expect(find.text('针对本人的部分'), findsOneWidget);
    expect(find.text('未配置 AI，以下为规则检查'), findsOneWidget);
    expect(find.text('完成状态缺少材料支撑'), findsOneWidget);
    expect(find.textContaining('#102'), findsOneWidget);
  });

  testWidgets('选择人员范围并提交自定义要求，使用新存档接口', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness, withHistory: false);
    await pump(tester, harness);
    await tester.tap(find.byKey(const ValueKey('audit-scope')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('设计及下属').last);
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byKey(const ValueKey('audit-instruction')), '  核验交付  ');
    await tester.ensureVisible(find.byKey(const ValueKey('audit-run')));
    await tester.tap(find.byKey(const ValueKey('audit-run')));
    await tester.pumpAndSettle();
    final request =
        harness.helper.history.singleWhere((r) => r.method == 'POST');
    expect(request.url.path, endsWith('/projects/1/audits'));
    expect(request.body,
        {'scope': 'node', 'node_id': 101, 'custom_instruction': '核验交付'});
    expect(find.text('材料待核验'), findsOneWidget);
  });

  testWidgets('后端拒绝时展示中文原因，保留范围和要求供重试', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness, withHistory: false);
    harness.helper.whenPost(
        '/projects/1/audits', AxisTestHarness.errorBody(403, '下属审计权限已关闭'),
        statusCode: 403);
    await pump(tester, harness);
    await tester.enterText(
        find.byKey(const ValueKey('audit-instruction')), '检查进度');
    await tester.ensureVisible(find.byKey(const ValueKey('audit-run')));
    await tester.tap(find.byKey(const ValueKey('audit-run')));
    await tester.pumpAndSettle();
    expect(find.textContaining('下属审计权限已关闭'), findsOneWidget);
    expect(find.text('检查进度'), findsOneWidget);
  });

  testWidgets('普通成员不展示人员权限编辑', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness, manager: false);
    await pump(tester, harness);
    expect(find.text('下属审计权限'), findsNothing);
  });

  testWidgets('切换项目后忽略旧项目的延迟响应', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness);
    harness.helper.whenGet(
        '/projects/1/audit-options',
        {
          'can_manage': false,
          'people': [],
          'scopes': [
            {'scope': 'self', 'label': '旧项目范围'}
          ],
        },
        delay: const Duration(milliseconds: 200));
    harness.helper.whenGet('/projects/2/audit-options', {
      'can_manage': false,
      'people': [],
      'scopes': [
        {'scope': 'self', 'label': '新项目范围'}
      ],
    });
    harness.helper
        .whenGet('/projects/2/audits', {'items': [], 'has_more': false});
    await tester.pumpWidget(
        harness.wrap(AxisAuditScreen(api: harness.api, projectId: 1)));
    await tester.pump();
    await tester.pumpWidget(
        harness.wrap(AxisAuditScreen(api: harness.api, projectId: 2)));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('新项目范围'), findsOneWidget);
    expect(find.text('旧项目范围'), findsNothing);
    expect(find.byKey(const ValueKey('audit-history-8')), findsNothing);
  });

  testWidgets('权限保存失败恢复服务器值，重试仍保存权限而非触发模型', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness, withHistory: false);
    harness.helper.whenPut('/projects/1/nodes/101/audit-permission',
        AxisTestHarness.errorBody(403, '权限设置被拒绝'),
        statusCode: 403);
    await pump(tester, harness);
    await tester.ensureVisible(find.text('下属审计权限'));
    await tester.tap(find.text('下属审计权限'));
    await tester.pumpAndSettle();
    final dropdown = find.byWidgetPredicate((widget) =>
        widget is DropdownButtonFormField<String> &&
        widget.key.toString().contains('audit-permission-101'));
    await tester.ensureVisible(dropdown);
    await tester.tap(dropdown);
    await tester.pumpAndSettle();
    await tester.tap(find.text('打开').last);
    await tester.pumpAndSettle();
    expect(find.text('按层级默认'), findsOneWidget);
    await tester.ensureVisible(find.text('重试'));
    await tester.tap(find.text('重试'));
    await tester.pumpAndSettle();
    expect(harness.helper.history.where((r) => r.method == 'POST'), isEmpty);
    expect(harness.helper.history.where((r) => r.method == 'PUT').length, 2);
  });

  testWidgets('固定项目页退出会话后清空数据并拒绝旧会话延迟结果', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness);
    harness.helper.whenGet(
        '/projects/1/audits',
        {
          'items': [storedAuditFixture()],
          'has_more': false,
        },
        delay: const Duration(milliseconds: 200));
    await tester.pumpWidget(harness.wrap(AxisAuditScreen(
        api: harness.api, authState: harness.authState, projectId: 1)));
    await tester.pump();
    harness.authState.api.onAuthExpired?.call();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('audit-history-8')), findsNothing);
    expect(find.textContaining('登录已过期'), findsOneWidget);
    expect(
        harness.helper.history
            .where((r) => r.url.path.endsWith('/audit-options'))
            .length,
        1);
  });
}
