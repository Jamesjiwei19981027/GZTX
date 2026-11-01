import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';

import '../../helpers/mock_api_client.dart';

/// T08 测试夹具：所有 JSON 结构逐项对照后端真实返回
/// （shell.py / bindings.py / external_mail.py / calls.py）。
class MessagesFixtures {
  const MessagesFixtures._();

  static const int companyId = 1;
  static const int projectId = 7;
  static const int currentUserId = 11;

  static const Map<String, dynamic> generalChannel = {
    'id': 5,
    'key': 'general',
    'name': '全员交流大厅',
    'project_id': 7,
  };

  static const Map<String, dynamic> projectChannel = {
    'id': 6,
    'key': 'project',
    'name': '项目冲刺组',
    'project_id': 7,
  };

  static const Map<String, dynamic> directConversation = {
    'id': 55,
    'company_id': 1,
    'project_id': 7,
    'kind': 'direct',
    'title': null,
    'members': [
      {'user_id': 11, 'name': '张三', 'avatar': ''},
      {'user_id': 21, 'name': '李四', 'avatar': ''},
    ],
    'last_message': {
      'body': '明天的评审安排在下午三点',
      'created_at': '2026-10-30T05:20:00Z',
    },
  };

  static const Map<String, dynamic> groupConversation = {
    'id': 56,
    'company_id': 1,
    'project_id': null,
    'kind': 'group',
    'title': '设计评审小组',
    'members': [
      {'user_id': 11, 'name': '张三', 'avatar': ''},
      {'user_id': 21, 'name': '李四', 'avatar': ''},
      {'user_id': 31, 'name': '王五', 'avatar': ''},
    ],
    'last_message': null,
  };

  static Map<String, dynamic> channelMessage({
    int id = 9001,
    int userId = 21,
    String senderName = '李四',
    String body = '第一版原型已上传',
    int likes = 0,
    List<Map<String, dynamic>> attachments = const [],
  }) =>
      {
        'id': id,
        'channel_id': 5,
        'user_id': userId,
        'sender_name': senderName,
        'sender_avatar': '',
        'body': body,
        'likes': likes,
        'parent_id': null,
        'message_type': 'user',
        'attachments': attachments,
        'created_at': '2026-10-30T06:00:00Z',
      };

  static Map<String, dynamic> directMessage({
    int id = 8001,
    int userId = 11,
    String senderName = '张三',
    String body = '收到，我下午过去',
    List<Map<String, dynamic>> attachments = const [],
  }) =>
      {
        'id': id,
        'conversation_id': 55,
        'user_id': userId,
        'sender_name': senderName,
        'sender_avatar': '',
        'body': body,
        'message_type': 'user',
        'attachments': attachments,
        'created_at': '2026-10-30T06:05:00Z',
      };

  static const Map<String, dynamic> fileAttachment = {
    'file_id': 301,
    'original_name': '需求说明.pdf',
    'mime_type': 'application/pdf',
    'size_bytes': 2048,
    'download_url': '/api/v1/collab/files/301/download',
  };

  static const Map<String, dynamic> summary = {
    'id': 71,
    'company_id': 1,
    'project_id': 7,
    'scope_type': 'channel',
    'scope_id': 5,
    'source_from_id': 9001,
    'source_to_id': 9002,
    'source_count': 2,
    'summary_text': '要点：确认原型评审时间；待办：李四补充交互说明。',
    'key_points': ['确认原型评审时间', '李四补充交互说明'],
    'decisions': ['确认原型评审时间'],
    'action_items': ['李四补充交互说明'],
    'risks': <String>[],
    'provider': 'deterministic',
    'status': 'completed',
    'error_message': null,
    'created_at': '2026-10-30T06:10:00Z',
  };

  static const Map<String, dynamic> workContacts = {
    'items': [
      {'id': 21, 'name': '李四', 'avatar': ''},
      {'id': 31, 'name': '王五', 'avatar': ''},
    ],
  };

  static const Map<String, dynamic> notifications = {
    'items': [
      {
        'id': 401,
        'template_key': 'task_assigned',
        'payload': {'task_id': 12},
        'body_text': '你有一条新的任务待确认，请在今天内回复。',
        'read': false,
        'sender': {'user_id': 21, 'name': '李四', 'avatar_url': ''},
        'recipient_user_ids': [11],
        'attachments': <Map<String, dynamic>>[],
        'requires_reply': true,
        'reply_text': null,
        'replied_at': null,
        'archived': false,
        'archived_at': null,
        'deleted': false,
        'created_at': '2026-10-30T06:20:00Z',
      },
      {
        'id': 402,
        'template_key': 'report_reminder',
        'payload': <String, dynamic>{},
        'body_text': '本周周报尚未提交。',
        'read': true,
        'sender': null,
        'recipient_user_ids': [11],
        'attachments': <Map<String, dynamic>>[],
        'requires_reply': false,
        'reply_text': null,
        'replied_at': null,
        'archived': false,
        'archived_at': null,
        'deleted': false,
        'created_at': '2026-10-29T02:00:00Z',
      },
    ],
    'total': 2,
    'page': 1,
    'page_size': 20,
  };

  static const Map<String, dynamic> mailStatusUnconfigured = {
    'provider': 'imap',
    'configured': false,
    'host': null,
    'username': null,
    'reason': 'IMAP credentials are not configured',
  };

  static const Map<String, dynamic> mailStatusConfigured = {
    'provider': 'imap',
    'configured': true,
    'host': 'imap.example.com',
    'username': 'team@example.com',
    'reason': null,
  };

  static const Map<String, dynamic> mailList = {
    'items': [
      {
        'id': 61,
        'company_id': 1,
        'provider': 'imap',
        'external_id': '<abc@example.com>',
        'from_address': 'client@example.com',
        'to_addresses': ['team@example.com'],
        'subject': '关于二期验收时间的确认',
        'headers': <String, dynamic>{},
        'state': 'active',
        'received_at': '2026-10-30T01:00:00Z',
        'synced_at': '2026-10-30T01:05:00Z',
        'created_at': '2026-10-30T01:05:00Z',
      },
    ],
    'total': 1,
  };

  static const Map<String, dynamic> mailDetail = {
    'id': 61,
    'company_id': 1,
    'provider': 'imap',
    'external_id': '<abc@example.com>',
    'from_address': 'client@example.com',
    'to_addresses': ['team@example.com'],
    'subject': '关于二期验收时间的确认',
    'headers': <String, dynamic>{},
    'state': 'active',
    'received_at': '2026-10-30T01:00:00Z',
    'synced_at': '2026-10-30T01:05:00Z',
    'created_at': '2026-10-30T01:05:00Z',
    'body_text': '希望把二期验收安排在 11 月 10 日，请确认。',
  };

  static const Map<String, dynamic> callConfigUnconfigured = {
    'configured': false,
    'ice_servers': <Map<String, dynamic>>[],
    'message':
        'STUN/TURN is not configured; local/browser defaults may still work',
  };

  static const Map<String, dynamic> callConfigConfigured = {
    'configured': true,
    'ice_servers': [
      {'urls': 'stun:stun.example.com:3478'},
      {
        'urls': 'turn:turn.example.com:3478',
        'username': 'team',
        'credential': 'secret',
      },
    ],
    'message': 'ICE servers configured',
  };

  static const Map<String, dynamic> callSession = {
    'id': 901,
    'company_id': 1,
    'project_id': 7,
    'conversation_id': 55,
    'initiated_by': 11,
    'call_type': 'audio',
    'status': 'active',
    'participants': [11, 21],
    'started_at': '2026-10-30T06:30:00Z',
    'ended_at': null,
  };

  static const Map<String, dynamic> presence = {
    'items': [
      {'user_id': 11, 'status': 'online'},
      {'user_id': 21, 'status': 'busy'},
    ],
  };

  static const Map<String, dynamic> pinnedLinks = {
    'items': [
      {
        'id': 81,
        'title': '需求文档',
        'url': 'https://example.com/spec',
        'created_by': 21,
        'created_at': '2026-10-28T03:00:00Z',
      },
    ],
  };

  static const Map<String, dynamic> channelFiles = {
    'items': [
      {
        'id': 301,
        'company_id': 1,
        'owner_user_id': 21,
        'scope_type': 'channel',
        'scope_id': 5,
        'message_id': 9001,
        'storage_key': 'collab/1/21/abc.pdf',
        'original_name': '需求说明.pdf',
        'mime_type': 'application/pdf',
        'size_bytes': 2048,
        'sha256': 'x',
        'download_url': '/api/v1/collab/files/301/download',
        'created_at': '2026-10-30T06:00:00Z',
      },
    ],
  };
}

/// 统一的页面挂载：默认安卓 Material，可指定 iOS 与字号
Future<void> pumpMessagesScreen(
  WidgetTester tester,
  Widget child, {
  TargetPlatform platform = TargetPlatform.android,
  Size size = const Size(390, 844),
  double textScale = 1.0,
  Brightness brightness = Brightness.light,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    MaterialApp(
      theme: ThemeData(
        platform: platform,
        brightness: brightness,
        useMaterial3: true,
        fontFamily: 'NotoSansSC',
        cupertinoOverrideTheme: CupertinoThemeData(
          brightness: brightness,
          textTheme: const CupertinoTextThemeData(
            textStyle: TextStyle(fontFamily: 'NotoSansSC'),
          ),
        ),
      ),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('zh', 'CN')],
      home: MediaQuery(
        data: MediaQueryData(
          size: size,
          textScaler: TextScaler.linear(textScale),
          platformBrightness: brightness,
        ),
        child: child,
      ),
    ),
  );
  await tester.pump();
}

/// 页面销毁，用于清掉聊天轮询定时器，避免测试结束时报“Timer 仍待处理”
Future<void> disposeMessagesTree(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump();
}

/// 取最后一次请求
MockRequestRecord lastRequest(MockApiClientHelper helper) =>
    helper.history.last;

Iterable<MockRequestRecord> requests(
  MockApiClientHelper helper,
  String method,
  String path,
) {
  /// 记录里的 path 带 `/api/v1` 前缀，这里剥掉后再比较
  String normalize(String raw) =>
      raw.startsWith('/api/v1') ? raw.substring('/api/v1'.length) : raw;
  return helper.history.where(
    (record) =>
        record.method.toUpperCase() == method.toUpperCase() &&
        normalize(record.url.path) == path,
  );
}

/// 构建带企业 / 项目上下文的登录态，供需要 Provider 的页面（路由跳转后）使用
Future<AuthState> bootstrapTestAuth(
  MockApiClientHelper helper, {
  bool withCompany = true,
}) async {
  SharedPreferences.setMockInitialValues({});
  helper.whenGet('/users/me', {
    'id': MessagesFixtures.currentUserId,
    'username': 'e2e_user',
    'nickname': '张三',
    'avatar_url': null,
    'email': 'e2e_user@example.com',
  });
  helper.whenGet('/companies/mine', {
    'items': withCompany
        ? [
            {
              'id': MessagesFixtures.companyId,
              'name': '示例科技',
              'slug': 'demo',
              'status': 'active'
            },
          ]
        : <Map<String, dynamic>>[],
    'total': withCompany ? 1 : 0,
  });
  helper.whenGet(
    '/projects',
    {
      'items': withCompany
          ? [
              {
                'id': MessagesFixtures.projectId,
                'name': '示例项目',
                'company_id': MessagesFixtures.companyId,
              },
            ]
          : <Map<String, dynamic>>[],
      'total': withCompany ? 1 : 0,
    },
    query: {'company_id': '${MessagesFixtures.companyId}', 'as_admin': 'true'},
  );
  final auth = AuthState(apiClient: helper.buildClient());
  await auth.bootstrap();
  return auth;
}

/// 挂载带路由的页面（Provider + GoRouter），用于验证跨页面跳转参数
Future<GoRouter> pumpMessagesRouter(
  WidgetTester tester,
  AuthState authState,
  Widget Function(BuildContext, GoRouterState) builder, {
  String initialLocation = '/messages',
  List<RouteBase>? routes,
}) async {
  final router = GoRouter(
    initialLocation: initialLocation,
    routes: routes ??
        [
          GoRoute(
            path: '/messages',
            builder: (context, state) => builder(context, state),
          ),
        ],
  );
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  await tester.pumpWidget(
    ChangeNotifierProvider<AuthState>.value(
      value: authState,
      child: MaterialApp.router(
        theme: ThemeData(platform: TargetPlatform.android, useMaterial3: true),
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [Locale('zh', 'CN')],
        routerConfig: router,
      ),
    ),
  );
  await tester.pump();
  return router;
}
