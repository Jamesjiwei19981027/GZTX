import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/screens/axis_audit_screen.dart';
import 'axis_audit_fixture.dart';
import 'axis_test_harness.dart';

Map<String, dynamic> backgroundAudit({
  String status = 'running',
  String mode = 'rule',
  String? reason,
  String summary = '规则快照待核验',
}) =>
    {
      ...storedAuditFixture(mode: mode),
      'status': status,
      'started_at': null,
      'finished_at': status == 'running' ? null : '2026-11-16T08:02:00Z',
      'fallback_reason': reason,
      'nodes': [
        {
          'node_id': 101,
          'title': '设计负责人',
          'risk_level': 'medium',
          'summary': summary,
          'findings': <Map<String, dynamic>>[],
          'suggested_actions': <String>[],
        }
      ],
    };

void main() {
  Future<void> pump(WidgetTester tester, AxisTestHarness harness,
      {int projectId = 1}) async {
    tester.view.physicalSize = const Size(430, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(harness.wrap(AxisAuditScreen(
        api: harness.api, authState: harness.authState, projectId: projectId)));
    await tester.pumpAndSettle();
  }

  int details(AxisTestHarness harness) => harness.helper.history
      .where((r) => r.method == 'GET' && r.url.path.endsWith('/audits/8'))
      .length;

  testWidgets('缺少状态的旧规则记录兼容已完成', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness);
    await pump(tester, harness);
    expect(find.textContaining('已完成'), findsOneWidget);
    expect(find.textContaining('已退回规则检查'), findsNothing);
  });

  testWidgets('较早打开的详情不将已完成的轮询结果覆盖回进行中', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness);
    harness.helper.whenGet('/projects/1/audits', {
      'items': [backgroundAudit()],
      'has_more': false,
    });
    harness.helper.whenGet('/projects/1/audits/8',
        backgroundAudit(status: 'done', mode: 'ai', summary: '最终 AI 结果'),
        delay: const Duration(seconds: 1));
    await pump(tester, harness);
    await tester.pump(const Duration(seconds: 5));
    harness.helper.whenGet('/projects/1/audits/8', backgroundAudit(),
        delay: const Duration(seconds: 2));
    await tester.ensureVisible(find.byKey(const ValueKey('audit-history-8')));
    await tester.tap(find.byKey(const ValueKey('audit-history-8')));
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
    expect(find.text('最终 AI 结果'), findsOneWidget);
    expect(find.textContaining('进行中'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('发起后立即显示规则快照，5 秒后 AI 完成替换详情和历史并停止轮询', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness, withHistory: false);
    harness.helper.whenPost('/projects/1/audits', backgroundAudit());
    await pump(tester, harness);
    await tester.tap(find.byKey(const ValueKey('audit-run')));
    await tester.pumpAndSettle();
    expect(find.text('AI 正在审计，通常需要 1～3 分钟，可以离开此页，完成后在历史里查看'), findsOneWidget);
    expect(find.text('规则快照待核验'), findsOneWidget);
    expect(find.textContaining('进行中'), findsWidgets);
    expect(details(harness), 0);
    harness.helper.whenGet('/projects/1/audits/8',
        backgroundAudit(status: 'done', mode: 'ai', summary: 'AI 已核验交付材料'));
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(find.text('AI 已核验交付材料'), findsOneWidget);
    expect(find.textContaining('进行中'), findsNothing);
    expect(find.textContaining('已完成'), findsWidgets);
    expect(details(harness), 1);
    await tester.pump(const Duration(seconds: 15));
    expect(details(harness), 1);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('进入历史恢复进行中轮询，模型失败显示规则回退和中文原因', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness);
    harness.helper.whenGet('/projects/1/audits', {
      'items': [backgroundAudit()],
      'has_more': false,
    });
    await pump(tester, harness);
    expect(find.textContaining('进行中'), findsOneWidget);
    harness.helper.whenGet('/projects/1/audits/8',
        backgroundAudit(status: 'done', reason: 'AI 响应超时，已保留规则检查结果'));
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(find.textContaining('已退回规则检查'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const ValueKey('audit-history-8')));
    await tester.tap(find.byKey(const ValueKey('audit-history-8')));
    await tester.pumpAndSettle();
    expect(find.text('AI 响应超时，已保留规则检查结果'), findsOneWidget);
    expect(find.text('规则快照待核验'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('failed 记录显示已退回规则检查及中文原因', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness);
    harness.helper.whenGet('/projects/1/audits/8',
        backgroundAudit(status: 'failed', reason: '服务重启，已保留规则检查结果'));
    await pump(tester, harness);
    await tester.ensureVisible(find.byKey(const ValueKey('audit-history-8')));
    await tester.tap(find.byKey(const ValueKey('audit-history-8')));
    await tester.pumpAndSettle();
    expect(find.text('服务重启，已保留规则检查结果'), findsOneWidget);
    expect(find.textContaining('已退回规则检查'), findsWidgets);
  });

  testWidgets('详情请求超过 5 秒不重叠，离页后停止并忽略延迟结果', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness);
    harness.helper.whenGet('/projects/1/audits', {
      'items': [backgroundAudit()],
      'has_more': false,
    });
    harness.helper.whenGet('/projects/1/audits/8',
        backgroundAudit(status: 'done', mode: 'ai', summary: '离页后的旧结果'),
        delay: const Duration(seconds: 12));
    await pump(tester, harness);
    await tester.pump(const Duration(seconds: 5));
    await tester.pump(const Duration(seconds: 5));
    expect(details(harness), 1);
    await tester.pumpWidget(const MaterialApp(home: Text('其他页面')));
    await tester.pump(const Duration(seconds: 30));
    expect(details(harness), 1);
    expect(find.text('离页后的旧结果'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('切换项目后停止旧轮询并拒绝旧详情响应', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness);
    harness.helper.whenGet('/projects/1/audits', {
      'items': [backgroundAudit()],
      'has_more': false,
    });
    harness.helper.whenGet('/projects/1/audits/8',
        backgroundAudit(status: 'done', mode: 'ai', summary: '旧项目的 AI 结果'),
        delay: const Duration(seconds: 12));
    harness.helper.whenGet('/projects/2/audit-options', {
      'can_manage': false,
      'people': [],
      'scopes': [
        {'scope': 'self', 'label': '新项目范围'}
      ],
    });
    harness.helper
        .whenGet('/projects/2/audits', {'items': [], 'has_more': false});
    await pump(tester, harness);
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpWidget(harness.wrap(AxisAuditScreen(
        api: harness.api, authState: harness.authState, projectId: 2)));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 30));
    await tester.pumpAndSettle();
    expect(find.text('新项目范围'), findsOneWidget);
    expect(find.text('旧项目的 AI 结果'), findsNothing);
    expect(find.byKey(const ValueKey('audit-history-8')), findsNothing);
    expect(details(harness), 1);
  });

  testWidgets('退出登录停止轮询并清空旧会话结果', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness);
    harness.helper.whenGet('/projects/1/audits', {
      'items': [backgroundAudit()],
      'has_more': false,
    });
    harness.helper.whenGet('/projects/1/audits/8',
        backgroundAudit(status: 'done', mode: 'ai', summary: '旧会话的 AI 结果'),
        delay: const Duration(seconds: 12));
    await pump(tester, harness);
    await tester.pump(const Duration(seconds: 5));
    harness.authState.api.onAuthExpired?.call();
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 30));
    expect(details(harness), 1);
    expect(find.text('旧会话的 AI 结果'), findsNothing);
    expect(find.textContaining('登录已过期'), findsOneWidget);
    expect(find.byKey(const ValueKey('audit-history-8')), findsNothing);
  });

  testWidgets('推入其他路由暂停轮询，返回审计页恢复并保留表单', (tester) async {
    final harness = await AxisTestHarness.create();
    registerAuditFixture(harness);
    harness.helper.whenGet('/projects/1/audits', {
      'items': [backgroundAudit()],
      'has_more': false,
    });
    harness.helper.whenGet(
        '/projects/1/audits/8', backgroundAudit(status: 'done', mode: 'ai'));
    await pump(tester, harness);
    await tester.enterText(
        find.byKey(const ValueKey('audit-instruction')), '核验进度');
    final navigator =
        Navigator.of(tester.element(find.byType(AxisAuditScreen)));
    navigator.push(MaterialPageRoute<void>(
        builder: (_) => const Scaffold(body: Text('其他页面'))));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 15));
    expect(details(harness), 0);
    navigator.pop();
    await tester.pumpAndSettle();
    expect(find.text('核验进度'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
    expect(details(harness), 1);
    expect(find.textContaining('已完成'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
  });
}
