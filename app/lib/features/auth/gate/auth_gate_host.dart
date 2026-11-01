import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_state.dart';
import '../../../design/design.dart';
import '../auth_paths.dart';
import '../data/auth_api.dart';
import '../models/auth_models.dart';
import '../utils/auth_error_message.dart';
import '../utils/phone_reminder.dart';
import '../widgets/phone_reminder.dart';

/// 每次登录会话只处理一次验证门 / 手机提醒的开关。
///
/// 登录 / 注册流程会主动标记本轮会话已处理，避免全局宿主重复跳转、
/// 覆盖用户正在填写的验证码表单。
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
///
/// 计划用法（一行改动，见回传报告的“共享改动申请”）：
/// ```dart
/// MaterialApp.router(
///   builder: (context, child) => AuthGateHost(
///     router: _appRouter!.router,
///     navigatorKey: AppRouter.rootNavigatorKey,
///     child: child!,
///   ),
/// );
/// ```
/// 这样已登录但邮箱未验证的老用户打开 APP 时会被验证门拦住，
/// 手机号未验证的用户也会按“七天一次”的规则收到提醒。
///
/// 之所以要显式传 [router] 与 [navigatorKey]：`MaterialApp.router` 的 builder
/// 位于 Navigator 之外，既拿不到 `GoRouter.of(context)` 也没有 Overlay，
/// 必须借助 Navigator 的 context 才能跳转与弹窗。
class AuthGateHost extends StatefulWidget {
  const AuthGateHost({
    super.key,
    required this.child,
    required this.router,
    required this.navigatorKey,
    this.api,
    this.reminderStorage,
    this.now,
  });

  final Widget child;
  final GoRouter router;
  final GlobalKey<NavigatorState> navigatorKey;

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

    final VerificationStatus status;
    try {      status = await api.fetchVerificationStatus();
    } catch (e) {
      // 验证状态拿不到时给出可见提示，不静默吞掉
      _showGateError(e);
      return;
    }
    if (!mounted) return;

    if (status.emailVerified != true) {
      widget.router.go(AuthPaths.verifyLocation());
      return;
    }
    if (status.phoneVerified == true) return;

    final storage = widget.reminderStorage ??
        (_storageCache ??= await createDefaultPhoneReminderStorage());
    if (!mounted) return;

    final navContext = widget.navigatorKey.currentContext;
    if (navContext == null || !navContext.mounted) return;
    await maybeShowPhoneReminder(
      context: navContext,
      userId: auth.currentUser?.id.toString() ?? '',
      phoneVerified: false,
      storage: storage,
      now: widget.now,
    );
  }

  void _showGateError(Object error) {
    final navContext = widget.navigatorKey.currentContext;
    if (navContext == null || !navContext.mounted) return;
    showAppToast(
      navContext,
      '验证状态加载失败：${describeAuthError(error)}',
      type: ToastType.warning,
    );
  }
}
