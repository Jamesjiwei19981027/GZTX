import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../design/design.dart';

/// T02 工作模块路由占位
class WorkPlaceholderScreen extends StatelessWidget {
  const WorkPlaceholderScreen({
    super.key,
    this.screenName = 'work-root',
    this.title = '工作',
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
              const AppIcon('work', size: 48, color: AppColors.primary),
              const SizedBox(height: AppSpacing.lg),
              Text(
                '$title (T02)',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                '屏幕标识: $screenName\n待 T02 任务包实现具体页面',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 14, color: AppColors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.xl),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.center,
                children: [
                  AppButton(
                    label: '前往任务列表',
                    size: AppButtonSize.sm,
                    variant: AppButtonVariant.secondary,
                    onPressed: () => context.push('/work/tasks'),
                  ),
                  AppButton(
                    label: '前往看板',
                    size: AppButtonSize.sm,
                    variant: AppButtonVariant.secondary,
                    onPressed: () => context.push('/work/kanban'),
                  ),
                  AppButton(
                    label: '查看组件展示页',
                    size: AppButtonSize.sm,
                    onPressed: () => context.push('/gallery'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

final List<RouteBase> workRoutes = [
  GoRoute(
    path: '/work',
    name: 'work-root',
    builder: (context, state) => const WorkPlaceholderScreen(
      screenName: 'work-root',
      title: '工作',
    ),
    routes: [
      GoRoute(
        path: 'tasks',
        name: 'work-tasks',
        builder: (context, state) => const WorkPlaceholderScreen(
          screenName: 'work-tasks',
          title: '任务列表',
        ),
      ),
      GoRoute(
        path: 'kanban',
        name: 'work-kanban',
        builder: (context, state) => const WorkPlaceholderScreen(
          screenName: 'work-kanban',
          title: '工作看板',
        ),
      ),
      GoRoute(
        path: 'calendar',
        name: 'work-calendar',
        builder: (context, state) => const WorkPlaceholderScreen(
          screenName: 'work-calendar',
          title: '日历视图',
        ),
      ),
      GoRoute(
        path: 'statistics',
        name: 'work-statistics',
        builder: (context, state) => const WorkPlaceholderScreen(
          screenName: 'work-statistics',
          title: '任务统计',
        ),
      ),
      GoRoute(
        path: 'trash',
        name: 'work-trash',
        builder: (context, state) => const WorkPlaceholderScreen(
          screenName: 'work-trash',
          title: '回收站',
        ),
      ),
      GoRoute(
        path: 'task/:id',
        name: 'work-task-detail',
        builder: (context, state) => WorkPlaceholderScreen(
          screenName: 'work-task-detail',
          title: '任务详情 #${state.pathParameters['id']}',
        ),
      ),
      GoRoute(
        path: 'search',
        name: 'work-search',
        builder: (context, state) => const WorkPlaceholderScreen(
          screenName: 'work-search',
          title: '全局搜索',
        ),
      ),
    ],
  ),
];
