import 'package:flutter/material.dart';

/// 设计规范色彩系统
class AppColors {
  AppColors._();

  // 品牌主色与辅助色（与 Web 对齐）
  static const Color primary = Color(0xFF0058BE);
  static const Color primaryLight = Color(0xFFD7E3F7);
  static const Color onPrimary = Colors.white;

  // 正向 / 成功色
  static const Color success = Color(0xFF006C49);
  static const Color successLight = Color(0xFFC4EED0);

  // 警示 / 警告色
  static const Color warning = Color(0xFFD97706);
  static const Color warningLight = Color(0xFFFEF3C7);

  // 危险 / 破坏性操作色
  static const Color danger = Color(0xFFBA1A1A);
  static const Color dangerLight = Color(0xFFFFDAD6);

  // 中性色（浅色）
  static const Color background = Color(0xFFF8F9FA);
  static const Color surface = Colors.white;
  static const Color surfaceVariant = Color(0xFFEEF0F2);
  static const Color border = Color(0xFFE1E3E4);
  static const Color borderLight = Color(0xFFF1F3F5);

  static const Color textPrimary = Color(0xFF191C1D);
  static const Color textSecondary = Color(0xFF424754);
  static const Color textTertiary = Color(0xFF727782);
  static const Color textDisabled = Color(0xFFA0A5B0);

  // 中性色（深色模式）
  static const Color darkBackground = Color(0xFF111315);
  static const Color darkSurface = Color(0xFF1E2022);
  static const Color darkSurfaceVariant = Color(0xFF2B2D30);
  static const Color darkBorder = Color(0xFF383A3E);

  static const Color darkTextPrimary = Color(0xFFE1E3E6);
  static const Color darkTextSecondary = Color(0xFFAFB3BA);
  static const Color darkTextTertiary = Color(0xFF80848C);
}
