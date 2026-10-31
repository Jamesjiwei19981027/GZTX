import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../design/design.dart';

/// T05 材料与项目知识库路由占位
class EvidencePlaceholderScreen extends StatelessWidget {
  const EvidencePlaceholderScreen({
    super.key,
    this.screenName = 'axis-evidence-submit',
    this.title = '材料与知识库 (T05)',
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
              const AppIcon('file', size: 48, color: AppColors.primary),
              const SizedBox(height: AppSpacing.lg),
              Text(
                title,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                '屏幕标识: $screenName\n待 T05 任务包实现具体页面',
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

final List<RouteBase> evidenceRoutes = [
  GoRoute(
    path: '/evidence/submit',
    name: 'axis-evidence-submit',
    builder: (context, state) => const EvidencePlaceholderScreen(
      screenName: 'axis-evidence-submit',
      title: '材料提交',
    ),
  ),
  GoRoute(
    path: '/evidence/:id',
    name: 'axis-evidence-detail',
    builder: (context, state) => EvidencePlaceholderScreen(
      screenName: 'axis-evidence-detail',
      title: '材料详情 #${state.pathParameters['id']}',
    ),
  ),
];
