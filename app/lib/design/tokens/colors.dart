import 'package:flutter/material.dart';

/// 设计规范色彩系统
class AppColors {
  AppColors._();

  // 品牌主色与辅助色（与 Web 对齐）
  static const Color primary = Color(0xFF1D4E9E);
  static const Color primaryHover = Color(0xFF173F82);
  static const Color primaryLight = Color(0xFFE8EEF8);
  static const Color onPrimary = Colors.white;

  // 正向 / 成功色
  static const Color success = Color(0xFF2F7D4F);
  static const Color successLight = Color(0xFFE1F0E6);

  // 警示 / 警告色
  static const Color warning = Color(0xFFA86412);
  static const Color warningLight = Color(0xFFF6E8D2);

  // 危险 / 破坏性操作色
  static const Color danger = Color(0xFFB3261E);
  static const Color dangerLight = Color(0xFFF9DEDC);

  // 中性色（浅色）
  static const Color background = Color(0xFFF7F6F3);
  static const Color surface = Colors.white;
  static const Color surfaceVariant = Color(0xFFEFEDE8);
  static const Color border = Color(0x141C1B19);
  static const Color borderStrong = Color(0x1F1C1B19);
  static const Color borderLight = Color(0x0D1C1B19);

  static const Color textPrimary = Color(0xFF1C1B19);
  static const Color textSecondary = Color(0xFF5C5850);
  static const Color textTertiary = Color(0xFF7D786F);
  static const Color textDisabled = Color(0xFFAAA398);

  // 中性色（深色模式）
  static const Color darkDeepest = Color(0xFF12110F);
  static const Color darkBackground = Color(0xFF161513);
  static const Color darkSurface = Color(0xFF1C1A18);
  static const Color darkSurfaceVariant = Color(0xFF262421);
  static const Color darkBorder = Color(0x14EFE9DE);

  static const Color darkTextPrimary = Color(0xFFEFE9DE);
  static const Color darkTextSecondary = Color(0xFFAAA398);
  static const Color darkTextTertiary = Color(0xFF8A847A);
  static const Color darkPrimary = Color(0xFF8FB0E8);
  static const Color darkOnPrimary = Color(0xFF12110F);
  static const Color darkPrimaryLight = Color(0xFF2A3344);
  static const Color darkSuccess = Color(0xFF6BBF8A);
  static const Color darkWarning = Color(0xFFD9A35B);
  static const Color darkDanger = Color(0xFFE5484D);

  // 提示条底色 / 文字色（错误提示、范围说明等）。浅色值直接用会在深色模式下出现刺眼的浅色块。
  static const Color infoContainer = primaryLight;
  static const Color darkInfoContainer = Color(0xFF23324A);
  static const Color darkOnInfoContainer = darkPrimary;
  static const Color darkDangerContainer = Color(0xFF3B211F);

  static Color dangerContainerOf(bool isDark) =>
      isDark ? darkDangerContainer : dangerLight;
  static Color onDangerContainerOf(bool isDark) =>
      isDark ? dangerLight : danger;
  static Color infoContainerOf(bool isDark) =>
      isDark ? darkInfoContainer : infoContainer;
  static Color onInfoContainerOf(bool isDark) =>
      isDark ? darkOnInfoContainer : primary;

  static Color textSecondaryOf(bool isDark) =>
      isDark ? darkTextSecondary : textSecondary;
  static Color textTertiaryOf(bool isDark) =>
      isDark ? darkTextTertiary : textTertiary;
}
