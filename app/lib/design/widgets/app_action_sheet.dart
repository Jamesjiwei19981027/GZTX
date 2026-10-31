import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../tokens/colors.dart';
import '../tokens/spacing.dart';
import 'adaptive_base.dart';

class AppActionSheetItem {
  const AppActionSheetItem({
    required this.label,
    required this.onPressed,
    this.isDestructive = false,
    this.icon,
  });

  final String label;
  final VoidCallback onPressed;
  final bool isDestructive;
  final Widget? icon;
}

/// 弹出操作菜单
Future<void> showAppActionSheet({
  required BuildContext context,
  String? title,
  String? message,
  required List<AppActionSheetItem> actions,
  String cancelLabel = '取消',
}) async {
  final isIos = isCupertinoPlatform(context);

  if (isIos) {
    await showCupertinoModalPopup<void>(
      context: context,
      builder: (ctx) => CupertinoActionSheet(
        title: title != null ? Text(title) : null,
        message: message != null ? Text(message) : null,
        actions: actions.map((item) {
          return CupertinoActionSheetAction(
            isDestructiveAction: item.isDestructive,
            onPressed: () {
              Navigator.of(ctx).pop();
              item.onPressed();
            },
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (item.icon != null) ...[
                  item.icon!,
                  const SizedBox(width: AppSpacing.sm),
                ],
                Text(
                  item.label,
                  style: item.isDestructive
                      ? const TextStyle(color: AppColors.danger)
                      : null,
                ),
              ],
            ),
          );
        }).toList(),
        cancelButton: CupertinoActionSheetAction(
          onPressed: () => Navigator.of(ctx).pop(),
          child: Text(cancelLabel),
        ),
      ),
    );
    return;
  }

  final isDark = isDarkMode(context);
  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: isDark ? AppColors.darkSurface : Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppSpacing.radiusLg)),
    ),
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: AppSpacing.sm),
          Container(
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkBorder : AppColors.border,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          if (title != null) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
              child: Text(
                title,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
            ),
          ],
          if (message != null) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Text(
                message,
                style: TextStyle(
                  fontSize: 13,
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.textSecondary,
                ),
              ),
            ),
          ],
          const Divider(height: 1),
          for (final item in actions)
            ListTile(
              leading: item.icon,
              title: Text(
                item.label,
                style: TextStyle(
                  color: item.isDestructive
                      ? AppColors.danger
                      : (isDark ? AppColors.darkTextPrimary : AppColors.textPrimary),
                  fontWeight: FontWeight.w500,
                ),
              ),
              onTap: () {
                Navigator.of(ctx).pop();
                item.onPressed();
              },
            ),
          const Divider(height: 1),
          ListTile(
            title: Center(
              child: Text(
                cancelLabel,
                style: TextStyle(
                  color: isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            onTap: () => Navigator.of(ctx).pop(),
          ),
        ],
      ),
    ),
  );
}
