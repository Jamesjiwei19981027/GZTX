import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../tokens/colors.dart';
import '../tokens/spacing.dart';
import 'adaptive_base.dart';

enum AppButtonVariant { primary, secondary, danger }

enum AppButtonSize { sm, md, lg }

/// 自适应按钮控件
class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.variant = AppButtonVariant.primary,
    this.size = AppButtonSize.md,
    this.icon,
    this.isLoading = false,
    this.isFullWidth = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final AppButtonVariant variant;
  final AppButtonSize size;
  final Widget? icon;
  final bool isLoading;
  final bool isFullWidth;

  @override
  Widget build(BuildContext context) {
    final isIos = isCupertinoPlatform(context);
    final enabled = onPressed != null && !isLoading;

    final (padding, fontSize, height) = switch (size) {
      AppButtonSize.sm => (
          const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          13.0,
          32.0
        ),
      AppButtonSize.md => (
          const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          15.0,
          42.0
        ),
      AppButtonSize.lg => (
          const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          16.0,
          48.0
        ),
    };

    Color bgColor;
    Color fgColor;
    BorderSide? borderSide;

    switch (variant) {
      case AppButtonVariant.primary:
        bgColor = AppColors.primary;
        fgColor = Colors.white;
        borderSide = BorderSide.none;
      case AppButtonVariant.secondary:
        bgColor = isIos
            ? (isDarkMode(context)
                ? AppColors.darkSurfaceVariant
                : const Color(0xFFF0F2F5))
            : Colors.transparent;
        fgColor = isDarkMode(context)
            ? AppColors.darkTextPrimary
            : AppColors.textPrimary;
        borderSide = isIos
            ? BorderSide.none
            : BorderSide(
                color: isDarkMode(context)
                    ? AppColors.darkBorder
                    : AppColors.border,
              );
      case AppButtonVariant.danger:
        bgColor = AppColors.danger;
        fgColor = Colors.white;
        borderSide = BorderSide.none;
    }

    Widget content;
    if (isLoading) {
      final indicator = SizedBox(
        width: fontSize + 2,
        height: fontSize + 2,
        child: isIos
            ? CupertinoActivityIndicator(
                color: fgColor,
                radius: (fontSize + 2) / 2,
              )
            : CircularProgressIndicator(
                strokeWidth: 2,
                color: fgColor,
                backgroundColor: fgColor.withValues(alpha: 0.25),
              ),
      );

      content = Row(
        mainAxisSize: isFullWidth ? MainAxisSize.max : MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          indicator,
          if (label.isNotEmpty) ...[
            const SizedBox(width: AppSpacing.sm),
            Flexible(
                child: Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: fontSize,
                fontWeight: FontWeight.w500,
                color: fgColor,
              ),
            )),
          ],
        ],
      );
    } else {
      content = Row(
        mainAxisSize: isFullWidth ? MainAxisSize.max : MainAxisSize.min,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (icon != null) ...[
            icon!,
            const SizedBox(width: AppSpacing.sm),
          ],
          Flexible(
              child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: fontSize,
              fontWeight: FontWeight.w500,
              color: enabled ? fgColor : fgColor.withValues(alpha: 0.4),
            ),
          )),
        ],
      );
    }

    Widget button;
    if (isIos) {
      button = CupertinoButton(
        padding: padding,
        minimumSize: Size(0, height),
        color: bgColor,
        disabledColor: bgColor.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        onPressed: enabled ? onPressed : null,
        child: content,
      );
    } else {
      final buttonStyle = ElevatedButton.styleFrom(
        padding: padding,
        minimumSize: Size(isFullWidth ? double.infinity : 64, height),
        backgroundColor: bgColor,
        foregroundColor: fgColor,
        disabledBackgroundColor:
            isLoading ? bgColor.withValues(alpha: 0.7) : null,
        disabledForegroundColor: isLoading ? fgColor : null,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          side: borderSide,
        ),
      );

      button = ElevatedButton(
        style: buttonStyle,
        onPressed: enabled ? onPressed : null,
        child: content,
      );
    }

    if (isFullWidth) {
      return SizedBox(width: double.infinity, child: button);
    }
    return button;
  }
}
