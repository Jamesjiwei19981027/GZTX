import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../tokens/colors.dart';
import '../tokens/spacing.dart';
import 'adaptive_base.dart';
import 'app_button.dart';

/// 加载失败/异常重试组件
class AppErrorState extends StatelessWidget {
  const AppErrorState({
    super.key,
    this.title = '加载失败',
    this.message = '网络或服务异常，请稍后重试',
    this.onRetry,
    this.retryLabel = '重试',
    this.isForbidden = false,
  });

  final String title;
  final String message;
  final VoidCallback? onRetry;
  final String retryLabel;
  final bool isForbidden;

  @override
  Widget build(BuildContext context) {
    final isIos = isCupertinoPlatform(context);

    final icon = isForbidden
        ? (isIos ? CupertinoIcons.lock_shield : Icons.lock_outline)
        : (isIos
            ? CupertinoIcons.exclamationmark_circle
            : Icons.error_outline_rounded);

    final iconColor = isForbidden ? AppColors.warning : AppColors.danger;

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.xxxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 54, color: iconColor),
            const SizedBox(height: AppSpacing.lg),
            Text(
              isForbidden ? '暂无访问权限' : title,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: isDarkMode(context)
                    ? AppColors.darkTextPrimary
                    : AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              isForbidden ? '您暂未获得此页面或资源的访问授权，请联系管理员。' : message,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                color: isDarkMode(context)
                    ? AppColors.darkTextSecondary
                    : AppColors.textSecondary,
                height: 1.4,
              ),
            ),
            if (onRetry != null && !isForbidden) ...[
              const SizedBox(height: AppSpacing.xl),
              AppButton(
                label: retryLabel,
                onPressed: onRetry,
                icon: Icon(
                  isIos ? CupertinoIcons.refresh : Icons.refresh,
                  size: 16,
                  color: Colors.white,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
