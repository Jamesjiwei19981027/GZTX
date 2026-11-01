import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../../../design/design.dart';

/// 区块小标题（对齐网页版 `text-xs font-semibold text-slate-400 uppercase`）
class EvidenceSectionTitle extends StatelessWidget {
  const EvidenceSectionTitle(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Padding(
      padding: const EdgeInsets.only(
        left: AppSpacing.xs,
        bottom: AppSpacing.sm,
        top: AppSpacing.xs,
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.4,
          color: isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
        ),
      ),
    );
  }
}

/// 提示条类型
enum EvidenceBannerType { info, warning, danger }

/// 页面内提示条：错误、警告、说明统一走这里，保证深色模式可读
class EvidenceBanner extends StatelessWidget {
  const EvidenceBanner({
    super.key,
    required this.message,
    this.type = EvidenceBannerType.info,
    this.icon = 'info',
    this.actionLabel,
    this.onAction,
    this.isBusy = false,
  });

  final String message;
  final EvidenceBannerType type;
  final String? icon;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool isBusy;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final (bg, border, fg) = switch (type) {
      EvidenceBannerType.info => (
          isDark ? const Color(0xFF10263F) : const Color(0xFFEAF2FF),
          isDark ? const Color(0xFF1C3F63) : const Color(0xFFCFE0FA),
          isDark ? const Color(0xFF9EC7FF) : AppColors.primary,
        ),
      EvidenceBannerType.warning => (
          isDark ? const Color(0xFF352A0B) : AppColors.warningLight,
          isDark ? const Color(0xFF5A4712) : const Color(0xFFF5D98B),
          isDark ? const Color(0xFFF3CE7A) : AppColors.warning,
        ),
      EvidenceBannerType.danger => (
          isDark ? const Color(0xFF3B1515) : AppColors.dangerLight,
          isDark ? const Color(0xFF66231F) : const Color(0xFFF0B5AE),
          isDark ? const Color(0xFFFFB4AB) : AppColors.danger,
        ),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(color: border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (isBusy)
            SizedBox(
              width: 16,
              height: 16,
              child: isCupertinoPlatform(context)
                  ? CupertinoActivityIndicator(color: fg, radius: 8)
                  : CircularProgressIndicator(
                      strokeWidth: 2,
                      color: fg,
                      backgroundColor: fg.withValues(alpha: 0.2),
                    ),
            )
          else
            AppIcon(icon ?? 'info', size: 16, color: fg),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              message,
              style: TextStyle(fontSize: 13, height: 1.45, color: fg),
            ),
          ),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(width: AppSpacing.sm),
            GestureDetector(
              onTap: onAction,
              behavior: HitTestBehavior.opaque,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.xs,
                  vertical: 2,
                ),
                child: Text(
                  actionLabel!,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: fg,
                    decoration: TextDecoration.underline,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// 状态徽标
class EvidenceStatusChip extends StatelessWidget {
  const EvidenceStatusChip({
    super.key,
    required this.label,
    this.tone = EvidenceChipTone.neutral,
  });

  final String label;
  final EvidenceChipTone tone;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final (bg, fg) = switch (tone) {
      EvidenceChipTone.success => (
          isDark ? const Color(0xFF0E3A2A) : AppColors.successLight,
          isDark ? const Color(0xFF7FDCA8) : AppColors.success,
        ),
      EvidenceChipTone.warning => (
          isDark ? const Color(0xFF3A2C0C) : AppColors.warningLight,
          isDark ? const Color(0xFFF3CE7A) : AppColors.warning,
        ),
      EvidenceChipTone.danger => (
          isDark ? const Color(0xFF3B1515) : AppColors.dangerLight,
          isDark ? const Color(0xFFFFB4AB) : AppColors.danger,
        ),
      EvidenceChipTone.primary => (
          isDark ? const Color(0xFF122F52) : AppColors.primaryLight,
          isDark ? const Color(0xFF9EC7FF) : AppColors.primary,
        ),
      EvidenceChipTone.neutral => (
          isDark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant,
          isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
        ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: fg),
      ),
    );
  }
}

enum EvidenceChipTone { neutral, primary, success, warning, danger }

/// 文件行：图标 + 名称 + 副标题 + 可选尾部操作
class EvidenceFileTile extends StatelessWidget {
  const EvidenceFileTile({
    super.key,
    required this.name,
    required this.subtitle,
    this.onTap,
    this.onRemove,
    this.removeTooltip = '移除文件',
    this.showChevron = true,
    this.removeEnabled = true,
  });

  final String name;
  final String subtitle;
  final VoidCallback? onTap;
  final VoidCallback? onRemove;
  final String removeTooltip;
  final bool showChevron;
  final bool removeEnabled;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final content = Padding(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      child: Row(
        children: [
          const AppIcon('file', size: 18, color: AppColors.primary),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: isDark
                        ? AppColors.darkTextPrimary
                        : AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark
                        ? AppColors.darkTextTertiary
                        : AppColors.textTertiary,
                  ),
                ),
              ],
            ),
          ),
          if (onRemove != null)
            Semantics(
              button: true,
              label: removeTooltip,
              child: GestureDetector(
                onTap: removeEnabled ? onRemove : null,
                behavior: HitTestBehavior.opaque,
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.sm),
                  child: AppIcon(
                    'close',
                    size: 16,
                    color: removeEnabled
                        ? (isDark
                            ? AppColors.darkTextTertiary
                            : AppColors.textTertiary)
                        : AppColors.textDisabled,
                  ),
                ),
              ),
            )
          else if (showChevron && onTap != null)
            Icon(
              isCupertinoPlatform(context)
                  ? CupertinoIcons.chevron_forward
                  : Icons.chevron_right,
              size: 18,
              color: isDark
                  ? AppColors.darkTextTertiary
                  : AppColors.textTertiary,
            ),
        ],
      ),
    );

    if (onTap == null) return content;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: content,
    );
  }
}

/// 卡片容器（白底 + 细边框 + 圆角，双端一致）
class EvidenceCard extends StatelessWidget {
  const EvidenceCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.lg),
  });

  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.border,
        ),
      ),
      child: child,
    );
  }
}

/// 卡片内分隔线
class EvidenceDivider extends StatelessWidget {
  const EvidenceDivider({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Container(
      height: 0.5,
      color: isDark ? AppColors.darkBorder : AppColors.border,
    );
  }
}

/// 加载中状态（带中文说明）
class EvidenceLoadingState extends StatelessWidget {
  const EvidenceLoadingState({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xxxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppLoading(size: 28),
            const SizedBox(height: AppSpacing.lg),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                color: isDark
                    ? AppColors.darkTextSecondary
                    : AppColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
