import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../tokens/colors.dart';
import '../tokens/spacing.dart';
import 'adaptive_base.dart';

enum ToastType { info, success, warning, error }

OverlayEntry? _activeToastEntry;
Timer? _activeToastTimer;

/// 供测试清理当前活跃 Toast 状态
@visibleForTesting
void resetToastForTesting() {
  _activeToastTimer?.cancel();
  _activeToastTimer = null;
  if (_activeToastEntry != null) {
    try {
      _activeToastEntry!.remove();
    } catch (_) {}
    _activeToastEntry!.dispose();
    _activeToastEntry = null;
  }
}

/// 弹出全局轻提示 Toast（单例去重，防二次 dispose）
void showAppToast(
  BuildContext context,
  String message, {
  ToastType type = ToastType.info,
  Duration duration = const Duration(seconds: 2),
}) {
  // 1. 取消正在计时的旧 Toast 定时器，防止旧定时器回调触发二次 dispose
  _activeToastTimer?.cancel();
  _activeToastTimer = null;

  // 2. 如果已有展示中的 Toast，先从 Overlay 移除并安全销毁，避免在屏幕上堆叠
  if (_activeToastEntry != null) {
    try {
      _activeToastEntry!.remove();
    } catch (_) {}
    _activeToastEntry!.dispose();
    _activeToastEntry = null;
  }

  final isIos = isCupertinoPlatform(context);

  final (iconData, bgColor) = switch (type) {
    ToastType.info => (
        isIos ? CupertinoIcons.info_circle_fill : Icons.info,
        const Color(0xFF333333)
      ),
    ToastType.success => (
        isIos ? CupertinoIcons.checkmark_circle_fill : Icons.check_circle,
        AppColors.success
      ),
    ToastType.warning => (
        isIos ? CupertinoIcons.exclamationmark_triangle_fill : Icons.warning,
        AppColors.warning
      ),
    ToastType.error => (
        isIos ? CupertinoIcons.xmark_circle_fill : Icons.error,
        AppColors.danger
      ),
  };

  final overlay = Overlay.of(context);
  late OverlayEntry entry;

  entry = OverlayEntry(
    builder: (ctx) => Positioned(
      top: MediaQuery.of(ctx).padding.top + 20,
      left: 20,
      right: 20,
      child: Center(
        child: Material(
          color: Colors.transparent,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: bgColor.withValues(alpha: 0.95),
              borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.15),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(iconData, color: Colors.white, size: 18),
                const SizedBox(width: AppSpacing.sm),
                Flexible(
                  child: Text(
                    message,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );

  _activeToastEntry = entry;
  overlay.insert(entry);

  _activeToastTimer = Timer(duration, () {
    if (_activeToastEntry == entry) {
      try {
        entry.remove();
      } catch (_) {}
      entry.dispose();
      _activeToastEntry = null;
    }
    _activeToastTimer = null;
  });
}
