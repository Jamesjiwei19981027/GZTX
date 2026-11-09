import 'package:flutter/material.dart';
import 'colors.dart';

/// 字体与文字排版规范：正文 400，标题与控件 500。
class AppTypography {
  AppTypography._();

  static const TextStyle titleLarge = TextStyle(fontSize: 22, fontWeight: FontWeight.w500, color: AppColors.textPrimary);
  static const TextStyle titleMedium = TextStyle(fontSize: 18, fontWeight: FontWeight.w500, color: AppColors.textPrimary);
  static const TextStyle titleSmall = TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: AppColors.textPrimary);
  static const TextStyle bodyLarge = TextStyle(fontSize: 16, fontWeight: FontWeight.w400, color: AppColors.textPrimary, height: 1.4);
  static const TextStyle bodyMedium = TextStyle(fontSize: 14, fontWeight: FontWeight.w400, color: AppColors.textPrimary, height: 1.4);
  static const TextStyle bodySmall = TextStyle(fontSize: 12, fontWeight: FontWeight.w400, color: AppColors.textSecondary, height: 1.3);
  static const TextStyle caption = TextStyle(fontSize: 12, fontWeight: FontWeight.w400, color: AppColors.textTertiary);
  static const TextStyle button = TextStyle(fontSize: 14, fontWeight: FontWeight.w500);
}
