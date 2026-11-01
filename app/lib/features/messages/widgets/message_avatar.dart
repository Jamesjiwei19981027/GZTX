import 'package:flutter/material.dart';

import '../../../design/design.dart';
import '../models/messages_models.dart';

/// 频道 / 私聊统一的圆形（方形）头像块
class MessageAvatar extends StatelessWidget {
  const MessageAvatar({
    super.key,
    required this.label,
    this.isChannel = false,
    this.size = 40,
  });

  final String label;
  final bool isChannel;
  final double size;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final text = label.trim().isEmpty
        ? (isChannel ? '#' : '友')
        : (isChannel ? '#' : label.trim().characters.first);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurfaceVariant : AppColors.primaryLight,
        borderRadius:
            BorderRadius.circular(isChannel ? AppSpacing.md : size / 2),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: size * 0.4,
          fontWeight: FontWeight.w700,
          color: AppColors.primary,
        ),
      ),
    );
  }
}

/// 在线状态圆点 + 文案
class PresenceIndicator extends StatelessWidget {
  const PresenceIndicator({
    super.key,
    required this.status,
    this.showLabel = true,
  });

  final PresenceStatus status;
  final bool showLabel;

  Color get _color {
    switch (status) {
      case PresenceStatus.online:
        return const Color(0xFF1BA94C);
      case PresenceStatus.busy:
        return AppColors.warning;
      case PresenceStatus.offline:
        return AppColors.textTertiary;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: _color, shape: BoxShape.circle),
        ),
        if (showLabel) ...[
          const SizedBox(width: AppSpacing.xs),
          Text(
            status.label,
            style: TextStyle(
              fontSize: 12,
              color: isDark
                  ? AppColors.darkTextSecondary
                  : AppColors.textSecondary,
            ),
          ),
        ],
      ],
    );
  }
}
