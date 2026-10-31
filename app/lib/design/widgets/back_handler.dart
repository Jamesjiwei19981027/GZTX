import 'package:flutter/material.dart';

import 'app_dialog.dart';

/// 移动端返回动作裁决类型（对齐 frontend/src/mobile/navigation/mobileRoutes.ts）
enum AppBackAction {
  confirmDiscard,
  closeOverlay,
  popDetail,
  root,
}

/// 裁决当前返回应当执行何种动作
AppBackAction resolveBackAction({
  required bool isDirty,
  required bool hasOverlay,
  required bool canPop,
}) {
  if (isDirty) return AppBackAction.confirmDiscard;
  if (hasOverlay) return AppBackAction.closeOverlay;
  if (canPop) return AppBackAction.popDetail;
  return AppBackAction.root;
}

/// 支持未保存表单确认拦截的返回守护组件
class AppBackScope extends StatelessWidget {
  const AppBackScope({
    super.key,
    required this.child,
    this.isDirty = false,
    this.discardTitle = '放弃修改？',
    this.discardMessage = '您有未保存的内容，退出后将丢失修改。',
    this.onPopConfirmed,
  });

  final Widget child;
  final bool isDirty;
  final String discardTitle;
  final String discardMessage;
  final VoidCallback? onPopConfirmed;

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !isDirty,
      onPopInvokedWithResult: (didPop, result) async {
        if (didPop) return;
        final confirm = await showAppConfirmDialog(
          context: context,
          title: discardTitle,
          message: discardMessage,
          confirmLabel: '放弃并退出',
          cancelLabel: '继续编辑',
          isDestructive: true,
        );
        if (confirm && context.mounted) {
          onPopConfirmed?.call();
          Navigator.of(context).pop(result);
        }
      },
      child: child,
    );
  }
}
