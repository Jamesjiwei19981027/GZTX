import 'package:flutter/material.dart';

import '../../../design/design.dart';
import '../models/messages_models.dart';
import 'message_avatar.dart';

/// 单条消息气泡：自己的消息右对齐，其他人的消息带发送人与头像。
class ChatMessageTile extends StatelessWidget {
  const ChatMessageTile({
    super.key,
    required this.message,
    required this.isMine,
    this.onTap,
    this.onOpenAttachment,
  });

  final ChatMessage message;
  final bool isMine;
  final VoidCallback? onTap;
  final ValueChanged<ChatAttachment>? onOpenAttachment;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final maxWidth = MediaQuery.sizeOf(context).width * 0.74;

    final bubbleColor = isMine
        ? AppColors.primary
        : (isDark ? AppColors.darkSurface : Colors.white);
    final textColor = isMine
        ? Colors.white
        : (isDark ? AppColors.darkTextPrimary : AppColors.textPrimary);
    final secondaryColor = isMine
        ? Colors.white.withValues(alpha: 0.78)
        : (isDark ? AppColors.darkTextSecondary : AppColors.textSecondary);

    final bubble = GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        constraints: BoxConstraints(maxWidth: maxWidth),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm + 2,
        ),
        decoration: BoxDecoration(
          color: bubbleColor,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(AppSpacing.radiusLg),
            topRight:
                Radius.circular(isMine ? AppSpacing.xxs : AppSpacing.radiusLg),
            bottomLeft: const Radius.circular(AppSpacing.radiusLg),
            bottomRight: const Radius.circular(AppSpacing.radiusLg),
          ),
          border: isMine
              ? null
              : Border.all(
                  color:
                      isDark ? AppColors.darkBorder : const Color(0xFFE4E6E8),
                  width: 0.5,
                ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (message.body.trim().isNotEmpty)
              Text(
                message.body,
                style: TextStyle(fontSize: 15, height: 1.45, color: textColor),
              ),
            if (message.attachments.isNotEmpty) ...[
              if (message.body.trim().isNotEmpty)
                const SizedBox(height: AppSpacing.sm),
              for (final attachment in message.attachments)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                  child: InkWell(
                    onTap: onOpenAttachment == null
                        ? null
                        : () => onOpenAttachment!(attachment),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.sm,
                        vertical: AppSpacing.sm,
                      ),
                      decoration: BoxDecoration(
                        color: isMine
                            ? Colors.white.withValues(alpha: 0.16)
                            : (isDark
                                ? AppColors.darkSurfaceVariant
                                : AppColors.background),
                        borderRadius:
                            BorderRadius.circular(AppSpacing.radiusMd),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          AppIcon(
                            'file',
                            size: 18,
                            color: isMine ? Colors.white : AppColors.primary,
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          Flexible(
                            child: Text(
                              attachment.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 13, color: textColor),
                            ),
                          ),
                          if (attachment.sizeLabel.isNotEmpty) ...[
                            const SizedBox(width: AppSpacing.sm),
                            Text(
                              attachment.sizeLabel,
                              style: TextStyle(
                                  fontSize: 11, color: secondaryColor),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
            ],
            if (message.likes > 0) ...[
              const SizedBox(height: AppSpacing.xxs),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.thumb_up_alt_rounded,
                    size: 12,
                    color: isMine ? const Color(0xFFFFE08A) : AppColors.warning,
                  ),
                  const SizedBox(width: AppSpacing.xxs),
                  Text(
                    '${message.likes}',
                    style: TextStyle(
                      fontSize: 11,
                      color:
                          isMine ? const Color(0xFFFFE08A) : AppColors.warning,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        mainAxisAlignment:
            isMine ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isMine) ...[
            MessageAvatar(label: message.senderName, size: 32),
            const SizedBox(width: AppSpacing.sm),
          ],
          Flexible(
            child: Column(
              crossAxisAlignment:
                  isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
              children: [
                if (!isMine) ...[
                  Padding(
                    padding:
                        const EdgeInsets.only(left: AppSpacing.xs, bottom: 2),
                    child: Text(
                      message.senderName,
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark
                            ? AppColors.darkTextTertiary
                            : AppColors.textTertiary,
                      ),
                    ),
                  ),
                ],
                bubble,
              ],
            ),
          ),
          if (isMine) ...[
            const SizedBox(width: AppSpacing.sm),
            MessageAvatar(label: message.senderName, size: 32),
          ],
        ],
      ),
    );
  }
}
