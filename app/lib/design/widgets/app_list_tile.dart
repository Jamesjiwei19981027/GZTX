import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../tokens/colors.dart';
import '../tokens/spacing.dart';
import 'adaptive_base.dart';

/// 自适应列表项
class AppListTile extends StatelessWidget {
  const AppListTile({
    super.key,
    required this.title,
    this.titleStyle,
    this.subtitle,
    this.leading,
    this.trailing,
    this.onTap,
    this.showChevron = true,
  });

  final String title;
  final TextStyle? titleStyle;
  final String? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool showChevron;

  @override
  Widget build(BuildContext context) {
    final isIos = isCupertinoPlatform(context);
    final isDark = isDarkMode(context);

    Widget? chevronWidget;
    if (showChevron && onTap != null && trailing == null) {
      chevronWidget = Icon(
        isIos ? CupertinoIcons.chevron_forward : Icons.chevron_right,
        size: 18,
        color: isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
      );
    }

    final titleWidget = Text(
      title,
      style: titleStyle ??
          TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w500,
            color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
          ),
    );

    final subtitleWidget = subtitle != null
        ? Text(
            subtitle!,
            style: TextStyle(
              fontSize: 13,
              color: isDark
                  ? AppColors.darkTextSecondary
                  : AppColors.textSecondary,
            ),
          )
        : null;

    if (isIos) {
      return CupertinoListTile(
        title: titleWidget,
        subtitle: subtitleWidget,
        leading: leading,
        trailing: trailing ?? chevronWidget,
        onTap: onTap,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      );
    }

    return ListTile(
      title: titleWidget,
      subtitle: subtitleWidget,
      leading: leading,
      trailing: trailing ?? chevronWidget,
      onTap: onTap,
      minTileHeight: subtitle == null ? 48 : 72,
      minLeadingWidth: 18,
      horizontalTitleGap: 12,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
    );
  }
}

/// 自适应列表分组
class AppListSection extends StatelessWidget {
  const AppListSection({
    super.key,
    this.header,
    this.footer,
    required this.children,
    this.margin = const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
  });

  final String? header;
  final String? footer;
  final List<Widget> children;
  final EdgeInsetsGeometry margin;

  @override
  Widget build(BuildContext context) {
    final isIos = isCupertinoPlatform(context);
    final isDark = isDarkMode(context);

    if (isIos) {
      return CupertinoListSection.insetGrouped(
        header: header != null
            ? Text(
                header!,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.textSecondary,
                ),
              )
            : null,
        footer: footer != null
            ? Text(
                footer!,
                style: TextStyle(
                  fontSize: 12,
                  color: isDark
                      ? AppColors.darkTextTertiary
                      : AppColors.textTertiary,
                ),
              )
            : null,
        margin: margin,
        backgroundColor: Colors.transparent,
        decoration: BoxDecoration(
          color: isDark ? AppColors.darkSurface : Colors.white,
          borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        ),
        children: children,
      );
    }

    // Android Card / List 分组
    return Container(
      margin: margin,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (header != null) ...[
            Padding(
              padding: const EdgeInsets.only(left: 16, bottom: 8),
              child: Text(
                header!,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.textSecondary,
                ),
              ),
            ),
          ],
          Card(
            elevation: 0,
            margin: EdgeInsets.zero,
            color: isDark ? AppColors.darkSurface : Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
              side: BorderSide(
                color: isDark ? AppColors.darkBorder : AppColors.border,
              ),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
              child: Column(
                children: [
                  for (var i = 0; i < children.length; i++) ...[
                    children[i],
                    if (i < children.length - 1)
                      Divider(
                        height: 1,
                        thickness: 0.5,
                        indent: 16,
                        endIndent: 16,
                        color: isDark ? AppColors.darkBorder : AppColors.border,
                      ),
                  ],
                ],
              ),
            ),
          ),
          if (footer != null) ...[
            Padding(
              padding: const EdgeInsets.only(left: 16, top: 6),
              child: Text(
                footer!,
                style: TextStyle(
                  fontSize: 12,
                  color: isDark
                      ? AppColors.darkTextTertiary
                      : AppColors.textTertiary,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
