import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../design/design.dart';

/// T03 项目与团队路由占位
class ProjectsPlaceholderScreen extends StatelessWidget {
  const ProjectsPlaceholderScreen({
    super.key,
    this.screenName = 'project-overview',
    this.title = '项目与团队 (T03)',
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
              const AppIcon('team', size: 48, color: AppColors.primary),
              const SizedBox(height: AppSpacing.lg),
              Text(
                title,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                '屏幕标识: $screenName\n待 T03 任务包实现具体页面',
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

final List<RouteBase> projectsRoutes = [
  GoRoute(
    path: '/projects/switch',
    name: 'project-switch',
    builder: (context, state) => const ProjectsPlaceholderScreen(
      screenName: 'project-switch',
      title: '切换项目',
    ),
  ),
  GoRoute(
    path: '/projects/create',
    name: 'project-create',
    builder: (context, state) => const ProjectsPlaceholderScreen(
      screenName: 'project-create',
      title: '创建项目',
    ),
  ),
  GoRoute(
    path: '/projects/:id/settings',
    name: 'project-settings',
    builder: (context, state) => ProjectsPlaceholderScreen(
      screenName: 'project-settings',
      title: '项目设置 #${state.pathParameters['id']}',
    ),
  ),
];
