import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../design/design.dart';

/// T01 登录注册模块路由占位
class AuthPlaceholderScreen extends StatelessWidget {
  const AuthPlaceholderScreen({
    super.key,
    this.screenName = 'auth-login',
    this.title = '登录 / 注册 (T01)',
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
              const AppIcon('lock', size: 48, color: AppColors.primary),
              const SizedBox(height: AppSpacing.lg),
              Text(
                title,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                '屏幕标识: $screenName\n待 T01 任务包实现具体页面',
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

final List<RouteBase> authRoutes = [
  GoRoute(
    path: '/login',
    name: 'auth-login',
    builder: (context, state) => const AuthPlaceholderScreen(
      screenName: 'auth-login',
      title: '登录',
    ),
  ),
  GoRoute(
    path: '/register',
    name: 'auth-register',
    builder: (context, state) => const AuthPlaceholderScreen(
      screenName: 'auth-register',
      title: '注册',
    ),
  ),
  GoRoute(
    path: '/verify',
    name: 'auth-verify',
    builder: (context, state) => const AuthPlaceholderScreen(
      screenName: 'auth-verify',
      title: '手机/邮箱验证',
    ),
  ),
];
