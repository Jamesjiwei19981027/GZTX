import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/screens/axis_audit_screen.dart';

import 'axis_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<void> pumpAudit(WidgetTester tester, AxisTestHarness harness) async {
    tester.view.physicalSize = const Size(430, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(harness.wrap(AxisAuditScreen(
      api: harness.api,
      authState: harness.authState,
    )));
    await tester.pumpAndSettle();
  }

  testWidgets('审计结果显示整体风险、待确认问题与建议动作', (tester) async {
    final harness = await AxisTestHarness.create();
    harness.helper.whenPost(
      '/projects/${AxisTestHarness.projectId}/axis-audit',
      AxisTestHarness.auditPayload(),
    );
    await pumpAudit(tester, harness);

    expect(find.text('责任链审计完成'), findsOneWidget);
    expect(find.text('2 项待处理'), findsOneWidget);
    expect(find.textContaining('整体风险中等'), findsOneWidget);
    expect(find.text('设计负责人'), findsOneWidget);
    expect(find.text('高风险'), findsOneWidget);
    expect(find.text('中风险'), findsOneWidget);
    expect(find.text('推动无进展事项提交首份证据'), findsOneWidget);
  });

  testWidgets('未配置审计模型时给出可重试的明确提示', (tester) async {
    final harness = await AxisTestHarness.create();
    harness.helper.whenPost(
      '/projects/${AxisTestHarness.projectId}/axis-audit',
      AxisTestHarness.errorBody(503, '未配置审计模型，请先在设置中启用'),
      statusCode: 503,
    );
    await pumpAudit(tester, harness);

    expect(find.text('未配置审计模型'), findsOneWidget);
    expect(find.textContaining('尚未在设置中配置'), findsOneWidget);
    expect(find.text('重试运行审计'), findsOneWidget);
  });

  testWidgets('断网时显示中文网络提示并可重试', (tester) async {
    final harness = await AxisTestHarness.create();
    harness.helper.register(
      'POST',
      '/projects/${AxisTestHarness.projectId}/axis-audit',
      Exception('网络断开'),
    );
    await pumpAudit(tester, harness);

    expect(find.textContaining('网络连接异常或请求超时'), findsOneWidget);
    expect(find.text('重试'), findsOneWidget);
  });

  testWidgets('没有待处理问题时显示空结果', (tester) async {
    final harness = await AxisTestHarness.create();
    harness.helper.whenPost(
      '/projects/${AxisTestHarness.projectId}/axis-audit',
      {
        'project_id': AxisTestHarness.projectId,
        'overall_risk': 'low',
        'generated_at': '2026-11-01T07:20:00Z',
        'nodes': <Map<String, dynamic>>[],
      },
    );
    await pumpAudit(tester, harness);

    expect(find.text('0 项待处理'), findsOneWidget);
    expect(find.text('本次审计未发现需要处理的责任链风险。'), findsOneWidget);
  });
}
