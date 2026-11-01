import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/messages/data/messages_repository.dart';
import 'package:worktodo_app/features/messages/screens/messages_root_screen.dart';

import '../../helpers/mock_api_client.dart';
import 'messages_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  MockApiClientHelper baseHelper() {
    final helper = MockApiClientHelper();
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
      'items': [MessagesFixtures.directConversation, MessagesFixtures.groupConversation],
    });
    return helper;
  }

  Widget screen(MockApiClientHelper helper) => MessagesRootScreen(
        repository: MessagesRepository(helper.buildClient()),
        companyId: 1,
        projectId: 7,
      );

  testWidgets('频道与私聊列表按真实接口渲染，并可切换', (tester) async {
    final helper = baseHelper();
    await pumpMessagesScreen(tester, screen(helper));
    await tester.pumpAndSettle();

    expect(find.text('项目频道 (2)'), findsOneWidget);
    expect(find.text('直接私聊 (2)'), findsOneWidget);
    expect(find.text('全员交流大厅'), findsOneWidget);
    expect(find.text('项目公共频道 #general'), findsOneWidget);

    await tester.tap(find.text('直接私聊 (2)'));
    await tester.pumpAndSettle();
    expect(find.text('张三、李四'), findsOneWidget);
    expect(find.text('设计评审小组'), findsOneWidget);
    expect(find.textContaining('明天的评审安排在下午三点'), findsOneWidget);
    expect(find.text('暂无消息记录'), findsOneWidget);
  });

  testWidgets('项目频道无权限时展示后端返回的具体原因', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet(
      '/companies/1/channels',
      {
        'code': 40301,
        'message': '下辖人员尚未获得项目频道访问授权，请联系项目管理人员',
      },
      statusCode: 403,
      query: {'project_id': '7'},
    );
    helper.whenGet('/companies/1/conversations', {
      'items': [MessagesFixtures.directConversation],
    });

    await pumpMessagesScreen(tester, screen(helper));
    await tester.pumpAndSettle();

    expect(find.text('无法进入项目频道'), findsOneWidget);
    expect(
      find.text('下辖人员尚未获得项目频道访问授权，请联系项目管理人员'),
      findsOneWidget,
    );
    // 无权限不给“重试”入口，但私聊列表仍然可用
    expect(find.text('重新检查权限'), findsNothing);
    await tester.tap(find.text('直接私聊 (1)'));
    await tester.pumpAndSettle();
    expect(find.text('张三、李四'), findsOneWidget);
  });

  testWidgets('加载失败给出可见错误，点重试会重新请求', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet(
      '/companies/1/channels',
      {'code': 500, 'message': '服务暂时不可用'},
      statusCode: 500,
      query: {'project_id': '7'},
    );
    helper.whenGet('/companies/1/conversations', {'items': <Map<String, dynamic>>[]});

    await pumpMessagesScreen(tester, screen(helper));
    await tester.pumpAndSettle();
    expect(find.text('无法进入项目频道'), findsOneWidget);
    expect(find.text('服务暂时不可用'), findsOneWidget);

    final before = requests(helper, 'GET', '/companies/1/channels').length;
    helper.whenGet(
      '/companies/1/channels',
      {
        'items': [MessagesFixtures.generalChannel],
      },
      query: {'project_id': '7'},
    );
    await tester.tap(find.text('重试'));
    await tester.pumpAndSettle();

    expect(requests(helper, 'GET', '/companies/1/channels').length, greaterThan(before));
    expect(find.text('全员交流大厅'), findsOneWidget);
  });

  testWidgets('空频道与空私聊各自给出引导', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet(
      '/companies/1/channels',
      {'items': <Map<String, dynamic>>[]},
      query: {'project_id': '7'},
    );
    helper.whenGet('/companies/1/conversations', {'items': <Map<String, dynamic>>[]});

    await pumpMessagesScreen(tester, screen(helper));
    await tester.pumpAndSettle();
    expect(find.text('暂无项目频道'), findsOneWidget);
    expect(find.text('选择工作联系人'), findsOneWidget);

    await tester.tap(find.text('直接私聊 (0)'));
    await tester.pumpAndSettle();
    expect(find.text('暂无直接私聊'), findsOneWidget);
    expect(find.text('发起私聊'), findsOneWidget);
  });

  testWidgets('未加入企业时提示先加入企业，不发起接口请求', (tester) async {
    final helper = MockApiClientHelper();
    await pumpMessagesScreen(
      tester,
      MessagesRootScreen(
        repository: MessagesRepository(helper.buildClient()),
        companyId: null,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('尚未加入企业'), findsOneWidget);
    expect(helper.history, isEmpty);
  });

  testWidgets('iOS 风格下同样渲染频道列表', (tester) async {
    final helper = baseHelper();
    await pumpMessagesScreen(
      tester,
      screen(helper),
      platform: TargetPlatform.iOS,
    );
    await tester.pumpAndSettle();
    expect(find.text('全员交流大厅'), findsOneWidget);
    expect(find.text('项目频道 (2)'), findsOneWidget);
  });
}
