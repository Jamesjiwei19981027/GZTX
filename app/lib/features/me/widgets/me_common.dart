import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../../../core/api/api_config.dart';
import '../../../core/errors/app_error.dart';
import '../../../design/design.dart';

/// 统一的异常文案：断网 / 登录过期 / 服务端错误都给出可见中文提示
String meErrorMessage(Object error) {
  if (error is NetworkException) {
    return '网络连接异常或请求超时，请检查网络后重试';
  }
  if (error is AuthException) {
    return '登录已过期，请重新登录';
  }
  if (error is AppException) {
    return error.message;
  }
  return '操作失败，请稍后重试';
}

/// 断网类异常判定（用于显示可重试的网络状态）
bool meIsNetworkError(Object error) => error is NetworkException;

/// 头像完整地址：后端返回相对路径（如 /api/v1/users/11/avatar），需补基地址
String? meAbsoluteUrl(String? url) {
  if (url == null || url.trim().isEmpty) return null;
  final raw = url.trim();
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  final base = ApiConfig.baseUrl;
  final origin = base.endsWith('/api/v1')
      ? base.substring(0, base.length - '/api/v1'.length)
      : base;
  return raw.startsWith('/') ? '$origin$raw' : '$origin/$raw';
}

/// 提示条语气
enum MeTone { neutral, primary, success, warning, danger }

/// 轻量状态徽标（绿色=已验证/正常，灰色=未验证，红色=失败）
class MeBadge extends StatelessWidget {
  const MeBadge({super.key, required this.label, this.tone = MeTone.neutral});

  final String label;
  final MeTone tone;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final (bg, fg) = switch (tone) {
      MeTone.success => (
          isDark ? const Color(0xFF10372A) : const Color(0xFFC4EED0),
          isDark ? const Color(0xFF8FE3B8) : const Color(0xFF006C49),
        ),
      MeTone.warning => (
          isDark ? const Color(0xFF3D2A05) : const Color(0xFFFEF3C7),
          isDark ? const Color(0xFFF5C56B) : const Color(0xFF8A5300),
        ),
      MeTone.danger => (
          isDark ? const Color(0xFF3D1414) : const Color(0xFFFFDAD6),
          isDark ? const Color(0xFFFFB4AB) : const Color(0xFFBA1A1A),
        ),
      MeTone.primary => (
          isDark ? const Color(0xFF11294A) : AppColors.primaryLight,
          isDark ? const Color(0xFF9FC7FF) : AppColors.primary,
        ),
      MeTone.neutral => (
          isDark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant,
          isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
        ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
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

/// 页面内提示条（成功 / 失败 / 说明）
class MeBanner extends StatelessWidget {
  const MeBanner({
    super.key,
    required this.message,
    this.tone = MeTone.neutral,
    this.icon,
    this.onRetry,
    this.retryLabel = '重试',
  });

  final String message;
  final MeTone tone;
  final String? icon;
  final VoidCallback? onRetry;
  final String retryLabel;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final (bg, fg, defaultIcon) = switch (tone) {
      MeTone.success => (
          isDark ? const Color(0xFF10372A) : const Color(0xFFE9F7EF),
          isDark ? const Color(0xFF8FE3B8) : AppColors.success,
          'check-circle',
        ),
      MeTone.danger => (
          isDark ? const Color(0xFF3D1414) : const Color(0xFFFFF1F0),
          isDark ? const Color(0xFFFFB4AB) : AppColors.danger,
          'alert',
        ),
      MeTone.warning => (
          isDark ? const Color(0xFF3D2A05) : const Color(0xFFFFF8E6),
          isDark ? const Color(0xFFF5C56B) : const Color(0xFF8A5300),
          'warning',
        ),
      MeTone.primary => (
          isDark ? const Color(0xFF11294A) : const Color(0xFFEAF1FD),
          isDark ? const Color(0xFF9FC7FF) : AppColors.primary,
          'info',
        ),
      MeTone.neutral => (
          isDark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant,
          isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
          'info',
        ),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppIcon(icon ?? defaultIcon, size: 16, color: fg),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              message,
              style: TextStyle(fontSize: 12.5, height: 1.4, color: fg),
            ),
          ),
          if (onRetry != null) ...[
            const SizedBox(width: AppSpacing.sm),
            GestureDetector(
              onTap: onRetry,
              child: Text(
                retryLabel,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: fg,
                  decoration: TextDecoration.underline,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// 通用卡片：标题 / 说明 + 内容
class MeCard extends StatelessWidget {
  const MeCard({
    super.key,
    this.title,
    this.footer,
    this.trailing,
    required this.children,
    this.padding = const EdgeInsets.all(AppSpacing.cardPadding),
    this.contentPadding,
  });

  final String? title;
  final String? footer;
  final Widget? trailing;
  final List<Widget> children;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? contentPadding;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : AppColors.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null || trailing != null)
            Padding(
              padding: EdgeInsets.fromLTRB(
                padding.horizontal / 2,
                AppSpacing.md,
                padding.horizontal / 2,
                0,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      title ?? '',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: isDark
                            ? AppColors.darkTextSecondary
                            : AppColors.textSecondary,
                      ),
                    ),
                  ),
                  if (trailing != null) trailing!,
                ],
              ),
            ),
          Padding(
            padding: contentPadding ?? padding,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: children,
            ),
          ),
          if (footer != null)
            Padding(
              padding: EdgeInsets.fromLTRB(
                padding.horizontal / 2,
                0,
                padding.horizontal / 2,
                AppSpacing.md,
              ),
              child: Text(
                footer!,
                style: TextStyle(
                  fontSize: 11.5,
                  height: 1.4,
                  color: isDark
                      ? AppColors.darkTextTertiary
                      : AppColors.textTertiary,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// 只读信息行（左标签 + 右值）
class MeInfoRow extends StatelessWidget {
  const MeInfoRow({
    super.key,
    required this.label,
    required this.value,
    this.valueWidget,
    this.showDivider = true,
  });

  final String label;
  final String value;
  final Widget? valueWidget;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: showDivider
          ? BoxDecoration(
              border: Border(
                bottom: BorderSide(
                  color: isDark ? AppColors.darkBorder : AppColors.borderLight,
                  width: 0.5,
                ),
              ),
            )
          : null,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 3,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                color: isDark
                    ? AppColors.darkTextSecondary
                    : AppColors.textSecondary,
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            flex: 5,
            child: Align(
              alignment: Alignment.centerRight,
              child: valueWidget ??
                  Text(
                    value,
                    textAlign: TextAlign.right,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: isDark
                          ? AppColors.darkTextPrimary
                          : AppColors.textPrimary,
                    ),
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

/// 输入项标签（含必填星号与辅助说明）
class MeFieldLabel extends StatelessWidget {
  const MeFieldLabel({
    super.key,
    required this.label,
    this.required = false,
    this.helper,
  });

  final String label;
  final bool required;
  final String? helper;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Flexible(
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: isDark
                        ? AppColors.darkTextSecondary
                        : AppColors.textSecondary,
                  ),
                ),
              ),
              if (required)
                const Text(
                  ' *',
                  style: TextStyle(fontSize: 13, color: AppColors.danger),
                ),
            ],
          ),
          if (helper != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                helper!,
                style: TextStyle(
                  fontSize: 11.5,
                  color: isDark
                      ? AppColors.darkTextTertiary
                      : AppColors.textTertiary,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// 头像展示：远程图 + 首字母兜底（断网时不留白块）
class MeAvatar extends StatelessWidget {
  const MeAvatar({
    super.key,
    this.url,
    required this.name,
    this.size = 64,
  });

  final String? url;
  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final absolute = meAbsoluteUrl(url);
    final fallback = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF13305A) : AppColors.primaryLight,
        shape: BoxShape.circle,
      ),
      child: Text(
        name.isEmpty ? '用' : name.characters.first.toUpperCase(),
        style: TextStyle(
          fontSize: size * 0.38,
          fontWeight: FontWeight.w500,
          color: isDark ? const Color(0xFF9FC7FF) : AppColors.primary,
        ),
      ),
    );

    if (absolute == null) return fallback;

    return ClipOval(
      child: Image.network(
        absolute,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stack) => fallback,
        loadingBuilder: (context, child, progress) =>
            progress == null ? child : fallback,
      ),
    );
  }
}

/// 页面主体滚动容器
class MePageBody extends StatelessWidget {
  const MePageBody({
    super.key,
    required this.children,
    this.padding = const EdgeInsets.fromLTRB(
      AppSpacing.pageHorizontal,
      AppSpacing.md,
      AppSpacing.pageHorizontal,
      AppSpacing.xxxl,
    ),
    this.controller,
  });

  final List<Widget> children;
  final EdgeInsetsGeometry padding;
  final ScrollController? controller;

  @override
  Widget build(BuildContext context) {
    return ListView(
      controller: controller,
      padding: padding,
      children: children,
    );
  }
}

/// 页面级加载中占位
class MeLoadingState extends StatelessWidget {
  const MeLoadingState({super.key, this.message = '正在加载…'});

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
            const AppLoading(size: 26),
            const SizedBox(height: AppSpacing.md),
            Text(
              message,
              style: TextStyle(
                fontSize: 13,
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

/// 页面级加载失败占位（可重试 / 无权限）
///
/// 底座 `AppErrorState` 的正文与标题颜色写死为浅色值，深色模式下不可读；
/// 本模块自建同样式但跟随亮度的错误态（底座改进已写入共享改动申请）。
class MeErrorState extends StatelessWidget {
  const MeErrorState({
    super.key,
    required this.message,
    this.onRetry,
    this.isForbidden = false,
    this.title = '加载失败',
  });

  final String message;
  final VoidCallback? onRetry;
  final bool isForbidden;
  final String title;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final isIos = isCupertinoPlatform(context);
    final icon = isForbidden
        ? (isIos ? CupertinoIcons.lock_shield : Icons.lock_outline)
        : (isIos
            ? CupertinoIcons.exclamationmark_circle
            : Icons.error_outline_rounded);
    final titleColor =
        isDark ? AppColors.darkTextPrimary : AppColors.textPrimary;
    final bodyColor =
        isDark ? AppColors.darkTextSecondary : AppColors.textSecondary;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xxxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 52,
              color: isForbidden ? AppColors.warning : AppColors.danger,
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              isForbidden ? '暂无访问权限' : title,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w600,
                color: titleColor,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              message.isEmpty
                  ? (isForbidden ? '您暂未获得此页面的访问授权，请联系企业管理员。' : '')
                  : message,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13.5, height: 1.45, color: bodyColor),
            ),
            if (onRetry != null && !isForbidden) ...[
              const SizedBox(height: AppSpacing.xl),
              AppButton(label: '重新加载', onPressed: onRetry),
            ],
          ],
        ),
      ),
    );
  }
}

/// 顶部小标题（用于页面内的分组）
class MeSectionTitle extends StatelessWidget {
  const MeSectionTitle({super.key, required this.text, this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.lg, bottom: AppSpacing.sm),
      child: Row(
        children: [
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: isDark
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

/// 图标 + 文案的次级按钮（用于卡片内的轻操作）
class MeInlineButton extends StatelessWidget {
  const MeInlineButton({
    super.key,
    required this.label,
    this.icon,
    this.onPressed,
    this.tone = MeTone.primary,
    this.isLoading = false,
  });

  final String label;
  final String? icon;
  final VoidCallback? onPressed;
  final MeTone tone;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !isLoading;
    final (bg, fg) = switch (tone) {
      MeTone.danger => (AppColors.danger, Colors.white),
      MeTone.success => (AppColors.success, Colors.white),
      _ => (AppColors.primary, Colors.white),
    };
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: GestureDetector(
        onTap: enabled ? onPressed : null,
        behavior: HitTestBehavior.opaque,
        child: Container(
          constraints: const BoxConstraints(minHeight: 32),
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: 6,
          ),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (isLoading) ...[
                SizedBox(
                  width: 12,
                  height: 12,
                  child: CircularProgressIndicator(strokeWidth: 1.6, color: fg),
                ),
                const SizedBox(width: 6),
              ] else if (icon != null) ...[
                AppIcon(icon!, size: 14, color: fg),
                const SizedBox(width: 4),
              ],
              Text(
                label,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: fg,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 危险操作确认文案常量（注销账号多重确认共用）
const String meDeleteKeyword = 'DELETE';

/// 卡片内的单行可点击项（带图标、标题与说明）
class MeListRow extends StatelessWidget {
  const MeListRow({
    super.key,
    required this.title,
    this.subtitle,
    this.icon,
    this.iconColor,
    this.onTap,
    this.trailing,
  });

  final String title;
  final String? subtitle;
  final String? icon;
  final Color? iconColor;
  final VoidCallback? onTap;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            if (icon != null) ...[
              AppIcon(
                icon!,
                size: 18,
                color: iconColor ??
                    (isDark
                        ? AppColors.darkTextSecondary
                        : AppColors.textSecondary),
              ),
              const SizedBox(width: AppSpacing.sm),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w600,
                      color: isDark
                          ? AppColors.darkTextPrimary
                          : AppColors.textPrimary,
                    ),
                  ),
                  if (subtitle != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        subtitle!,
                        style: TextStyle(
                          fontSize: 12,
                          color: isDark
                              ? AppColors.darkTextSecondary
                              : AppColors.textSecondary,
                        ),
                      ),
                    ),
                ],
              ),
            ),
            trailing ??
                AppIcon(
                  'chevron-right',
                  size: 16,
                  color: isDark
                      ? AppColors.darkTextTertiary
                      : AppColors.textTertiary,
                ),
          ],
        ),
      ),
    );
  }
}

/// iOS/Android 一致的键盘避让包裹（输入页统一使用）
class MeKeyboardSafeBody extends StatelessWidget {
  const MeKeyboardSafeBody({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => FocusScope.of(context).unfocus(),
      child: child,
    );
  }
}

