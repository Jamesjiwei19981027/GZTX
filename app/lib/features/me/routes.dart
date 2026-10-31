import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../design/design.dart';

/// T09 我的与管理模块路由占位
class MePlaceholderScreen extends StatelessWidget {
  const MePlaceholderScreen({
    super.key,
    this.screenName = 'me-root',
    this.title = '我的',
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
              const AppIcon('me', size: 48, color: AppColors.primary),
              const SizedBox(height: AppSpacing.lg),
              Text(
                '$title (T09)',
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                '屏幕标识: $screenName\n待 T09 任务包实现具体页面',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 14, color: AppColors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.xl),
              AppButton(
                label: '查看组件展示页',
                size: AppButtonSize.sm,
                onPressed: () => context.push('/gallery'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

final List<RouteBase> meRoutes = [
  GoRoute(
    path: '/me',
    name: 'me-root',
    builder: (context, state) => const MePlaceholderScreen(
      screenName: 'me-root',
      title: '我的',
    ),
    routes: [
      GoRoute(
        path: 'profile',
        name: 'me-profile',
        builder: (context, state) => const MePlaceholderScreen(
          screenName: 'me-profile',
          title: '个人资料',
        ),
      ),
      GoRoute(
        path: 'security',
        name: 'me-security',
        builder: (context, state) => const MePlaceholderScreen(
          screenName: 'me-security',
          title: '账号与安全',
        ),
      ),
      GoRoute(
        path: 'appearance',
        name: 'me-appearance',
        builder: (context, state) => const MePlaceholderScreen(
          screenName: 'me-appearance',
          title: '外观与主题',
        ),
      ),
      GoRoute(
        path: 'notifications',
        name: 'me-notifications',
        builder: (context, state) => const MePlaceholderScreen(
          screenName: 'me-notifications',
          title: '通知偏好设置',
        ),
      ),
      GoRoute(
        path: 'about',
        name: 'me-about',
        builder: (context, state) => const MePlaceholderScreen(
          screenName: 'me-about',
          title: '关于应用',
        ),
      ),
    ],
  ),
];
