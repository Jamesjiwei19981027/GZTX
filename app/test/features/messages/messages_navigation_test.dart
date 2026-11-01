import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/messages/routes.dart';
import 'package:worktodo_app/features/messages/screens/messages_root_screen.dart';

import '../../helpers/mock_api_client.dart';
import 'messages_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('从消息列表进入会话使用真实目标编号，并按编号重新拉消息', (tester) async {
    final helper = MockApiClientHelper();
    final auth = await bootstrapTestAuth(helper);
    helper.whenGet(
      '/companies/1/channels',
      {
        'items': [
          MessagesFixtures.generalChannel,
          MessagesFixtures.projectChannel,
        ],
      },
      query: {'project_id': '7'},
    );
    helper.whenGet('/companies/1/conversations', {
      'items': [MessagesFixtures.directConversation],
    });
    helper.whenGet(
      '/channels/5/messages',
      {
        'items': [MessagesFixtures.channelMessage(body: '频道里的第一条消息')],
      },
      query: {'page': '1', 'page_size': '100'},
    );
    helper.whenGet(
      '/conversations/55/messages',
      {
        'items': [MessagesFixtures.directMessage(body: '私聊里的第一条消息')],
      },
      query: {'page': '1', 'page_size': '100'},
    );

    final router = await pumpMessagesRouter(
      tester,
      auth,
      (context, state) => const MessagesRootScreen(),
      routes: messagesRoutes,
    );
    await tester.pumpAndSettle();
    expect(router.state.uri.path, '/messages');

    await tester.tap(find.text('全员交流大厅'));
    await tester.pumpAndSettle();
    expect(
      router.state.uri.path,
      '/messages/chat/5',
    );
    expect(find.text('频道里的第一条消息'), findsOneWidget);
    expect(
      requests(helper, 'GET', '/channels/5/messages'),
      isNotEmpty,
      reason: '应使用真实频道编号 5 拉取消息',
    );

    router.pop();
    await tester.pumpAndSettle();
    await tester.tap(find.text('直接私聊 (1)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('张三、李四'));
    await tester.pumpAndSettle();

    final uri = router.state.uri;
    expect(uri.path, '/messages/chat/55');
    expect(uri.queryParameters['type'], 'direct');
    expect(uri.queryParameters['name'], '张三、李四');
    expect(find.text('私聊里的第一条消息'), findsOneWidget);
    expect(requests(helper, 'GET', '/conversations/55/messages'), isNotEmpty);

    await disposeMessagesTree(tester);
  });

  testWidgets('工作联系人创建会话后跳到新建会话编号', (tester) async {
    final helper = MockApiClientHelper();
    final auth = await bootstrapTestAuth(helper);
    helper.whenGet(
      '/companies/1/contacts',
      MessagesFixtures.workContacts,
      query: {'project_id': '7'},
    );
    helper.whenPost(
      '/companies/1/conversations',
      {'id': 88, 'member_user_ids': [11, 21], 'kind': 'direct'},
    );
    helper.whenGet(
      '/conversations/88/messages',
      {'items': <Map<String, dynamic>>[], 'page': 1, 'page_size': 100},
      query: {'page': '1', 'page_size': '100'},
    );

    final router = await pumpMessagesRouter(
      tester,
      auth,
      (context, state) => const SizedBox.shrink(),
      initialLocation: '/messages/contacts',
      routes: messagesRoutes,
    );
    await tester.pumpAndSettle();
    expect(find.text('工作联系人'), findsWidgets);

    await tester.tap(find.text('李四'));
    await tester.pumpAndSettle();

    final body = requests(helper, 'POST', '/companies/1/conversations')
        .single
        .body as Map<String, dynamic>;
    expect(body['member_user_ids'], [21], reason: '必须用联系人真实编号 21');
    expect(body['project_id'], 7);

    final uri = router.state.uri;
    expect(uri.path, '/messages/chat/88');
    expect(uri.queryParameters['type'], 'direct');
    expect(find.text('李四'), findsWidgets);
    expect(requests(helper, 'GET', '/conversations/88/messages'), isNotEmpty);

    await disposeMessagesTree(tester);
  });

  testWidgets('会话资料使用路由里的真实编号请求资料', (tester) async {
    final helper = MockApiClientHelper();
    final auth = await bootstrapTestAuth(helper);
    helper.whenGet(
      '/channels/6/pinned-links',
      {
        'items': [
          {'id': 91, 'title': '冲刺看板', 'url': 'https://example.com/sprint'},
        ],
      },
    );
    helper.whenGet(
      '/channels/6/files',
      {'items': <Map<String, dynamic>>[]},
    );
    helper.whenGet(
      '/channels/5/pinned-links',
      {'items': <Map<String, dynamic>>[]},
    );
    helper.whenGet(
      '/channels/5/files',
      {'items': <Map<String, dynamic>>[]},
    );

    await pumpMessagesRouter(
      tester,
      auth,
      (context, state) => const SizedBox.shrink(),
      initialLocation: '/messages/profile/6?type=channel&name=项目冲刺组',
      routes: messagesRoutes,
    );
    await tester.pumpAndSettle();

    expect(find.text('冲刺看板'), findsOneWidget);
    expect(requests(helper, 'GET', '/channels/6/pinned-links'), isNotEmpty);
    expect(requests(helper, 'GET', '/channels/5/pinned-links'), isEmpty);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets('会话编号非法时给出参数错误页而不是空白页', (tester) async {
    final helper = MockApiClientHelper();
    final auth = await bootstrapTestAuth(helper);

    await pumpMessagesRouter(
      tester,
      auth,
      (context, state) => const SizedBox.shrink(),
      initialLocation: '/messages/chat/abc?type=direct',
      routes: messagesRoutes,
    );
    await tester.pumpAndSettle();

    expect(find.text('页面参数不正确'), findsOneWidget);
    expect(find.text('会话编号无效，无法打开会话。'), findsOneWidget);
  });
}