import 'package:flutter/material.dart';

import '../tokens/colors.dart';

/// Shared signature style for completed task and matter titles.
TextStyle completedTitleStyle({
  required bool isDark,
  required bool completed,
  required TextStyle base,
}) {
  if (!completed) return base;
  return base.copyWith(
    color: isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
    decoration: TextDecoration.lineThrough,
    decorationColor: isDark ? AppColors.darkPrimary : AppColors.primary,
    decorationThickness: 1.5,
  );
}
