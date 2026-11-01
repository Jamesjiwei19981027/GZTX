import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../../../design/design.dart';

/// 无权限说明：保留后端返回的原始原因，不只显示一句泛化的“暂无权限”。
class PermissionNotice extends StatelessWidget {
  const PermissionNotice({
    super.key,
    required this.message,
    this.title = '暂无访问权限',
    this.hint = '如需开通，请联系项目管理人员。',
    this.onRetry,
  });

  final String message;
  final String title;
  final String hint;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final isIos = isCupertinoPlatform(context);
    final isDark = isDarkMode(context);
    final iconColor = AppColors.warning;

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isIos ? CupertinoIcons.lock_shield : Icons.lock_outline,
              size: 52,
              color: iconColor,
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              title,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color:
                    isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                height: 1.5,
                color: isDark
                    ? AppColors.darkTextSecondary
                    : AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              hint,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 12,
                height: 1.5,
                color: AppColors.textTertiary,
              ),
            ),
            if (onRetry != null) ...[
              const SizedBox(height: AppSpacing.xl),
              AppButton(label: '重新检查权限', onPressed: onRetry),
            ],
          ],
        ),
      ),
    );
  }
}
