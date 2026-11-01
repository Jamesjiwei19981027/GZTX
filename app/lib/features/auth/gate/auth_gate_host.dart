import 'package:flutter/material.dart';
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_state.dart';
import '../../../design/design.dart';
import '../auth_paths.dart';
import '../data/auth_api.dart';
import '../utils/auth_error_message.dart';
import '../utils/phone_reminder.dart';
import '../widgets/phone_reminder.dart';

/// 每次登录会话只处理一次验证门 / 手机提醒的开关。
class AuthGateSession {
  AuthGateSession._();

  static String? _handledUserId;

  static bool handled(String userId) => _handledUserId == userId;

  static void markHandled(String userId) {
    _handledUserId = userId;
  }

  static void reset() {
    _handledUserId = null;
  }
}

/// 全局验证门 + 手机号一周提醒的挂载宿主。
///
/// **当前状态：本任务未挂载**（`main.dart` 属于 T00 底座，T01 不得修改）。
/// 计划用法：在原生模式的 `MaterialApp.router` 外层加 `builder`，
/// 让登录后启动 APP 的老用户也能被验证门拦截、并收到手机号提醒。
/// 详见回传报告的“共享改动申请”。
///
/// 在未挂载之前，登录 / 注册流程会在 [AuthFlow] 中主动进入验证门，
/// 验证门自身也会检查手机提醒，行为保持一致。
class AuthGateHost extends StatefulWidget {
  const AuthGateHost({
    super.key,
    required this.child,
    this.api,
    this.reminderStorage,
    this.now,
  });

  final Widget child;

  /// 测试注入用
  final AuthApi? api;
  final PhoneReminderStorage? reminderStorage;
  final DateTime? now;

  @override
  State<AuthGateHost> createState() => _AuthGateHostState();
}

class _AuthGateHostState extends State<AuthGateHost> {
  PhoneReminderStorage? _storageCache;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();

    if (auth.status == AuthStatus.authenticated) {
      final userId = auth.currentUser?.id.toString() ?? '';
      if (userId.isNotEmpty && !AuthGateSession.handled(userId)) {
        AuthGateSession.markHandled(userId);
        WidgetsBinding.instance.addPostFrameCallback((_) => _runGate(auth));
      }
    } else if (auth.status == AuthStatus.unauthenticated) {
      // 退出登录后允许下一次登录重新走验证门
      AuthGateSession.reset();
    }

    return widget.child;
  }

  Future<void> _runGate(AuthState auth) async {
    if (!mounted) return;
    final api = widget.api ?? AuthApi(auth.api);
    try {
      final status = await api.fetchVerificationStatus();
      if (!mounted) return;
      if (!status.emailVerified) {
        context.go(AuthPaths.verifyLocation());
        return;
      }
      if (!status.phoneVerified) {
        final storage = widget.reminderStorage ??
            (_storageCache ??= await createDefaultPhoneReminderStorage());
        if (!mounted) return;
        await maybeShowPhoneReminder(
          context: context,
          userId: auth.currentUser?.id.toString() ?? '',
          phoneVerified: false,
          storage: storage,
          now: widget.now,
        );
      }
    } catch (e) {
      if (!mounted) return;
      // 验证状态拿不到时给出可见提示，不静默吞掉
      showAppToast(
        context,
        '验证状态加载失败：${describeAuthError(e)}',
        type: ToastType.warning,
      );
    }
  }
}
