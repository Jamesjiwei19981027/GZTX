/// T03 项目与团队：页面内复用的展示型小组件
library;

import 'package:flutter/material.dart';
import 'package:worktodo_app/design/design.dart';

import '../models/project_models.dart';
import '../../me/widgets/me_common.dart' show meAbsoluteUrl;

/// 项目首字头像（网页版为蓝色浅底 + 项目名首字）
class ProjectAvatar extends StatelessWidget {
  const ProjectAvatar({super.key, required this.text, this.size = 48});

  final String text;
  final double size;

  @override
  Widget build(BuildContext context) {
    final initial = text.isEmpty ? '?' : String.fromCharCode(text.runes.first);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(size / 4),
      ),
      child: Text(
        initial,
        style: TextStyle(
          fontSize: size / 2.6,
          fontWeight: FontWeight.w500,
          color: AppColors.primary,
        ),
      ),
    );
  }
}

/// 成员头像：有头像地址时加载图片，失败或缺失时回退首字
class MemberAvatar extends StatelessWidget {
  const MemberAvatar({super.key, required this.member, this.size = 40});

  final ProjectMember member;
  final double size;

  @override
  Widget build(BuildContext context) {
    final url = meAbsoluteUrl(member.avatarUrl);
    return ClipOval(
      child: SizedBox(
        width: size,
        height: size,
        child: url != null
            ? Image.network(
                url,
                width: size,
                height: size,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => _fallback(),
              )
            : _fallback(),
      ),
    );
  }

  Widget _fallback() {
    return Container(
      color: AppColors.primary.withValues(alpha: 0.10),
      alignment: Alignment.center,
      child: Text(
        member.initial,
        style: TextStyle(
          fontSize: size / 2.8,
          fontWeight: FontWeight.w500,
          color: AppColors.primary,
        ),
      ),
    );
  }
}

/// 在线状态圆点
class PresenceDot extends StatelessWidget {
  const PresenceDot({super.key, this.status = 'offline', this.size = 12});

  final String status;
  final double size;

  @override
  Widget build(BuildContext context) {
    final isOnline = status == 'online';
    final isBusy = status == 'busy';
    final color = isOnline
        ? AppColors.success
        : isBusy
            ? AppColors.warning
            : (isDarkMode(context)
                ? AppColors.darkBorder
                : AppColors.textDisabled);
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(
          color: isDarkMode(context) ? AppColors.darkSurface : Colors.white,
          width: 2,
        ),
      ),
    );
  }
}

/// 在线状态中文标签
String presenceLabel(String status) {
  switch (status) {
    case 'online':
      return '在线';
    case 'busy':
      return '忙碌';
    default:
      return '离线';
  }
}

/// 状态胶囊标签（项目状态、成员角色、任务状态共用）
class ProjectChip extends StatelessWidget {
  const ProjectChip({
    super.key,
    required this.label,
    this.highlighted = false,
    this.tone = ProjectChipTone.neutral,
  });

  final String label;
  final bool highlighted;
  final ProjectChipTone tone;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final Color background;
    final Color foreground;
    switch (tone) {
      case ProjectChipTone.success:
        background = isDark
            ? AppColors.success.withValues(alpha: 0.20)
            : AppColors.successLight;
        foreground = isDark ? AppColors.successLight : AppColors.success;
      case ProjectChipTone.warning:
        background = isDark
            ? AppColors.warning.withValues(alpha: 0.20)
            : AppColors.warningLight;
        foreground = isDark ? AppColors.warningLight : AppColors.warning;
      case ProjectChipTone.primary:
        background = AppColors.primary.withValues(alpha: isDark ? 0.24 : 0.10);
        foreground = isDark ? AppColors.primaryLight : AppColors.primary;
      case ProjectChipTone.neutral:
        background =
            isDark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant;
        foreground =
            isDark ? AppColors.darkTextSecondary : AppColors.textSecondary;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: highlighted ? FontWeight.w500 : FontWeight.w500,
          color: foreground,
        ),
      ),
    );
  }
}

enum ProjectChipTone { primary, success, warning, neutral }

/// 行内提示横幅（对齐网页版提示条）
class InfoBanner extends StatelessWidget {
  const InfoBanner({
    super.key,
    required this.message,
    this.tone = InfoBannerTone.info,
    this.icon = 'info',
  });

  final String message;
  final InfoBannerTone tone;
  final String icon;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final Color background;
    final Color foreground;
    switch (tone) {
      case InfoBannerTone.warning:
        background = isDark
            ? AppColors.warning.withValues(alpha: 0.16)
            : AppColors.warningLight;
        foreground = isDark ? AppColors.warningLight : const Color(0xFF92400E);
      case InfoBannerTone.danger:
        background = isDark
            ? AppColors.danger.withValues(alpha: 0.18)
            : AppColors.dangerLight;
        foreground = isDark ? AppColors.dangerLight : AppColors.danger;
      case InfoBannerTone.success:
        background = isDark
            ? AppColors.success.withValues(alpha: 0.20)
            : AppColors.successLight;
        foreground = isDark ? AppColors.successLight : AppColors.success;
      case InfoBannerTone.info:
        background = AppColors.primary.withValues(alpha: isDark ? 0.22 : 0.08);
        foreground = isDark ? AppColors.primaryLight : AppColors.primary;
    }
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm + 2,
      ),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: AppIcon(icon, size: 16, color: foreground),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              message,
              style: TextStyle(fontSize: 12, height: 1.45, color: foreground),
            ),
          ),
        ],
      ),
    );
  }
}

enum InfoBannerTone { info, warning, danger, success }

/// 白底卡片容器
class SectionCard extends StatelessWidget {
  const SectionCard({
    super.key,
    this.title,
    this.trailing,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.lg),
  });

  final String? title;
  final Widget? trailing;
  final Widget child;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : Colors.white,
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) ...[
            Row(
              children: [
                Expanded(
                  child: Text(
                    title!,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: isDark
                          ? AppColors.darkTextPrimary
                          : AppColors.textPrimary,
                    ),
                  ),
                ),
                if (trailing != null) trailing!,
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
          child,
        ],
      ),
    );
  }
}

/// 文案按钮（管理任务 / 管理看板等轻量入口）
class InlineTextButton extends StatelessWidget {
  const InlineTextButton({
    super.key,
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        child: Text(
          label,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppColors.primary,
          ),
        ),
      ),
    );
  }
}

