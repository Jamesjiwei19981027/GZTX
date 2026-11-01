import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/core/models/project.dart';
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
      'items': [
        MessagesFixtures.directConversation,
        MessagesFixtures.groupConversation
      ],
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
    helper.whenGet(
        '/companies/1/conversations', {'items': <Map<String, dynamic>>[]});

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

    expect(requests(helper, 'GET', '/companies/1/channels').length,
        greaterThan(before));
    expect(find.text('全员交流大厅'), findsOneWidget);
  });

  testWidgets('断网时给出中文网络提示与重试入口', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet(
      '/companies/1/channels',
      Exception('网络断开'),
      query: {'project_id': '7'},
    );
    helper.whenGet(
      '/companies/1/conversations',
      Exception('网络断开'),
    );

    await pumpMessagesScreen(tester, screen(helper));
    await tester.pumpAndSettle();

    expect(find.text('网络连接异常或请求超时，请检查网络后重试'), findsWidgets);
    expect(find.text('重试'), findsWidgets);

    helper.whenGet(
      '/companies/1/channels',
      {
        'items': [MessagesFixtures.generalChannel],
      },
      query: {'project_id': '7'},
    );
    helper.whenGet(
        '/companies/1/conversations', {'items': <Map<String, dynamic>>[]});
    await tester.tap(find.text('重试').first);
    await tester.pumpAndSettle();
    expect(find.text('全员交流大厅'), findsOneWidget);
  });

  testWidgets('空频道与空私聊各自给出引导', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet(
      '/companies/1/channels',
      {'items': <Map<String, dynamic>>[]},
      query: {'project_id': '7'},
    );
    helper.whenGet(
        '/companies/1/conversations', {'items': <Map<String, dynamic>>[]});

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

  testWidgets('消息 Tab 常驻时切换项目：列表换成新项目数据，旧请求的迟到结果被丢弃', (tester) async {
    final releaseProject7 = Completer<void>();
    final channelsProjects = <String?>[];

    http.Response reply(Object body, [int status = 200]) => http.Response(
          jsonEncode(body),
          status,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );

    final client = MockClient((request) async {
      switch (request.url.path) {
        case '/api/v1/users/me':
          return reply({'id': 11, 'username': 'e2e_user', 'nickname': '张三'});
        case '/api/v1/companies/mine':
          return reply({
            'items': [
              {'id': 1, 'name': '示例科技', 'slug': 'demo', 'status': 'active'},
            ],
            'total': 1,
          });
        case '/api/v1/projects':
          return reply({
            'items': [
              {'id': 7, 'name': '示例项目', 'company_id': 1},
              {'id': 8, 'name': '第二个项目', 'company_id': 1},
            ],
          });
        case '/api/v1/companies/1/conversations':
          return reply({'items': <Map<String, dynamic>>[]});
        case '/api/v1/companies/1/channels':
          final projectId = request.url.queryParameters['project_id'];
          channelsProjects.add(projectId);
          if (projectId == '7') {
            // 旧项目的频道请求挂起，模拟切换后迟到的响应
            await releaseProject7.future;
            return reply({
              'items': [
                {
                  'id': 5,
                  'key': 'general',
                  'name': '七号项目的频道',
                  'project_id': 7,
                },
              ],
            });
          }
          return reply({
            'items': [
              {
                'id': 9,
                'key': 'sprint',
                'name': '八号项目的频道',
                'project_id': 8,
              },
            ],
          });
      }
      return reply({'code': 404, 'message': '未配置模拟数据: ${request.url.path}'}, 404);
    });

    SharedPreferences.setMockInitialValues({});
    final auth = AuthState(
      apiClient: ApiClient(
        tokenStorage: InMemoryTokenStorage(access: 'mock-access-token'),
        httpClient: client,
        baseUrl: 'http://localhost:8010/api/v1',
      ),
    );
    await auth.bootstrap();
    expect(auth.currentProject?.id, 7);

    await pumpMessagesRouter(
      tester,
      auth,
      (context, state) => const MessagesRootScreen(),
    );
    await tester.pump();
    expect(channelsProjects, ['7']);

    auth.selectProject(const Project(id: 8, name: '第二个项目', companyId: 1));
    await tester.pumpAndSettle();

    expect(channelsProjects, ['7', '8']);
    expect(find.text('八号项目的频道'), findsOneWidget);
    expect(find.text('七号项目的频道'), findsNothing);

    // 旧项目的请求此刻才返回：页面必须继续显示新项目的数据
    releaseProject7.complete();
    await tester.pumpAndSettle();

    expect(find.text('八号项目的频道'), findsOneWidget);
    expect(find.text('七号项目的频道'), findsNothing);
  });
}
