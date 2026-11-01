import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/messages/data/messages_repository.dart';
import 'package:worktodo_app/features/messages/screens/conversation_profile_screen.dart';

import '../../helpers/mock_api_client.dart';
import 'messages_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  MockApiClientHelper channelHelper() => MockApiClientHelper()
    ..whenGet('/channels/5/pinned-links', MessagesFixtures.pinnedLinks)
    ..whenGet('/channels/5/files', MessagesFixtures.channelFiles);

  Widget channelProfile(MockApiClientHelper helper) =>
      ConversationProfileScreen(
        repository: MessagesRepository(helper.buildClient()),
        scopeType: 'channel',
        scopeId: 5,
        name: '全员交流大厅',
        companyId: 1,
      );

  testWidgets('频道资料展示钉选链接与共享文件', (tester) async {
    final helper = channelHelper();
    await pumpMessagesScreen(tester, channelProfile(helper));
    await tester.pumpAndSettle();

    expect(find.text('项目公共讨论频道'), findsOneWidget);
    expect(find.text('钉选链接 (1)'), findsOneWidget);
    expect(find.text('需求文档'), findsOneWidget);
    expect(find.text('https://example.com/spec'), findsOneWidget);
    expect(find.text('共享材料与文件 (1)'), findsOneWidget);
    expect(find.text('需求说明.pdf'), findsOneWidget);
    expect(find.text('2.0 KB'), findsOneWidget);
  });

  testWidgets('添加钉选链接：空标题被拦截，填写后提交并出现在列表', (tester) async {
    final helper = channelHelper();
    helper.whenPost(
      '/channels/5/pinned-links',
      {'id': 82, 'title': '设计稿', 'url': 'https://figma.com/file/x'},
    );

    await pumpMessagesScreen(tester, channelProfile(helper));
    await tester.pumpAndSettle();

    await tester.tap(find.text('添加新钉选链接'));
    await tester.pumpAndSettle();
    expect(find.text('添加钉选链接'), findsOneWidget);

    await tester.tap(find.text('确认钉选'));
    await tester.pumpAndSettle();
    expect(find.text('请填写链接标题'), findsOneWidget);

    final fields = find.byType(EditableText);
    await tester.enterText(fields.at(0), '设计稿');
    await tester.enterText(fields.at(1), 'https://figma.com/file/x');
    await tester.pump();
    await tester.tap(find.text('确认钉选'));
    await tester.pumpAndSettle();

    expect(
      requests(helper, 'POST', '/channels/5/pinned-links').single.body,
      {'title': '设计稿', 'url': 'https://figma.com/file/x'},
    );
    expect(find.text('设计稿'), findsOneWidget);
    expect(find.text('钉选链接 (2)'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await disposeMessagesTree(tester);
  });

  testWidgets('删除钉选链接需要二次确认', (tester) async {
    final helper = channelHelper();
    helper
        .whenDelete('/channels/5/pinned-links/81', {'id': 81, 'deleted': true});

    await pumpMessagesScreen(tester, channelProfile(helper));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('删除钉选链接'));
    await tester.pumpAndSettle();
    expect(find.text('删除钉选链接'), findsOneWidget);
    expect(requests(helper, 'DELETE', '/channels/5/pinned-links/81'), isEmpty);

    await tester.tap(find.text('删除').last);
    await tester.pumpAndSettle();

    expect(
        requests(helper, 'DELETE', '/channels/5/pinned-links/81'), isNotEmpty);
    expect(find.text('需求文档'), findsNothing);
    expect(find.text('钉选链接 (0)'), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await disposeMessagesTree(tester);
  });

  testWidgets('私聊资料展示成员与在线状态', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet('/conversations/55/files', MessagesFixtures.channelFiles)
      ..whenGet('/companies/1/conversations', {
        'items': [MessagesFixtures.directConversation],
      })
      ..whenGet('/companies/1/presence', MessagesFixtures.presence);

    await pumpMessagesScreen(
      tester,
      ConversationProfileScreen(
        repository: MessagesRepository(helper.buildClient()),
        scopeType: 'direct',
        scopeId: 55,
        name: '李四',
        companyId: 1,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('直接私信讨论'), findsOneWidget);
    expect(find.text('会话成员 (2)'), findsOneWidget);
    expect(find.text('张三'), findsOneWidget);
    expect(find.text('李四'), findsWidgets);
    expect(find.text('在线'), findsOneWidget);
    expect(find.text('忙碌'), findsOneWidget);
    expect(find.textContaining('钉选链接'), findsNothing);
  });

  testWidgets('同一页面切换会话编号后重新拉取新会话资料', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet(
        '/channels/5/pinned-links',
        {
          'items': [
            {'id': 81, 'title': '五号频道的链接', 'url': 'https://example.com/a'},
          ],
        },
      )
      ..whenGet('/channels/5/files', {'items': <Map<String, dynamic>>[]})
      ..whenGet(
        '/channels/6/pinned-links',
        {
          'items': [
            {'id': 82, 'title': '六号频道的链接', 'url': 'https://example.com/b'},
          ],
        },
      )
      ..whenGet('/channels/6/files', {'items': <Map<String, dynamic>>[]});
    final repository = MessagesRepository(helper.buildClient());

    await pumpMessagesScreen(
      tester,
      ConversationProfileScreen(
        repository: repository,
        scopeType: 'channel',
        scopeId: 5,
        name: '全员交流大厅',
        companyId: 1,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('五号频道的链接'), findsOneWidget);

    await pumpMessagesScreen(
      tester,
      ConversationProfileScreen(
        repository: repository,
        scopeType: 'channel',
        scopeId: 6,
        name: '项目冲刺组',
        companyId: 1,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('六号频道的链接'), findsOneWidget);
    expect(find.text('五号频道的链接'), findsNothing);
    expect(requests(helper, 'GET', '/channels/6/pinned-links'), isNotEmpty);
  });

  testWidgets('资料加载失败给出原因并可重试', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet(
        '/channels/5/files',
        {'code': 500, 'message': '资料服务暂不可用'},
        statusCode: 500,
      )
      ..whenGet('/channels/5/pinned-links', MessagesFixtures.pinnedLinks);

    await pumpMessagesScreen(tester, channelProfile(helper));
    await tester.pumpAndSettle();
    expect(find.text('资料服务暂不可用'), findsOneWidget);
    expect(find.text('重试'), findsOneWidget);
  });
}
