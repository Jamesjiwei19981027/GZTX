import 'package:flutter/material.dart';

import '../../../design/design.dart';

/// 登录注册页的提示条类型
enum AuthBannerType { error, hint, warning }

/// 表单错误 / 操作提示条
///
/// 对照网页版 `MobileAuthScreens.tsx` 的 error / hint / preservedContextHint 三种横幅，
/// 统一使用品牌色与危险色，深色模式可读。
class AuthMessageBanner extends StatelessWidget {
  const AuthMessageBanner({
    super.key,
    required this.message,
    this.type = AuthBannerType.error,
  });

  final String message;
  final AuthBannerType type;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final (Color accent, String iconName) = switch (type) {
      AuthBannerType.error => (AppColors.danger, 'alert'),
      AuthBannerType.hint => (AppColors.primary, 'info'),
      AuthBannerType.warning => (AppColors.warning, 'warning'),
    };

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm + 2,
      ),
      decoration: BoxDecoration(
        color: isDark
            ? accent.withValues(alpha: 0.16)
            : accent.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(color: accent.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppIcon(iconName, size: 18, color: accent),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                fontSize: 13,
                height: 1.4,
                color:
                    isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
