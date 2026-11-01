import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/axis/data/axis_models.dart';
import 'package:worktodo_app/features/axis/screens/axis_delegations_screen.dart';

import 'axis_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<void> pumpScreen(WidgetTester tester, AxisTestHarness harness) async {
    tester.view.physicalSize = const Size(430, 1600);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(resetToastForTesting);
    await tester.pumpWidget(harness.wrap(AxisDelegationsScreen(
      api: harness.api,
      authState: harness.authState,
    )));
    await tester.pumpAndSettle();
  }

  testWidgets('委托列表显示被授权人、动作中文名与有效期', (tester) async {
    final harness = await AxisTestHarness.create(isPm: true);
    harness.helper.whenGet(
      '/delegations',
      AxisTestHarness.delegationsPayload(),
      query: {
        'company_id': '1',
        'project_id': '${AxisTestHarness.projectId}',
      },
    );
    await pumpScreen(tester, harness);

    expect(find.text(axisDelegationScopeDescription), findsOneWidget);
    expect(find.text('我的授权'), findsOneWidget);
    expect(find.text('创建授权'), findsWidgets);
    expect(find.text('林悦 · 代为执行'), findsOneWidget);
    expect(
      find.textContaining('查看项目进度（进入项目视图的前提）、提交材料'),
      findsOneWidget,
    );
    expect(find.text('生效中'), findsOneWidget);
    expect(find.text('已撤销'), findsOneWidget);
    expect(find.text('撤销'), findsOneWidget);
  });

  testWidgets('普通成员看不到“创建授权”入口', (tester) async {
    final harness = await AxisTestHarness.create();
    harness.helper.whenGet(
      '/delegations',
      AxisTestHarness.delegationsPayload(),
      query: {
        'company_id': '1',
        'project_id': '${AxisTestHarness.projectId}',
      },
    );
    await pumpScreen(tester, harness);

    expect(find.text('创建授权'), findsNothing);
  });

  testWidgets('创建授权提交被授权人与动作；不填有效期表示长期', (tester) async {
    final harness = await AxisTestHarness.create(isPm: true);
    harness.helper.whenGet(
      '/delegations',
      {'items': <Map<String, dynamic>>[]},
      query: {
        'company_id': '1',
        'project_id': '${AxisTestHarness.projectId}',
      },
    );
    harness.helper.whenPost('/delegations', {
      'id': 601,
      'company_id': 1,
      'project_id': 1,
      'grantor_user_id': AxisTestHarness.pmUserId,
      'grantee_user_id': AxisTestHarness.memberUserId,
      'actions': ['progress.read', 'evidence.submit'],
      'status': 'active',
      'valid_from': null,
      'valid_to': null,
      'reason': '休假代办',
      'created_at': '2026-11-01T02:00:00Z',
    });
    await pumpScreen(tester, harness);

    await tester.tap(find.text('创建授权').first);
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('axis-delegation-grantee')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('林悦').last);
    await tester.pumpAndSettle();

    await tester.tap(find.text('提交材料'));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.widgetWithText(AppTextField, '说明委托范围与交接事项…'),
      '休假代办',
    );
    await tester.pump();

    await tester.tap(find.widgetWithText(AppButton, '创建授权'));
    await tester.pumpAndSettle();

    final post = harness.helper.history.firstWhere(
      (r) => r.method == 'POST' && r.url.path == '/api/v1/delegations',
      orElse: () => throw StateError('未发出创建委托请求'),
    );
    final body = post.body as Map;
    expect(body['company_id'], 1);
    expect(body['project_id'], 1);
    expect(body['grantee_user_id'], AxisTestHarness.memberUserId);
    expect(body['actions'], containsAll(['progress.read', 'evidence.submit']));
    expect(body['valid_to'], isNull);
    await tester.pump(const Duration(seconds: 3));
  });

  testWidgets('撤销委托需要二次确认并调用撤销接口', (tester) async {
    final harness = await AxisTestHarness.create(isPm: true);
    harness.helper.whenGet(
      '/delegations',
      AxisTestHarness.delegationsPayload(),
      query: {
        'company_id': '1',
        'project_id': '${AxisTestHarness.projectId}',
      },
    );
    harness.helper.whenPost(
      '/delegations/501/revoke',
      {'id': 501, 'status': 'revoked'},
    );
    await pumpScreen(tester, harness);

    await tester.tap(find.text('撤销'));
    await tester.pumpAndSettle();
    expect(find.text('确认撤销'), findsOneWidget);
    await tester.tap(find.text('确认撤销'));
    await tester.pumpAndSettle();

    expect(
      harness.helper.history.any(
        (r) =>
            r.method == 'POST' &&
            r.url.path == '/api/v1/delegations/501/revoke',
      ),
      isTrue,
    );
    await tester.pump(const Duration(seconds: 3));
  });
}
