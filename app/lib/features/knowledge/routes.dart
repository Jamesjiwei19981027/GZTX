import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../design/design.dart';
import 'screens/knowledge_screen.dart';

/// 知识助手对话占位页。
///
/// “知识助手”对话本身属于 T07，本任务只提供知识 Tab 内的入口跳转，
/// 路由名 `knowledge-chat` 保持不变，避免破坏既有深链。
class KnowledgeChatPlaceholderScreen extends StatelessWidget {
  const KnowledgeChatPlaceholderScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: '知识助手',
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xxl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AppIcon('ai', size: 48, color: AppColors.primary),
              const SizedBox(height: AppSpacing.lg),
              const Text(
                '知识助手即将开放',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                '对话能力由后续任务提供，这里只保留入口。',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 14,
                  color: isDarkMode(context)
                      ? AppColors.darkTextSecondary
                      : AppColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

final List<RouteBase> knowledgeRoutes = [
  GoRoute(
    path: '/knowledge',
    name: 'knowledge-root',
    builder: (context, state) => const KnowledgeScreen(),
    routes: [
      GoRoute(
        path: 'chat',
        name: 'knowledge-chat',
        builder: (context, state) => const KnowledgeChatPlaceholderScreen(),
      ),
    ],
  ),
];
