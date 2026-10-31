import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../design/design.dart';

/// T07 AI 汇报模块路由占位
class ReportsPlaceholderScreen extends StatelessWidget {
  const ReportsPlaceholderScreen({
    super.key,
    this.screenName = 'ai-root',
    this.title = 'AI 汇报 (T07)',
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
              const AppIcon('ai', size: 48, color: AppColors.primary),
              const SizedBox(height: AppSpacing.lg),
              Text(
                title,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                '屏幕标识: $screenName\n待 T07 任务包实现具体页面',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 14, color: AppColors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.xl),
              AppButton(
                label: '返回上一页',
                variant: AppButtonVariant.secondary,
                onPressed: () => context.pop(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

final List<RouteBase> reportsRoutes = [
  GoRoute(
    path: '/reports',
    name: 'ai-root',
    builder: (context, state) => const ReportsPlaceholderScreen(
      screenName: 'ai-root',
      title: 'AI 汇报概览',
    ),
    routes: [
      GoRoute(
        path: 'create',
        name: 'ai-report-create',
        builder: (context, state) => const ReportsPlaceholderScreen(
          screenName: 'ai-report-create',
          title: '创建汇报',
        ),
      ),
      GoRoute(
        path: 'detail/:id',
        name: 'ai-report-detail',
        builder: (context, state) => ReportsPlaceholderScreen(
          screenName: 'ai-report-detail',
          title: '汇报详情 #${state.pathParameters['id']}',
        ),
      ),
      GoRoute(
        path: 'chat',
        name: 'ai-chat',
        builder: (context, state) => const ReportsPlaceholderScreen(
          screenName: 'ai-chat',
          title: '智能助手会话',
        ),
      ),
    ],
  ),
];
