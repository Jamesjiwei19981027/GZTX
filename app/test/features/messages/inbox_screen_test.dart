import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/messages/data/messages_repository.dart';
import 'package:worktodo_app/features/messages/screens/inbox_screen.dart';

import '../../helpers/mock_api_client.dart';
import 'messages_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Widget inbox(
    MockApiClientHelper helper, {
    InboxTab tab = InboxTab.notifications,
  }) =>
      InboxScreen(
        repository: MessagesRepository(helper.buildClient()),
        companyId: 1,
        initialTab: tab,
      );

  MockApiClientHelper notificationHelper() {
    final helper = MockApiClientHelper()
      ..whenGet(
        '/notifications/collab',
        MessagesFixtures.notifications,
        query: {'page': '1', 'page_size': '20', 'state': 'active'},
      );
    return helper;
  }

  testWidgets('通知列表按后端返回渲染，未读有标记、需回复有徽标', (tester) async {
    final helper = notificationHelper();
    await pumpMessagesScreen(tester, inbox(helper));
    await tester.pumpAndSettle();

    expect(find.textContaining('你有一条新的任务待确认'), findsOneWidget);
    expect(find.textContaining('本周周报尚未提交'), findsOneWidget);
    expect(find.text('需回复'), findsOneWidget);
    expect(find.byKey(const ValueKey('unread-dot-401')), findsOneWidget);
    expect(find.byKey(const ValueKey('unread-dot-402')), findsNothing);
  });

  testWidgets('全部已读调用接口并清掉未读标记', (tester) async {
    final helper = notificationHelper();
    helper.whenPut('/notifications/collab/read-all', {'updated': 1});

    await pumpMessagesScreen(tester, inbox(helper));
    await tester.pumpAndSettle();

    await tester.tap(find.text('全部已读'));
    await tester.pumpAndSettle();

    expect(
      requests(helper, 'PUT', '/notifications/collab/read-all'),
      isNotEmpty,
    );
    expect(find.text('已将 1 条通知标为已读'), findsOneWidget);
    expect(find.byKey(const ValueKey('unread-dot-401')), findsNothing);

    await tester.pump(const Duration(seconds: 3));
    await disposeMessagesTree(tester);
  });

  testWidgets('全部已读失败给出可见错误', (tester) async {
    final helper = notificationHelper();
    helper.whenPut(
      '/notifications/collab/read-all',
      {'code': 500, 'message': '通知服务暂不可用'},
      statusCode: 500,
    );

    await pumpMessagesScreen(tester, inbox(helper));
    await tester.pumpAndSettle();
    await tester.tap(find.text('全部已读'));
    await tester.pumpAndSettle();

    expect(find.text('通知服务暂不可用'), findsOneWidget);
    expect(find.byKey(const ValueKey('unread-dot-401')), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await disposeMessagesTree(tester);
  });

  testWidgets('打开通知详情标记已读，并可回复', (tester) async {
    final helper = notificationHelper();
    helper.whenPut('/notifications/collab/401/read', {'id': 401, 'read': true});
    helper.whenPost(
      '/notifications/collab/401/reply',
      {
        'id': 401,
        'reply_text': '我下午三点前确认',
        'replied_at': '2026-10-30T07:00:00Z',
      },
    );

    await pumpMessagesScreen(tester, inbox(helper));
    await tester.pumpAndSettle();

    await tester.tap(find.textContaining('你有一条新的任务待确认'));
    await tester.pumpAndSettle();

    expect(find.text('通知详情'), findsOneWidget);
    expect(
        requests(helper, 'PUT', '/notifications/collab/401/read'), isNotEmpty);

    await tester.enterText(
      find
          .descendant(
            of: find.byType(BottomSheet),
            matching: find.byType(EditableText),
          )
          .first,
      '我下午三点前确认',
    );
    await tester.pump();
    await tester.tap(find.text('发送回复'));
    await tester.pumpAndSettle();

    expect(
      requests(helper, 'POST', '/notifications/collab/401/reply').single.body,
      {'text': '我下午三点前确认'},
    );
    expect(find.textContaining('我的回复'), findsOneWidget);
    expect(find.text('我下午三点前确认'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await disposeMessagesTree(tester);
  });

  testWidgets('归档通知后从当前筛选列表移除', (tester) async {
    final helper = notificationHelper();
    helper.whenPut(
      '/notifications/collab/401/state',
      {
        'id': 401,
        'read': true,
        'archived': true,
        'archived_at': '2026-10-30T07:00:00Z'
      },
    );
    helper.whenPut('/notifications/collab/401/read', {'id': 401, 'read': true});

    await pumpMessagesScreen(tester, inbox(helper));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('你有一条新的任务待确认'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('归档'));
    await tester.pumpAndSettle();

    final stateRequest =
        requests(helper, 'PUT', '/notifications/collab/401/state').single;
    expect(stateRequest.body, {'archived': true});
    expect(find.textContaining('你有一条新的任务待确认'), findsNothing);
    // 顶部筛选里的“已归档”仍然存在，同时弹出归档成功提示
    expect(find.text('已归档'), findsNWidgets(2));

    await tester.pump(const Duration(seconds: 3));
    await disposeMessagesTree(tester);
  });

  testWidgets('删除通知需要二次确认，确认后移除', (tester) async {
    final helper = notificationHelper();
    helper.whenPut('/notifications/collab/401/read', {'id': 401, 'read': true});
    helper
        .whenDelete('/notifications/collab/401', {'id': 401, 'deleted': true});

    await pumpMessagesScreen(tester, inbox(helper));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('你有一条新的任务待确认'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('删除'));
    await tester.pumpAndSettle();
    expect(find.text('删除通知'), findsOneWidget);
    expect(requests(helper, 'DELETE', '/notifications/collab/401'), isEmpty);

    await tester.tap(find.text('删除').last);
    await tester.pumpAndSettle();

    expect(requests(helper, 'DELETE', '/notifications/collab/401'), isNotEmpty);
    expect(find.textContaining('你有一条新的任务待确认'), findsNothing);

    await tester.pump(const Duration(seconds: 3));
    await disposeMessagesTree(tester);
  });

  testWidgets('切换归档筛选会带 state 参数重新请求', (tester) async {
    final helper = notificationHelper();
    helper.whenGet(
      '/notifications/collab',
      {
        'items': [
          {
            'id': 410,
            'template_key': 'task_assigned',
            'payload': <String, dynamic>{},
            'body_text': '这是一条已归档的通知',
            'read': true,
            'sender': {'user_id': 21, 'name': '李四', 'avatar_url': ''},
            'recipient_user_ids': [11],
            'attachments': <Map<String, dynamic>>[],
            'requires_reply': false,
            'reply_text': null,
            'replied_at': null,
            'archived': true,
            'archived_at': '2026-10-29T02:00:00Z',
            'deleted': false,
            'created_at': '2026-10-29T02:00:00Z',
          },
        ],
        'total': 1,
      },
      query: {'page': '1', 'page_size': '20', 'state': 'archived'},
    );

    await pumpMessagesScreen(tester, inbox(helper));
    await tester.pumpAndSettle();

    await tester.tap(find.text('已归档'));
    await tester.pumpAndSettle();

    expect(
      requests(helper, 'GET', '/notifications/collab')
          .last
          .url
          .queryParameters['state'],
      'archived',
    );
    expect(find.textContaining('这是一条已归档的通知'), findsOneWidget);
  });

  testWidgets('通知为空时给出空状态', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet(
        '/notifications/collab',
        {'items': <Map<String, dynamic>>[], 'total': 0},
        query: {'page': '1', 'page_size': '20', 'state': 'active'},
      );
    await pumpMessagesScreen(tester, inbox(helper));
    await tester.pumpAndSettle();
    expect(find.text('暂无通知'), findsOneWidget);
  });

  testWidgets('通知加载失败显示原因并可重试', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet(
        '/notifications/collab',
        {'code': 500, 'message': '通知服务暂不可用'},
        statusCode: 500,
        query: {'page': '1', 'page_size': '20', 'state': 'active'},
      );
    await pumpMessagesScreen(tester, inbox(helper));
    await tester.pumpAndSettle();
    expect(find.text('通知服务暂不可用'), findsOneWidget);
    expect(find.text('重试'), findsOneWidget);
  });

  testWidgets('外部邮箱未配置时展示真实原因，不展示假邮件', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet(
        '/external-mail/status',
        MessagesFixtures.mailStatusUnconfigured,
        query: {'company_id': '1'},
      );
    await pumpMessagesScreen(tester, inbox(helper, tab: InboxTab.externalMail));
    await tester.pumpAndSettle();

    expect(find.text('外部邮箱未配置'), findsOneWidget);
    expect(find.text('真实连接状态：未就绪'), findsOneWidget);
    expect(find.textContaining('IMAP'), findsWidgets);
    expect(find.textContaining('管理后台配置企业邮件网关'), findsOneWidget);
    expect(requests(helper, 'GET', '/external-mail'), isEmpty);
  });

  testWidgets('外部邮箱已配置时可拉取邮件、查看正文并归档', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet(
        '/external-mail/status',
        MessagesFixtures.mailStatusConfigured,
        query: {'company_id': '1'},
      )
      ..whenGet(
        '/external-mail',
        MessagesFixtures.mailList,
        query: {'company_id': '1', 'state': 'active'},
      )
      ..whenPost(
        '/external-mail/sync',
        {'provider': 'imap', 'synced': 2, 'skipped': 1},
        query: {'company_id': '1'},
      )
      ..whenGet('/external-mail/61', MessagesFixtures.mailDetail)
      ..whenPut('/external-mail/61/state', {'id': 61, 'state': 'archived'});

    await pumpMessagesScreen(
      tester,
      inbox(helper, tab: InboxTab.externalMail),
      size: const Size(440, 900),
    );
    await tester.pumpAndSettle();

    expect(find.text('连接账户：team@example.com'), findsOneWidget);
    expect(find.text('关于二期验收时间的确认'), findsOneWidget);

    await tester.tap(find.text('立即拉取邮件'));
    await tester.pumpAndSettle();
    expect(find.text('同步完成：新抓取 2 封，跳过 1 封'), findsOneWidget);

    await tester.tap(find.text('关于二期验收时间的确认'));
    await tester.pumpAndSettle();
    expect(find.text('邮件详情'), findsOneWidget);
    expect(find.text('希望把二期验收安排在 11 月 10 日，请确认。'), findsOneWidget);

    await tester.tap(find.text('归档这封邮件'));
    await tester.pumpAndSettle();
    expect(requests(helper, 'PUT', '/external-mail/61/state'), isNotEmpty);
    expect(find.text('关于二期验收时间的确认'), findsNothing);

    await tester.pump(const Duration(seconds: 3));
    await disposeMessagesTree(tester);
  });
}
