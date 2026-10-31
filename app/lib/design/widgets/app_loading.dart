import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../tokens/colors.dart';
import 'adaptive_base.dart';

/// 自适应加载指示器
class AppLoading extends StatelessWidget {
  const AppLoading({
    super.key,
    this.size = 24.0,
    this.color,
  });

  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final effectiveColor = color ?? AppColors.primary;
    if (isCupertinoPlatform(context)) {
      return CupertinoActivityIndicator(
        radius: size / 2,
        color: effectiveColor,
      );
    }
    return SizedBox(
      width: size,
      height: size,
      child: CircularProgressIndicator(
        strokeWidth: 2.5,
        color: effectiveColor,
      ),
    );
  }
}
