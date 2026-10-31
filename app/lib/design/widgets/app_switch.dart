import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../tokens/colors.dart';
import 'adaptive_base.dart';

/// 自适应开关控件
class AppSwitch extends StatelessWidget {
  const AppSwitch({
    super.key,
    required this.value,
    required this.onChanged,
  });

  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    if (isCupertinoPlatform(context)) {
      return CupertinoSwitch(
        value: value,
        activeTrackColor: AppColors.primary,
        onChanged: onChanged,
      );
    }
    return Switch(
      value: value,
      activeThumbColor: AppColors.primary,
      onChanged: onChanged,
    );
  }
}
