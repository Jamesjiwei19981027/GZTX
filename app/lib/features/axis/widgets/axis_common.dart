import 'package:flutter/material.dart';

import '../../../design/design.dart';

/// 人轴页面通用小组件，保证六页视觉一致。
class AxisCard extends StatelessWidget {
  const AxisCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.lg),
    this.color,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    // 用 Material 承载圆角与描边，避免 ListTile 被 DecoratedBox 挡住水波纹
    // （Flutter 对“ListTile 外层有带背景的 DecoratedBox”会直接断言失败）。
    return Material(
      color: color ?? (isDark ? AppColors.darkSurface : AppColors.surface),
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        side: BorderSide(
          color: isDark ? AppColors.darkBorder : AppColors.border,
        ),
      ),
      child: Padding(padding: padding, child: child),
    );
  }
}

class AxisSectionTitle extends StatelessWidget {
  const AxisSectionTitle(this.text, {super.key, this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.lg,
        AppSpacing.sm,
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: isDarkMode(context)
                    ? AppColors.darkTextSecondary
                    : AppColors.textSecondary,
              ),
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class AxisInfoBanner extends StatelessWidget {
  const AxisInfoBanner({
    super.key,
    required this.text,
    this.isWarning = false,
    this.icon,
  });

  final String text;
  final bool isWarning;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final color = isWarning ? AppColors.warning : AppColors.primary;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            icon ?? (isWarning ? Icons.warning_amber_rounded : Icons.info_outline),
            size: 17,
            color: color,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              text,
              style: TextStyle(fontSize: 12, height: 1.5, color: color),
            ),
          ),
        ],
      ),
    );
  }
}

/// 行内错误提示：断网、登录过期、后端拒绝都显示在这里，不静默吞掉。
class AxisErrorBanner extends StatelessWidget {
  const AxisErrorBanner({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.danger.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(color: AppColors.danger.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline, size: 17, color: AppColors.danger),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(fontSize: 12, color: AppColors.danger),
            ),
          ),
          if (onRetry != null)
            TextButton(
              onPressed: onRetry,
              child: const Text('重试', style: TextStyle(fontSize: 12)),
            ),
        ],
      ),
    );
  }
}

class AxisPersonAvatar extends StatelessWidget {
  const AxisPersonAvatar({
    super.key,
    required this.name,
    this.size = 40,
    this.highlight = false,
  });

  final String name;
  final double size;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final runes = name.runes;
    final initial = runes.isEmpty ? '?' : String.fromCharCode(runes.first);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: highlight ? AppColors.primary : AppColors.primaryLight,
        shape: BoxShape.circle,
      ),
      child: Text(
        initial,
        style: TextStyle(
          fontSize: size * 0.4,
          fontWeight: FontWeight.w700,
          color: highlight ? Colors.white : AppColors.primary,
        ),
      ),
    );
  }
}

class AxisStatusChip extends StatelessWidget {
  const AxisStatusChip({
    super.key,
    required this.label,
    this.color = AppColors.primary,
  });

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}

/// 可换行的全宽主操作按钮。
///
/// 底座的 [AppButton] 内部是单行 Row，超长中文在系统字号 200% 时会横向溢出；
/// 人轴里“查看 AI 汇报与材料对照”这类长文案改用本组件，允许换成两行。
class AxisWideAction extends StatelessWidget {
  const AxisWideAction({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.variant = AppButtonVariant.primary,
    this.isLoading = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final Widget? icon;
  final AppButtonVariant variant;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final Color background;
    final Color foreground;
    switch (variant) {
      case AppButtonVariant.primary:
        background = AppColors.primary;
        foreground = Colors.white;
      case AppButtonVariant.danger:
        background = AppColors.danger;
        foreground = Colors.white;
      case AppButtonVariant.secondary:
        background = isDark ? AppColors.darkSurface : AppColors.surface;
        foreground = isDark ? AppColors.darkTextPrimary : AppColors.textPrimary;
    }
    final enabled = onPressed != null && !isLoading;
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: Material(
        color: background,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          side: variant == AppButtonVariant.secondary
              ? BorderSide(
                  color: isDark ? AppColors.darkBorder : AppColors.border,
                )
              : BorderSide.none,
        ),
        child: InkWell(
          onTap: enabled ? onPressed : null,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 46),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.lg,
                vertical: AppSpacing.md,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (isLoading)
                    SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: foreground,
                      ),
                    )
                  else if (icon != null)
                    IconTheme(
                      data: IconThemeData(color: foreground, size: 16),
                      child: icon!,
                    ),
                  if (isLoading || icon != null)
                    const SizedBox(width: AppSpacing.sm),
                  Flexible(
                    child: Text(
                      label,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: foreground,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// 统一的单选列表底部面板。
Future<T?> showAxisPickerSheet<T>({
  required BuildContext context,
  required String title,
  required List<T> items,
  required String Function(T item) labelOf,
  T? selected,
  String? emptyLabel,
}) {
  return showAppBottomSheet<T>(
    context: context,
    title: title,
    builder: (ctx) {
      final isDark = isDarkMode(ctx);
      return SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 420),
          child: ListView(
            shrinkWrap: true,
            children: [
              for (final item in items)
                ListTile(
                  title: Text(labelOf(item)),
                  trailing: selected == item
                      ? const Icon(Icons.check, color: AppColors.primary)
                      : null,
                  onTap: () => Navigator.of(ctx).pop(item),
                ),
              if (items.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.xxl),
                  child: Text(
                    emptyLabel ?? '暂无可选项',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 13,
                      color: isDark
                          ? AppColors.darkTextTertiary
                          : AppColors.textTertiary,
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
    },
  );
}
