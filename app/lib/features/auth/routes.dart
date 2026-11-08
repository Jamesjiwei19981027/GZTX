import 'package:go_router/go_router.dart';

import 'auth_paths.dart';
import 'screens/login_screen.dart';
import 'screens/register_screen.dart';
import 'screens/verify_screen.dart';

/// T01 登录注册模块路由。
///
/// - `/login`：登录页（公开）
/// - `/login/register`：注册页（登录页子路由，返回键回登录页）
/// - `/register`：旧外壳使用过的注册路径，保留重定向避免旧链接失效
/// - `/verify`：验证门（**不是公开路由**，必须已登录才能进入）
final List<RouteBase> authRoutes = [
  GoRoute(
    path: AuthPaths.login,
    name: 'auth-login',
    builder: (context, state) => const LoginScreen(),
    routes: [
      GoRoute(
        path: 'register',
        name: 'auth-register',
        builder: (context, state) => RegisterScreen(
          inviteToken: state.uri.queryParameters['invite'] ??
              state.uri.queryParameters['token'],
        ),
      ),
    ],
  ),
  GoRoute(
    path: AuthPaths.legacyRegister,
    name: 'auth-register-legacy',
    redirect: (context, state) => AuthPaths.register,
  ),
  GoRoute(
    path: AuthPaths.verify,
    name: 'auth-verify',
    builder: (context, state) => VerifyScreen(
      required: AuthPaths.parseRequirement(
        state.uri.queryParameters['required'],
      ),
    ),
  ),
];

/// 公开（未登录可访问）的认证路径，供全局路由守卫使用。
///
/// 只包含登录与注册：验证门 `/verify` 需要登录态，因此**不能**放进白名单
/// （T00 的守卫会把已登录用户从白名单页面送回 `/work`，放进去会导致验证门永远打不开）。
List<String> get authRoutePaths =>
    const [AuthPaths.login, AuthPaths.legacyRegister];

/// 动态判断某个 location 是否属于认证公开路由
bool isAuthRouteLocation(String location) {
  for (final path in authRoutePaths) {
    if (location == path || location.startsWith('$path/')) {
      return true;
    }
  }
  return false;
}
