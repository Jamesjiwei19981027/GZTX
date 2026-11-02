import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/auth/auth_state.dart';
import '../design/design.dart';
import '../design/gallery/component_gallery_screen.dart';
import '../features/auth/routes.dart';
import '../features/axis/routes.dart';
import '../features/evidence/routes.dart';
import '../features/knowledge/routes.dart';
import '../features/me/routes.dart';
import '../features/messages/routes.dart';
import '../features/messages/widgets/notification_badge_host.dart';
import '../features/projects/routes.dart';
import '../features/reports/routes.dart';
import '../features/work/routes.dart';
import 'offline_screen.dart';
import 'app_links.dart';

/// 全局应用路由配置与分 Tab 页面栈
class AppRouter {
  AppRouter({required this.authState, this.initialLocation = '/work'});

  final AuthState authState;
  final String initialLocation;

  static final GlobalKey<NavigatorState> rootNavigatorKey =
      GlobalKey<NavigatorState>(debugLabel: 'rootNav');

  late final GoRouter router = GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: initialLocation,
    refreshListenable: authState,
    redirect: (context, state) {
      final normalized = normalizeAppLink(state.uri);
      if (normalized != null && normalized != state.uri.toString()) {
        return normalized;
      }
      final isGallery = state.matchedLocation == '/gallery';
      // 允许自由访问控件展示页进行组件验证
      if (isGallery) return null;

      final isAuthRoute = isAuthRouteLocation(state.matchedLocation);
      final isOfflineRoute = state.matchedLocation == '/offline';

      // 1. 断网或无法连接服务端：重定向至离线兜底页
      if (authState.status == AuthStatus.offline) {
        authState.rememberAppLocation(state.uri.toString());
        if (!isOfflineRoute) return '/offline';
        return null;
      }

      // 2. 初始启动中与认证中：留在原地不闪跳登录页
      if (authState.status == AuthStatus.initial ||
          authState.status == AuthStatus.authenticating) {
        return null;
      }

      // 3. 未登录状态：不在认证相关页面则重定向到登录页
      if (authState.status == AuthStatus.unauthenticated) {
        if (!isAuthRoute) {
          authState.rememberAppLocation(state.uri.toString());
          return '/login';
        }
        return null;
      }

      // 4. 已登录状态：若停留在登录相关页面或离线页，重定向到主工作页
      if (authState.isAuthenticated) {
        if (isAuthRoute || isOfflineRoute) {
          return authState.takeAppLocation() ?? '/work';
        }
      }

      return null;
    },
    routes: [
      // 5 个主导航 Tab 的 StatefulShellRoute（各 Tab 独立导航栈）
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return NotificationBadgeHost(
            auth: authState,
            builder: (context, poller) => AppScaffold(
              body: navigationShell,
              bottomNavigationBar:
                  Column(mainAxisSize: MainAxisSize.min, children: [
                if (poller.error != null)
                  TextButton(
                      onPressed: poller.refresh,
                      child: Text('${poller.error} · 点此重试',
                          style: const TextStyle(fontSize: 12))),
                AppTabBar(
                  unreadMessagesCount: poller.count,
                  currentIndex: navigationShell.currentIndex,
                  onTap: (index) {
                    // 原生平台习惯：再点一次当前 Tab 回到该 Tab 根页
                    navigationShell.goBranch(
                      index,
                      initialLocation: index == navigationShell.currentIndex,
                    );
                  },
                ),
              ]),
            ),
          );
        },
        branches: [
          // Tab 0: 工作
          StatefulShellBranch(routes: workRoutes),
          // Tab 1: 人轴
          StatefulShellBranch(routes: axisRoutes),
          // Tab 2: 知识
          StatefulShellBranch(routes: knowledgeRoutes),
          // Tab 3: 消息
          StatefulShellBranch(routes: messagesRoutes),
          // Tab 4: 我的
          StatefulShellBranch(routes: meRoutes),
        ],
      ),

      // 登录认证路由（动态由 features/auth/routes.dart 提供）
      ...authRoutes,

      // 其他跨 Tab 页面路由
      ...projectsRoutes,
      ...evidenceRoutes,
      ...reportsRoutes,

      // 断网离线兜底页
      GoRoute(
        path: '/offline',
        name: 'app-offline',
        builder: (context, state) => OfflineScreen(authState: authState),
      ),

      // 自适应控件展示调试页
      GoRoute(
        path: '/gallery',
        name: 'component-gallery',
        builder: (context, state) => const ComponentGalleryScreen(),
      ),
    ],
  );
}
