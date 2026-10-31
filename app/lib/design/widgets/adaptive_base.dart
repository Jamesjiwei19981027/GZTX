import 'package:flutter/material.dart';

/// 判断当前上下文是否应渲染为 Cupertino (iOS/macOS) 风格
bool isCupertinoPlatform(BuildContext context) {
  final platform = Theme.of(context).platform;
  return platform == TargetPlatform.iOS || platform == TargetPlatform.macOS;
}

/// 判断当前是否处于深色模式
bool isDarkMode(BuildContext context) {
  return Theme.of(context).brightness == Brightness.dark;
}
