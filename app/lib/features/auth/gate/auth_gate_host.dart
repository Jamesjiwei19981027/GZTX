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
/// 已由 `main.dart` 挂载在 `MaterialApp.router` 的 `builder` 上：
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

  /// 宿主自建的 Overlay 条目（child 挂在里面）。
  ///
  /// `MaterialApp.router` 的 builder 位于根 Navigator 之外，而 Overlay 是 Navigator
  /// 的子节点、不是它的祖先，所以 builder 的 context 与 `navigatorKey.currentContext`
  /// 都找不到 Overlay：`showAppToast` 里的 `Overlay.of()` 会抛 “No Overlay widget
  /// found”，提示弹不出来还会把启动流程打断。这里自建一层 Overlay，
  /// 弹提示时改用该条目内部的 context（见 [_toastHostKey]）。
  OverlayEntry? _hostEntry;

  /// 自建 Overlay 条目内部的 context，[showAppToast] 靠它找到上面这层 Overlay
  final GlobalKey _toastHostKey = GlobalKey(debugLabel: 'authGateToastHost');

  @override
  void initState() {
    super.initState();
    _hostEntry = OverlayEntry(
      // 每次构建都读最新的 widget.child，MaterialApp 重建时会传入新的 child
      builder: (_) => KeyedSubtree(key: _toastHostKey, child: widget.child),
    );
  }

  @override
  void didUpdateWidget(covariant AuthGateHost oldWidget) {
    super.didUpdateWidget(oldWidget);
    // child 是 MaterialApp 每次重建新给的实例，条目要重建才能跟上
    if (!identical(oldWidget.child, widget.child)) {
      _hostEntry?.markNeedsBuild();
    }
  }

  @override
  void dispose() {
    final entry = _hostEntry;
    _hostEntry = null;
    if (entry != null) {
      // 卸载顺序是“先子树、后父 State”，此处自建 Overlay 可能已经拆掉。
      // Overlay 未挂载时 remove() 只断开 entry 与 Overlay 的关联，不触发重建，
      // 因此可以无条件调用，之后才允许 dispose。
      entry.remove();
      entry.dispose();
    }
    super.dispose();
  }

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

    return Overlay(initialEntries: [_hostEntry!]);
  }

  Future<void> _runGate(AuthState auth) async {
    if (!mounted) return;
    final api = widget.api ?? AuthApi(auth.api);

    final VerificationStatus status;
    try {
      status = await api.fetchVerificationStatus();
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
    // 必须用自建 Overlay 条目里的 context：根 Navigator 自身的 context 上方没有
    // Overlay，拿它调 Overlay.of 会直接抛 “No Overlay widget found”。
    // Navigator 的 context 作为兜底（child 现在也挂在自建 Overlay 里）。
    final toastContext =
        _toastHostKey.currentContext ?? widget.navigatorKey.currentContext;
    if (toastContext == null || !toastContext.mounted) return;
    showAppToast(
      toastContext,
      '验证状态加载失败：${describeAuthError(error)}',
      type: ToastType.warning,
    );
  }
}
