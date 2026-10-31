import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../design/design.dart';

/// T08 消息与通话模块路由占位
class MessagesPlaceholderScreen extends StatelessWidget {
  const MessagesPlaceholderScreen({
    super.key,
    this.screenName = 'messages-root',
    this.title = '消息',
  });

  final String screenName;
  final String title;

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: title,
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xxl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AppIcon('messages', size: 48, color: AppColors.primary),
              const SizedBox(height: AppSpacing.lg),
              Text(
                '$title (T08)',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                '屏幕标识: $screenName\n待 T08 任务包实现具体页面',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 14, color: AppColors.textSecondary),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

final List<RouteBase> messagesRoutes = [
  GoRoute(
    path: '/messages',
    name: 'messages-root',
    builder: (context, state) => const MessagesPlaceholderScreen(
      screenName: 'messages-root',
      title: '消息',
    ),
    routes: [
      GoRoute(
        path: 'contacts',
        name: 'messages-contacts',
        builder: (context, state) => const MessagesPlaceholderScreen(
          screenName: 'messages-contacts',
          title: '联系人列表',
        ),
      ),
      GoRoute(
        path: 'chat/:id',
        name: 'messages-chat',
        builder: (context, state) => MessagesPlaceholderScreen(
          screenName: 'messages-chat',
          title: '会话 #${state.pathParameters['id']}',
        ),
      ),
      GoRoute(
        path: 'notifications',
        name: 'messages-notifications',
        builder: (context, state) => const MessagesPlaceholderScreen(
          screenName: 'messages-notifications',
          title: '系统通知',
        ),
      ),
    ],
  ),
];
