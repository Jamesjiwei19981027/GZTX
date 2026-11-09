import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../../../core/time/time_utils.dart';
import '../../../design/design.dart';
import '../models/messages_models.dart';

/// 协作通知列表项。
///
/// 底座 `AppListTile` 的副标题在 iOS 上只显示一行，会把通知正文截断；
/// 这里单独实现，保证两端都能显示多行预览，并给未读通知加粗标题。
class NotificationTile extends StatelessWidget {
  const NotificationTile({
    super.key,
    required this.item,
    required this.onTap,
    this.onDetails,
  });

  final CollabNotification item;
  final VoidCallback onTap;
  final VoidCallback? onDetails;

  @override
  Widget build(BuildContext context) {
    final isIos = isCupertinoPlatform(context);
    final isDark = isDarkMode(context);
    final time =
        item.createdAt == null ? '' : formatRelativeDate(item.createdAt);
    final title = item.senderName ?? '系统协同通知';

    final titleRow = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 16,
              fontWeight: item.read ? FontWeight.w500 : FontWeight.w500,
              color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
            ),
          ),
        ),
        if (item.requiresReply && !item.hasReply) ...[
          const SizedBox(width: AppSpacing.xs),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
            decoration: BoxDecoration(
              color: AppColors.warningLight,
              borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
            ),
            child: const Text(
              '需回复',
              style: TextStyle(fontSize: 12, color: Color(0xFF7A4E00)),
            ),
          ),
        ],
        if (time.isNotEmpty) ...[
          const SizedBox(width: AppSpacing.xs),
          Flexible(
            child: Text(
              time,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w400,
                color: AppColors.textTertiary,
              ),
            ),
          ),
        ],
      ],
    );

    final body = Text(
      item.bodyText.trim().isEmpty ? '无详细内容' : item.bodyText,
      maxLines: 3,
      overflow: TextOverflow.ellipsis,
      style: TextStyle(
        fontSize: 13,
        height: 1.45,
        color: isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
      ),
    );

    final leading = Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: 36,
          height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color:
                item.read ? AppColors.surfaceVariant : AppColors.primaryLight,
            shape: BoxShape.circle,
          ),
          child: AppIcon(
            'bell',
            size: 18,
            color: item.read ? AppColors.textTertiary : AppColors.primary,
          ),
        ),
        if (!item.read)
          Positioned(
            right: -1,
            top: -1,
            child: Container(
              key: ValueKey('unread-dot-${item.id}'),
              width: 9,
              height: 9,
              decoration: BoxDecoration(
                color: AppColors.primary,
                shape: BoxShape.circle,
                border: Border.all(
                  color: isDark ? AppColors.darkSurface : Colors.white,
                  width: 1.5,
                ),
              ),
            ),
          ),
      ],
    );

    if (isIos) {
      return CupertinoListTile(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.md,
        ),
        leading: leading,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            titleRow,
            const SizedBox(height: 4),
            body,
          ],
        ),
        onTap: onTap,
        trailing: onDetails == null
            ? null
            : IconButton(
                tooltip: '通知详情与操作',
                onPressed: onDetails,
                icon: const Icon(Icons.more_horiz, size: 18)),
      );
    }

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.sm,
      ),
      leading: leading,
      title: titleRow,
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: body,
      ),
      onTap: onTap,
      trailing: onDetails == null
          ? null
          : IconButton(
              tooltip: '通知详情与操作',
              onPressed: onDetails,
              icon: const Icon(Icons.more_horiz, size: 18)),
    );
  }
}
