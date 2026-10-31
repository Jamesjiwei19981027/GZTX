import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../tokens/colors.dart';
import '../tokens/spacing.dart';
import 'adaptive_base.dart';

/// 自适应分段切换器：
/// - iOS 端呈现原生胶囊式滑块 (`CupertinoSlidingSegmentedControl`)
/// - 安卓端呈现 Material 风格下划线指示器
class AppSegmentedControl<T extends Object> extends StatelessWidget {
  const AppSegmentedControl({
    super.key,
    required this.segments,
    required this.selectedValue,
    required this.onValueChanged,
  });

  /// 选项映射表，key 为选项值，value 为展示文案
  final Map<T, String> segments;
  final T selectedValue;
  final ValueChanged<T> onValueChanged;

  @override
  Widget build(BuildContext context) {
    final isIos = isCupertinoPlatform(context);

    if (isIos) {
      // iOS: 胶囊式分段器
      final children = segments.map((key, text) {
        return MapEntry(
          key,
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            child: Text(
              text,
              style: TextStyle(
                fontSize: 13,
                fontWeight: selectedValue == key ? FontWeight.w600 : FontWeight.w500,
                color: isDarkMode(context)
                    ? AppColors.darkTextPrimary
                    : AppColors.textPrimary,
              ),
            ),
          ),
        );
      });

      return CupertinoSlidingSegmentedControl<T>(
        groupValue: selectedValue,
        children: children,
        onValueChanged: (val) {
          if (val != null) onValueChanged(val);
        },
        backgroundColor: isDarkMode(context)
            ? AppColors.darkSurfaceVariant
            : const Color(0xFFE5E7EB),
        thumbColor: isDarkMode(context) ? AppColors.darkSurface : Colors.white,
      );
    }

    // Android: 下划线式分段切换器
    final isDark = isDarkMode(context);
    return Container(
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: isDark ? AppColors.darkBorder : AppColors.border,
            width: 1.0,
          ),
        ),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: segments.entries.map((entry) {
            final isSelected = entry.key == selectedValue;
            return InkWell(
              onTap: () => onValueChanged(entry.key),
              borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(
                      color: isSelected ? AppColors.primary : Colors.transparent,
                      width: 2.5,
                    ),
                  ),
                ),
                child: Text(
                  entry.value,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                    color: isSelected
                        ? AppColors.primary
                        : (isDark ? AppColors.darkTextSecondary : AppColors.textSecondary),
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}
