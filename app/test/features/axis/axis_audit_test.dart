import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/screens/axis_audit_screen.dart';
import 'axis_audit_fixture.dart';
import 'axis_test_harness.dart';

void main() {
  Future<void> pumpAudit(WidgetTester tester, AxisTestHarness harness) async {
    tester.view.physicalSize = const Size(430, 1400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(harness
        .wrap(AxisAuditScreen(api: harness.api, authState: harness.authState)));
    await tester.pumpAndSettle();
  }

  Future<void> run(WidgetTester tester) async {
    await tester.ensureVisible(find.byKey(const ValueKey('audit-run')));
    await tester.tap(find.byKey(const ValueKey('audit-run')));
    await tester.pumpAndSettle();
  }

  testWidgets('审计显示整体风险、问题与建议', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness, withHistory: false);
    harness.helper.whenPost('/projects/1/audits', {
      ...AxisTestHarness.auditPayload(),
      'id': 8,
      'mode': 'ai',
      'mode_message': 'AI 审计'
    });
    await pumpAudit(tester, harness);
    await run(tester);
    expect(find.text('审计结果'), findsOneWidget);
    expect(find.textContaining('整体风险中等 ·'), findsOneWidget);
    expect(find.text('设计负责人'), findsOneWidget);
    expect(find.text('高风险'), findsOneWidget);
    expect(find.text('中风险'), findsOneWidget);
    expect(find.text('推动无进展事项提交首份证据'), findsOneWidget);
  });
  testWidgets('无模型时展示规则结果而非错误状态', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness, withHistory: false);
    harness.helper.whenPost('/projects/1/audits', storedAuditFixture());
    await pumpAudit(tester, harness);
    await run(tester);
    expect(find.text('未配置 AI，以下为规则检查'), findsOneWidget);
    expect(find.text('完成状态缺少材料支撑'), findsOneWidget);
    expect(find.text('重试'), findsNothing);
  });
  testWidgets('加载断网时给出中文提示并重试读取', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness);
    harness.helper
        .register('GET', '/projects/1/audit-options', Exception('网络断开'));
    await pumpAudit(tester, harness);
    expect(find.textContaining('网络连接异常或请求超时'), findsOneWidget);
    await tester.tap(find.text('重试'));
    await tester.pumpAndSettle();
    expect(
        harness.helper.history
            .where((r) => r.url.path.endsWith('/audit-options'))
            .length,
        2);
    expect(harness.helper.history.where((r) => r.method == 'POST'), isEmpty);
  });
  testWidgets('范围无人员时显示真实空结果', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness, withHistory: false);
    harness.helper.whenPost('/projects/1/audits',
        {...storedAuditFixture(), 'nodes': <Map<String, dynamic>>[]});
    await pumpAudit(tester, harness);
    await run(tester);
    expect(find.text('此范围暂无可审计的人员信息'), findsOneWidget);
  });
}
