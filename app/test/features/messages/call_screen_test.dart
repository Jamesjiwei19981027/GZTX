import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
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
}
