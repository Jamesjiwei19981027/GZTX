import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../design/design.dart';
import 'screens/call_screen.dart';
import 'screens/chat_screen.dart';
import 'screens/conversation_profile_screen.dart';
import 'screens/external_mail_view.dart';
import 'screens/inbox_screen.dart';
import 'screens/messages_root_screen.dart';
import 'screens/work_contacts_screen.dart';

/// 路径或参数不合法时的兜底页
class MessagesRouteErrorScreen extends StatelessWidget {
  const MessagesRouteErrorScreen({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: '消息',
      body: AppErrorState(
        title: '页面参数不正确',
        message: message,
        onRetry: () => context.go('/messages'),
        retryLabel: '回到消息中心',
      ),
    );
  }
}

int? _parseId(GoRouterState state) {
  final raw = state.pathParameters['id'];
  final value = int.tryParse(raw ?? '');
  if (value == null || value <= 0) return null;
  return value;
}

String _typeOf(GoRouterState state) =>
    state.uri.queryParameters['type'] == 'direct' ? 'direct' : 'channel';

String _nameOf(GoRouterState state, String fallback) {
  // go_router 已对查询参数解码一次，这里不能再解一次（中文会被判为非法百分号编码）
  final value = (state.uri.queryParameters['name'] ?? '').trim();
  return value.isEmpty ? fallback : value;
}

final List<RouteBase> messagesRoutes = [
  GoRoute(
    path: '/messages',
    name: 'messages-root',
    builder: (context, state) => const MessagesRootScreen(),
    routes: [
      GoRoute(
        path: 'contacts',
        name: 'messages-contacts',
        builder: (context, state) => const WorkContactsScreen(),
      ),
      GoRoute(
        path: 'chat/:id',
        name: 'messages-chat',
        // 同一路由换会话参数（不同 id）时必须重建页面并重新拉数据
        builder: (context, state) {
          final id = _parseId(state);
          if (id == null) {
            return const MessagesRouteErrorScreen(message: '会话编号无效，无法打开会话。');
          }
          final type = _typeOf(state);
          return ChatScreen(
            key: ValueKey('messages-chat-$type-$id'),
            scopeType: type,
            scopeId: id,
            name: _nameOf(state, type == 'direct' ? '私聊' : '项目频道'),
          );
        },
      ),
      GoRoute(
        path: 'profile/:id',
        name: 'messages-profile',
        builder: (context, state) {
          final id = _parseId(state);
          if (id == null) {
            return const MessagesRouteErrorScreen(message: '会话编号无效，无法查看资料。');
          }
          final type = _typeOf(state);
          return ConversationProfileScreen(
            key: ValueKey('messages-profile-$type-$id'),
            scopeType: type,
            scopeId: id,
            name: _nameOf(state, '会话资料'),
          );
        },
      ),
      GoRoute(
        path: 'inbox',
        name: 'messages-inbox',
        builder: (context, state) => const InboxScreen(),
      ),
      GoRoute(
        path: 'notifications',
        name: 'messages-notifications',
        builder: (context, state) => const InboxScreen(),
      ),
      GoRoute(
        path: 'external-mail',
        name: 'messages-external-mail',
        builder: (context, state) => const ExternalMailScreen(),
      ),
      GoRoute(
        path: 'call',
        name: 'messages-call',
        builder: (context, state) {
          final query = state.uri.queryParameters;
          final conversation = int.tryParse(query['conversationId'] ?? '');
          return CallScreen(
            conversationId: (conversation != null && conversation > 0)
                ? conversation
                : null,
            callType: query['callType'] == 'video' ? 'video' : 'audio',
            targetName: _nameOf(state, '协同成员'),
          );
        },
      ),
    ],
  ),
];
