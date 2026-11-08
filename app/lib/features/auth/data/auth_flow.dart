import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_state.dart';
import '../auth_paths.dart';
import '../gate/auth_gate_host.dart';
import '../models/auth_models.dart';
import '../../projects/invite_link.dart';

/// 登录 / 注册成功后的统一收尾流程。
///
/// 步骤与网页版 `App.tsx` 一致：
/// 1. 保存 access / refresh 令牌到安全存储（T00 底座 `TokenStorage`）；
/// 2. `AuthState.bootstrap()` 加载用户、公司、项目（T00 已实现）；
/// 3. 进入验证门：验证门自己拉取 `/users/me/verification`，
///    邮箱已验证则立即放行到“工作”Tab，否则停留在验证页。
class AuthFlow {
  AuthFlow(this.authState);

  final AuthState authState;

  /// 保存令牌并加载会话，返回收尾后的登录态
  Future<AuthStatus> completeSignIn(AuthSession session) async {
    await authState.api.tokens.save(
      access: session.accessToken,
      refresh: session.refreshToken,
    );
    await authState.bootstrap();
    return authState.status;
  }

  /// 收尾后跳转：已登录进入验证门，其余状态交给全局路由守卫处理
  /// （断网 → `/offline`，未登录 → `/login`）。
  Future<void> completeSignInAndEnter(
    BuildContext context,
    AuthSession session,
  ) async {
    final status = await completeSignIn(session);
    if (!context.mounted) return;
    if (status == AuthStatus.authenticated) {
      // 本轮登录的验证门由这里负责，避免全局宿主重复跳转覆盖用户正在输入的表单
      final userId = authState.currentUser?.id.toString() ?? '';
      if (userId.isNotEmpty) AuthGateSession.markHandled(userId);

      if (session.projectId != null) {
        PendingInviteHolder.clear();
        authState.clearPendingInviteToken();
        context.go('/projects/${session.projectId}');
        return;
      }

      authState.rememberAppLocation(
          GoRouter.of(context).routeInformationProvider.value.uri.toString());
      context.go(AuthPaths.verifyLocation());
    }
  }
}
