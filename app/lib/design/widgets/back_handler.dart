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
///
/// 确认“放弃并退出”后必须先把 canPop 放开、下一帧再 pop：本应用走 go_router
/// 页面路由，canPop 仍为 false 时直接 pop 会再次触发拦截，确认框反复弹出、退不出去。
class AppBackScope extends StatefulWidget {
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
  State<AppBackScope> createState() => _AppBackScopeState();
}

class _AppBackScopeState extends State<AppBackScope> {
  bool _discardConfirmed = false;
  // 询问中不再重复弹框（连按返回键）。
  bool _asking = false;

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !widget.isDirty || _discardConfirmed,
      onPopInvokedWithResult: (didPop, result) async {
        // 同一路由上的所有 PopScope 都会收到回调（如 AppScaffold 内层这一层），
        // 只有自己确有未保存内容时才询问，否则会叠出第二个确认框。
        if (didPop || !widget.isDirty || _discardConfirmed || _asking) return;
        _asking = true;
        final bool confirm;
        try {
          confirm = await showAppConfirmDialog(
            context: context,
            title: widget.discardTitle,
            message: widget.discardMessage,
            confirmLabel: '放弃并退出',
            cancelLabel: '继续编辑',
            isDestructive: true,
          );
        } finally {
          _asking = false;
        }
        if (!confirm || !mounted) return;
        widget.onPopConfirmed?.call();
        setState(() => _discardConfirmed = true);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) Navigator.of(context).pop(result);
        });
      },
      child: widget.child,
    );
  }
}
