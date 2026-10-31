import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../design/design.dart';

/// T06 知识空间路由占位
class KnowledgePlaceholderScreen extends StatelessWidget {
  const KnowledgePlaceholderScreen({
    super.key,
    this.screenName = 'knowledge-root',
    this.title = '知识',
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
              const AppIcon('knowledge', size: 48, color: AppColors.primary),
              const SizedBox(height: AppSpacing.lg),
              Text(
                '$title (T06)',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                '屏幕标识: $screenName\n待 T06 任务包实现具体页面',
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

final List<RouteBase> knowledgeRoutes = [
  GoRoute(
    path: '/knowledge',
    name: 'knowledge-root',
    builder: (context, state) => const KnowledgePlaceholderScreen(
      screenName: 'knowledge-root',
      title: '知识',
    ),
    routes: [
      GoRoute(
        path: 'chat',
        name: 'knowledge-chat',
        builder: (context, state) => const KnowledgePlaceholderScreen(
          screenName: 'knowledge-chat',
          title: '知识库问答',
        ),
      ),
    ],
  ),
];
