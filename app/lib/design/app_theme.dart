import 'package:flutter/material.dart';

import 'tokens/colors.dart';
import 'tokens/spacing.dart';

TextStyle _inter({
  double? fontSize,
  FontWeight? fontWeight,
  Color? color,
}) =>
    TextStyle(
      fontFamily: 'Inter',
      fontFamilyFallback: const ['NotoSansSC'],
      fontSize: fontSize,
      fontWeight: fontWeight,
      color: color,
    );

/// Shared Material theme for the native app. The palette is explicit so
/// Material does not introduce a generated violet ramp.
ThemeData appThemeFor(Brightness brightness, {ThemeData? base}) {
  final isDark = brightness == Brightness.dark;
  final scheme =
      (isDark ? const ColorScheme.dark() : const ColorScheme.light()).copyWith(
    primary: isDark ? AppColors.darkPrimary : AppColors.primary,
    onPrimary: isDark ? AppColors.darkOnPrimary : AppColors.onPrimary,
    primaryContainer:
        isDark ? AppColors.darkPrimaryLight : AppColors.primaryLight,
    onPrimaryContainer: isDark ? AppColors.darkTextPrimary : AppColors.primary,
    secondary: isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
    onSecondary: isDark ? AppColors.darkBackground : AppColors.surface,
    secondaryContainer:
        isDark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant,
    onSecondaryContainer:
        isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
    tertiary: isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
    onTertiary: isDark ? AppColors.darkBackground : AppColors.surface,
    tertiaryContainer:
        isDark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant,
    onTertiaryContainer:
        isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
    error: isDark ? AppColors.darkDanger : AppColors.danger,
    onError: isDark ? AppColors.darkDeepest : Colors.white,
    errorContainer:
        isDark ? AppColors.darkDangerContainer : AppColors.dangerLight,
    onErrorContainer: isDark ? AppColors.darkTextPrimary : AppColors.danger,
    surface: isDark ? AppColors.darkBackground : AppColors.background,
    onSurface: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
    surfaceContainerHighest:
        isDark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant,
    surfaceDim: isDark ? AppColors.darkDeepest : AppColors.background,
    surfaceBright: isDark ? AppColors.darkSurfaceVariant : AppColors.surface,
    surfaceContainerLowest: isDark ? AppColors.darkDeepest : AppColors.surface,
    surfaceContainerLow: isDark ? AppColors.darkSurface : AppColors.surface,
    surfaceContainer: isDark ? AppColors.darkSurface : AppColors.surface,
    surfaceContainerHigh:
        isDark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant,
    onSurfaceVariant:
        isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
    outline: isDark ? AppColors.darkBorder : AppColors.borderStrong,
    outlineVariant: isDark ? AppColors.darkBorder : AppColors.border,
    inverseSurface: isDark ? AppColors.textPrimary : AppColors.darkBackground,
    onInverseSurface: isDark ? AppColors.darkBackground : AppColors.textPrimary,
    inversePrimary: isDark ? AppColors.primary : AppColors.darkPrimary,
    surfaceTint: Colors.transparent,
  );
  final foreground = isDark ? AppColors.darkTextPrimary : AppColors.textPrimary;
  final secondary =
      isDark ? AppColors.darkTextSecondary : AppColors.textSecondary;
  final muted = isDark ? AppColors.darkTextTertiary : AppColors.textTertiary;
  final surface = isDark ? AppColors.darkSurface : AppColors.surface;
  final raised =
      isDark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant;
  final primary = isDark ? AppColors.darkPrimary : AppColors.primary;
  final text = (base?.textTheme ?? const TextTheme()).apply(
    fontFamily: 'Inter',
    fontFamilyFallback: const ['NotoSansSC'],
    bodyColor: foreground,
    displayColor: foreground,
  );

  return (base ?? ThemeData(useMaterial3: true)).copyWith(
    brightness: brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor:
        isDark ? AppColors.darkBackground : AppColors.background,
    canvasColor: isDark ? AppColors.darkBackground : AppColors.background,
    textTheme: text,
    iconTheme: IconThemeData(size: 18, color: muted),
    primaryIconTheme: IconThemeData(size: 18, color: foreground),
    appBarTheme: AppBarTheme(
      centerTitle: false,
      backgroundColor: surface,
      foregroundColor: foreground,
      elevation: 0,
      scrolledUnderElevation: 0,
      titleTextStyle:
          _inter(fontSize: 18, fontWeight: FontWeight.w500, color: foreground),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: isDark ? AppColors.darkOnPrimary : Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg, vertical: AppSpacing.md),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppSpacing.radiusMd)),
        textStyle: _inter(fontSize: 14, fontWeight: FontWeight.w500),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: foreground,
        side: BorderSide(
            color: isDark ? AppColors.darkBorder : AppColors.borderStrong),
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg, vertical: AppSpacing.md),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppSpacing.radiusMd)),
        textStyle: _inter(fontSize: 14, fontWeight: FontWeight.w500),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: primary,
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md, vertical: AppSpacing.sm),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppSpacing.radiusMd)),
        textStyle: _inter(fontSize: 14, fontWeight: FontWeight.w500),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: raised,
      contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md, vertical: AppSpacing.md),
      border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          borderSide: BorderSide(
              color: isDark ? AppColors.darkBorder : AppColors.border)),
      enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          borderSide: BorderSide(
              color: isDark ? AppColors.darkBorder : AppColors.border)),
      focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          borderSide: BorderSide(color: primary, width: 1.2)),
      errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          borderSide: BorderSide(color: scheme.error)),
      focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          borderSide: BorderSide(color: scheme.error, width: 1.2)),
      labelStyle:
          _inter(fontSize: 14, fontWeight: FontWeight.w400, color: secondary),
      hintStyle:
          _inter(fontSize: 14, fontWeight: FontWeight.w400, color: muted),
    ),
    cardTheme: CardThemeData(
      color: surface,
      elevation: isDark ? 0 : 1,
      shadowColor: Colors.black.withValues(alpha: 0.05),
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
          side: BorderSide(
              color: isDark ? AppColors.darkBorder : AppColors.border)),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusXl)),
      titleTextStyle:
          _inter(fontSize: 20, fontWeight: FontWeight.w500, color: foreground),
      contentTextStyle:
          _inter(fontSize: 14, fontWeight: FontWeight.w400, color: secondary),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: surface,
      modalBackgroundColor: surface,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(
          borderRadius:
              BorderRadius.vertical(top: Radius.circular(AppSpacing.radiusXl))),
      showDragHandle: true,
    ),
    dividerTheme: DividerThemeData(
        color: isDark ? AppColors.darkBorder : AppColors.border,
        thickness: 1,
        space: AppSpacing.lg),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((states) =>
          states.contains(WidgetState.selected)
              ? (isDark ? AppColors.darkOnPrimary : Colors.white)
              : null),
      trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected) ? primary : raised),
      trackOutlineColor: WidgetStateProperty.resolveWith(
          (states) => isDark ? AppColors.darkBorder : AppColors.borderStrong),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: raised,
      selectedColor:
          isDark ? AppColors.darkPrimaryLight : AppColors.primaryLight,
      side: BorderSide(color: isDark ? AppColors.darkBorder : AppColors.border),
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusSm)),
      labelStyle:
          _inter(fontSize: 13, fontWeight: FontWeight.w400, color: foreground),
      secondaryLabelStyle:
          _inter(fontSize: 13, fontWeight: FontWeight.w500, color: primary),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: surface,
      elevation: 0,
      indicatorColor:
          isDark ? AppColors.darkPrimaryLight : AppColors.primaryLight,
      labelTextStyle: WidgetStateProperty.resolveWith((states) => _inter(
          fontSize: 12,
          fontWeight: FontWeight.w400,
          color: states.contains(WidgetState.selected) ? primary : secondary)),
      iconTheme: WidgetStateProperty.resolveWith((states) => IconThemeData(
          size: 18,
          color: states.contains(WidgetState.selected) ? primary : secondary)),
    ),
    bottomAppBarTheme: BottomAppBarThemeData(color: surface, elevation: 0),
  );
}
