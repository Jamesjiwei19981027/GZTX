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
                      style: TextStyle(fontWeight: FontWeight.bold),
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
