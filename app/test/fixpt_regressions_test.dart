import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/me/screens/admin/admin_push_certs_screen.dart';
import 'package:worktodo_app/features/messages/data/messages_repository.dart';
import 'package:worktodo_app/features/messages/screens/chat_screen.dart';
import 'package:worktodo_app/features/messages/screens/conversation_profile_screen.dart';
import 'package:worktodo_app/features/work/screens/work_task_edit_screen.dart';
import 'package:worktodo_app/features/work/screens/work_tasks_screen.dart';
import 'package:worktodo_app/push/push_service.dart';

import 'features/me/me_test_harness.dart';
import 'features/messages/messages_test_support.dart';
import 'features/work/work_test_fixtures.dart';
import 'helpers/mock_api_client.dart';

void expectChinesePushPage(WidgetTester tester) {
  final text = tester.widgetList<Text>(find.byType(Text)).map(
        (widget) => widget.data ?? widget.textSpan?.toPlainText() ?? '',
      );
  expect(text.where((value) => RegExp(r'[A-Za-z/]').hasMatch(value)), isEmpty);
}

void main() {
  for (final enabled in [true, false]) {
    testWidgets('推送设置：服务端${enabled ? '启用' : '未启用'}时显示中文状态', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await MeTestHarness.create(isAdmin: true);
      harness.helper.whenGet('/push/status', {'enabled': enabled});
      await tester.pumpWidget(harness.wrap(
        AdminPushCertsScreen(api: harness.api, authState: harness.authState),
      ));
      await tester.pumpAndSettle();

      expect(find.text('推送设置'), findsOneWidget);
      expect(find.text('极光推送'), findsOneWidget);
      expect(find.text(enabled ? '已启用' : '未启用'), findsOneWidget);
      if (!enabled) {
        expect(find.text('服务端尚未配置极光推送，暂只有站内通知'), findsOneWidget);
      }
      expect(harness.hasRequest('GET', '/push/status'), isTrue);
      expect(harness.hasRequest('GET', '/notifications/vapid-public-key'),
          isFalse);
      expectChinesePushPage(tester);
    });
  }

  testWidgets('推送设置：读取失败显示中文未知状态，刷新后恢复', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);
    harness.helper.whenGet(
        '/push/status', {'detail': 'internal_error /push/status'},
        statusCode: 500);
    await tester.pumpWidget(harness.wrap(
      AdminPushCertsScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();
    expect(find.text('暂无法确认'), findsOneWidget);
    expect(find.text('推送状态读取失败，请稍后刷新重试'), findsOneWidget);
    expect(find.text('未启用'), findsNothing);
    expectChinesePushPage(tester);

    harness.helper.whenGet('/push/status', {'enabled': true});
    await tester.tap(find.text('刷新'));
    await tester.pumpAndSettle();
    expect(find.text('已启用'), findsOneWidget);
    expect(find.text('暂无法确认'), findsNothing);
  });

  testWidgets('推送设置：展示真实隐私授权和设备标识状态', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create(isAdmin: true);
    harness.helper.whenGet('/push/status', {'enabled': true});
    final service = PushService.instance;
    final originalConsent = service.consentGranted;
    final originalId = service.registrationId;
    addTearDown(() {
      service.consentGranted = originalConsent;
      service.registrationId = originalId;
    });
    service.consentGranted = false;
    service.registrationId = null;
    await tester.pumpWidget(harness.wrap(
      AdminPushCertsScreen(api: harness.api, authState: harness.authState),
    ));
    await tester.pumpAndSettle();
    expect(find.text('未同意'), findsOneWidget);
    expect(find.text('尚未获取'), findsOneWidget);

    service.consentGranted = true;
    service.registrationId = 'private-device-id';
    await tester.tap(find.text('刷新'));
    await tester.pumpAndSettle();
    expect(find.text('已同意'), findsOneWidget);
    expect(find.text('已获取'), findsOneWidget);
    expect(find.textContaining('private-device-id'), findsNothing);
    expect(find.text('已登记'), findsNothing, reason: '设备标识不能证明服务端登记成功');
    expectChinesePushPage(tester);
  });

  testWidgetsAtFixedDay('我的任务非空时可从常驻入口进入真实新建页，保存后刷新列表', (tester) async {
    tester.view.physicalSize = const Size(430, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final harness = await WorkTestHarness.create();
    final router = GoRouter(routes: [
      GoRoute(
        path: '/',
        builder: (_, __) =>
            WorkTasksScreen(api: harness.api, authState: harness.authState),
      ),
      GoRoute(
        path: '/work/task-edit',
        builder: (_, __) =>
            WorkTaskEditScreen(api: harness.api, authState: harness.authState),
      ),
    ]);
    addTearDown(router.dispose);
    await tester.pumpWidget(ChangeNotifierProvider<AuthState>.value(
      value: harness.authState,
      child: MaterialApp.router(routerConfig: router),
    ));
    await tester.pumpAndSettle();
    expect(find.text('编制第三季度财务复核报告'), findsOneWidget);
    final create = find.byTooltip('新建任务');
    expect(create, findsOneWidget);
    final semantics = tester.ensureSemantics();
    try {
      expect(find.bySemanticsLabel('新建任务'), findsOneWidget);
    } finally {
      semantics.dispose();
    }
    await tester.tap(create);
    await tester.pumpAndSettle();
    expect(find.byType(WorkTaskEditScreen), findsOneWidget);
    await tester.enterText(find.byType(AppTextField).first, '常驻入口新建的任务');
    final save = find.widgetWithText(AppButton, '创建任务');
    await tester.ensureVisible(save);
    await tester.tap(save);
    await tester.pumpAndSettle();
    expect(find.byType(WorkTasksScreen), findsOneWidget);
    expect(find.text('常驻入口新建的任务'), findsOneWidget);
    expect(find.byTooltip('新建任务'), findsOneWidget);
    await tester.pump(const Duration(seconds: 3));
  });

  for (final (type, id, name) in [
    ('channel', 5, '频道'),
    ('conversation', 55, '私聊'),
    ('conversation', 56, '群聊'),
  ]) {
    testWidgets('$name聊天及会话资料均隐藏通话入口', (tester) async {
      final helper = MockApiClientHelper();
      final path = type == 'channel' ? '/channels/$id' : '/conversations/$id';
      helper.whenGet('$path/messages', {'items': []},
          query: {'page': '1', 'page_size': '100'});
      final repository = MessagesRepository(helper.buildClient());
      await pumpMessagesScreen(
          tester,
          ChatScreen(
            repository: repository,
            scopeType: type,
            scopeId: id,
            name: name,
            currentUserId: 11,
            companyId: 1,
          ));
      await tester.pumpAndSettle();
      expect(find.byTooltip('语音通话'), findsNothing);
      expect(find.byTooltip('视频通话'), findsNothing);
      expect(
          find.byWidgetPredicate((widget) =>
              widget is AppIcon &&
              (widget.name == 'phone' || widget.name == 'video')),
          findsNothing);
      expect(find.byTooltip('会话资料'), findsOneWidget);
      await disposeMessagesTree(tester);

      helper.whenGet('$path/pinned-links', {'items': []});
      helper.whenGet('$path/files', {'items': []});
      helper.whenGet('/companies/1/conversations', {
        'items': [
          MessagesFixtures.directConversation,
          MessagesFixtures.groupConversation
        ],
      });
      helper.whenGet('/companies/1/presence', {'items': []});
      await pumpMessagesScreen(
          tester,
          ConversationProfileScreen(
            repository: repository,
            scopeType: type,
            scopeId: id,
            name: name,
            companyId: 1,
          ));
      await tester.pumpAndSettle();
      expect(find.byTooltip('语音通话'), findsNothing);
      expect(find.byTooltip('视频通话'), findsNothing);
      expect(find.text('发起通话'), findsNothing);
      expect(
          find.byWidgetPredicate((widget) =>
              widget is AppIcon &&
              (widget.name == 'phone' || widget.name == 'video')),
          findsNothing);
      await disposeMessagesTree(tester);
    });
  }
}
