import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../design/design.dart';

/// T04 人轴模块路由占位
class AxisPlaceholderScreen extends StatelessWidget {
  const AxisPlaceholderScreen({
    super.key,
    this.screenName = 'axis-root',
    this.title = '人轴',
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
              const AppIcon('axis', size: 48, color: AppColors.primary),
              const SizedBox(height: AppSpacing.lg),
              Text(
                '$title (T04)',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                '屏幕标识: $screenName\n待 T04 任务包实现具体页面',
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

final List<RouteBase> axisRoutes = [
  GoRoute(
    path: '/axis',
    name: 'axis-root',
    builder: (context, state) => const AxisPlaceholderScreen(
      screenName: 'axis-root',
      title: '人轴',
    ),
    routes: [
      GoRoute(
        path: 'node/:id',
        name: 'axis-node-detail',
        builder: (context, state) => AxisPlaceholderScreen(
          screenName: 'axis-node-detail',
          title: '节点详情 #${state.pathParameters['id']}',
        ),
      ),
      GoRoute(
        path: 'person/:id',
        name: 'axis-person-detail',
        builder: (context, state) => AxisPlaceholderScreen(
          screenName: 'axis-person-detail',
          title: '人员主页 #${state.pathParameters['id']}',
        ),
      ),
      GoRoute(
        path: 'progress',
        name: 'axis-progress',
        builder: (context, state) => const AxisPlaceholderScreen(
          screenName: 'axis-progress',
          title: '人轴推进看板',
        ),
      ),
    ],
  ),
];
