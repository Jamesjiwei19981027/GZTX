import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../tokens/colors.dart';
import 'adaptive_base.dart';

/// 弹出自适应日期选择器
Future<DateTime?> showAppDatePicker({
  required BuildContext context,
  required DateTime initialDate,
  DateTime? firstDate,
  DateTime? lastDate,
}) async {
  final isIos = isCupertinoPlatform(context);
  final start = firstDate ?? DateTime(2020);
  final end = lastDate ?? DateTime(2035);

  if (isIos) {
    DateTime selected = initialDate;
    final isDark = isDarkMode(context);

    final confirmed = await showCupertinoModalPopup<bool>(
      context: context,
      builder: (ctx) => Material(
        color: Colors.transparent,
        child: Container(
          height: 300,
          color: isDark ? AppColors.darkSurface : Colors.white,
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  CupertinoButton(
                    onPressed: () => Navigator.of(ctx).pop(false),
                    child: const Text('取消'),
                  ),
                  CupertinoButton(
                    onPressed: () => Navigator.of(ctx).pop(true),
                    child: const Text(
                      '确定',
                      style: TextStyle(fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
              const Divider(height: 1),
              Expanded(
                child: CupertinoDatePicker(
                  mode: CupertinoDatePickerMode.date,
                  initialDateTime: initialDate,
                  minimumDate: start,
                  maximumDate: end,
                  onDateTimeChanged: (dt) {
                    selected = dt;
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );

    return (confirmed == true) ? selected : null;
  }

  return showDatePicker(
    context: context,
    initialDate: initialDate,
    firstDate: start,
    lastDate: end,
    confirmText: '确定',
    cancelText: '取消',
  );
}

/// 弹出自适应日期时间选择器（支持选择年月日及具体时间）
Future<DateTime?> showAppDateTimePicker({
  required BuildContext context,
  required DateTime initialDateTime,
  DateTime? firstDate,
  DateTime? lastDate,
}) async {
  final isIos = isCupertinoPlatform(context);
  final start = firstDate ?? DateTime(2020);
  final end = lastDate ?? DateTime(2035);

  if (isIos) {
    DateTime selected = initialDateTime;
    final isDark = isDarkMode(context);

    final confirmed = await showCupertinoModalPopup<bool>(
      context: context,
      builder: (ctx) => Material(
        color: Colors.transparent,
        child: Container(
          height: 320,
          color: isDark ? AppColors.darkSurface : Colors.white,
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  CupertinoButton(
                    onPressed: () => Navigator.of(ctx).pop(false),
                    child: const Text('取消'),
                  ),
                  CupertinoButton(
                    onPressed: () => Navigator.of(ctx).pop(true),
                    child: const Text(
                      '确定',
                      style: TextStyle(fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
              const Divider(height: 1),
              Expanded(
                child: CupertinoDatePicker(
                  mode: CupertinoDatePickerMode.dateAndTime,
                  use24hFormat: true,
                  initialDateTime: initialDateTime,
                  minimumDate: start,
                  maximumDate: end,
                  onDateTimeChanged: (dt) {
                    selected = dt;
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );

    return (confirmed == true) ? selected : null;
  }

  // Android: 先选择日期，确认后再选择时间
  final date = await showDatePicker(
    context: context,
    initialDate: initialDateTime,
    firstDate: start,
    lastDate: end,
    confirmText: '下一步',
    cancelText: '取消',
  );
  if (date == null || !context.mounted) return null;

  final time = await showTimePicker(
    context: context,
    initialTime: TimeOfDay.fromDateTime(initialDateTime),
    confirmText: '确定',
    cancelText: '取消',
  );
  if (time == null) return null;

  return DateTime(
    date.year,
    date.month,
    date.day,
    time.hour,
    time.minute,
  );
}

