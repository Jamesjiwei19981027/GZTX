import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/core/models/company.dart';
import 'package:worktodo_app/features/messages/data/messages_repository.dart';
import 'package:worktodo_app/features/messages/screens/call_screen.dart';

import '../../helpers/mock_api_client.dart';
import 'messages_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('未配置通话服务时展示真实诊断，不显示伪造的通话中状态', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet(
        '/calls/config',
        MessagesFixtures.callConfigUnconfigured,
        query: {'company_id': '1'},
      );

    await pumpMessagesScreen(
      tester,
      CallScreen(
        repository: MessagesRepository(helper.buildClient()),
        companyId: 1,
        conversationId: 55,
        targetName: '李四',
        callType: 'audio',
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('音视频服务未配置'), findsOneWidget);
    expect(find.textContaining('STUN/TURN'), findsOneWidget);
    expect(find.text('通话中'), findsNothing, reason: '不得显示伪造的通话状态');

    await disposeMessagesTree(tester);
  });

  testWidgets('已配置时创建会话、显示 ICE 数量，挂断会结束会话', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet(
        '/calls/config',
        MessagesFixtures.callConfigConfigured,
        query: {'company_id': '1'},
      )
      ..whenPost('/calls/sessions', MessagesFixtures.callSession)
      ..whenPost(
        '/calls/sessions/901/end',
        {
          ...MessagesFixtures.callSession,
          'status': 'ended',
          'ended_at': '2026-10-30T06:40:00Z',
        },
      );

    await pumpMessagesScreen(
      tester,
      CallScreen(
        repository: MessagesRepository(helper.buildClient()),
        companyId: 1,
        conversationId: 55,
        targetName: '李四',
        callType: 'audio',
      ),
    );
    await tester.pumpAndSettle();

    final createBody = requests(helper, 'POST', '/calls/sessions').single.body
        as Map<String, dynamic>;
    expect(createBody['conversation_id'], 55);
    expect(createBody['call_type'], 'audio');
    expect(find.text('李四'), findsOneWidget);
    expect(find.text('ICE 节点：2 个服务器可用'), findsOneWidget);
    expect(find.text('通话会话 #901 已创建'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.call_end_rounded));
    await tester.pumpAndSettle();

    expect(requests(helper, 'POST', '/calls/sessions/901/end'), isNotEmpty);

    await disposeMessagesTree(tester);
  });

  testWidgets('结束会话失败时保留页面并给出可见错误', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet(
        '/calls/config',
        MessagesFixtures.callConfigConfigured,
        query: {'company_id': '1'},
      )
      ..whenPost('/calls/sessions', MessagesFixtures.callSession)
      ..whenPost(
        '/calls/sessions/901/end',
        {'code': 500, 'message': '通话服务暂不可用'},
        statusCode: 500,
      );

    await pumpMessagesScreen(
      tester,
      CallScreen(
        repository: MessagesRepository(helper.buildClient()),
        companyId: 1,
        conversationId: 55,
        targetName: '李四',
        callType: 'video',
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.call_end_rounded));
    await tester.pumpAndSettle();

    expect(find.textContaining('结束通话失败：通话服务暂不可用'), findsOneWidget);
    expect(find.text('李四'), findsOneWidget, reason: '失败时不退出页面');

    await tester.pump(const Duration(seconds: 3));
    await disposeMessagesTree(tester);
  });

  testWidgets('频道内不发起通话会话，改为提示从私聊进入', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet(
        '/calls/config',
        MessagesFixtures.callConfigConfigured,
        query: {'company_id': '1'},
      );

    await pumpMessagesScreen(
      tester,
      CallScreen(
        repository: MessagesRepository(helper.buildClient()),
        companyId: 1,
        targetName: '全员交流大厅',
        callType: 'audio',
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('频道通话暂不支持'), findsOneWidget);
    expect(requests(helper, 'POST', '/calls/sessions'), isEmpty);

    await disposeMessagesTree(tester);
  });

  testWidgets('会话创建失败时在通话页给出原因', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet(
        '/calls/config',
        MessagesFixtures.callConfigConfigured,
        query: {'company_id': '1'},
      )
      ..whenPost(
        '/calls/sessions',
        {'code': 403, 'message': '您不是该会话成员，无法查看'},
        statusCode: 403,
      );

    await pumpMessagesScreen(
      tester,
      CallScreen(
        repository: MessagesRepository(helper.buildClient()),
        companyId: 1,
        conversationId: 55,
        targetName: '李四',
        callType: 'audio',
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('会话创建失败：您不是该会话成员'), findsOneWidget);
    expect(find.text('ICE 节点：2 个服务器可用'), findsOneWidget);

    await disposeMessagesTree(tester);
  });

  testWidgets('未加入企业时说明无法查询通话网关', (tester) async {
    final helper = MockApiClientHelper();
    await pumpMessagesScreen(
      tester,
      CallScreen(
        repository: MessagesRepository(helper.buildClient()),
        companyId: null,
        conversationId: 55,
        targetName: '李四',
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('音视频服务未配置'), findsOneWidget);
    expect(find.textContaining('未加入企业工作区'), findsOneWidget);
    expect(helper.history, isEmpty);

    await disposeMessagesTree(tester);
  });
  testWidgets('通话中切换企业：先结束旧会话，再按新企业重建', (tester) async {
    final calls = <String>[];
    http.Response reply(Object body) => http.Response(
          jsonEncode(body),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
    final client = MockClient((request) async {
      final path = request.url.path.replaceFirst('/api/v1', '');
      calls.add('${request.method} $path');
      switch ('${request.method} $path') {
        case 'GET /users/me':
          return reply({'id': 11, 'username': 'e2e_user', 'nickname': '张三'});
        case 'GET /companies/mine':
          return reply({
            'items': [
              {'id': 1, 'name': '示例科技', 'slug': 'demo', 'status': 'active'},
              {'id': 2, 'name': '未来科技', 'slug': 'future', 'status': 'active'},
            ],
            'total': 2,
          });
        case 'GET /projects':
          final companyId = request.url.queryParameters['company_id'];
          return reply({
            'items': [
              {'id': companyId == '2' ? 21 : 7, 'name': '项目', 'company_id': int.parse(companyId ?? '1')},
            ],
          });
        case 'GET /calls/config':
          return reply(MessagesFixtures.callConfigConfigured);
        case 'POST /calls/sessions':
          return reply(MessagesFixtures.callSession);
        case 'POST /calls/sessions/901/end':
          return reply({
            ...MessagesFixtures.callSession,
            'status': 'ended',
            'ended_at': '2026-10-30T06:40:00Z',
          });
      }
      return reply({'items': <Object>[]});
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
    expect(auth.currentCompany?.id, 1);

    await pumpMessagesScreen(
      tester,
      ChangeNotifierProvider<AuthState>.value(
        value: auth,
        child: const CallScreen(
          conversationId: 55,
          targetName: '李四',
          callType: 'audio',
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('通话会话 #901 已创建'), findsOneWidget);
    expect(calls.where((c) => c == 'POST /calls/sessions/901/end'), isEmpty);

    await auth.selectCompany(const Company(id: 2, name: '未来科技'));
    await tester.pumpAndSettle();

    expect(
      calls.where((c) => c == 'POST /calls/sessions/901/end'),
      hasLength(1),
      reason: '切换企业时必须结束旧企业的通话会话',
    );
    expect(
      calls.where((c) => c == 'GET /calls/config'),
      hasLength(2),
      reason: '按新企业重新拉通话配置',
    );

    await disposeMessagesTree(tester);
  });
}
