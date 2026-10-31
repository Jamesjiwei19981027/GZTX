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
import '../features/projects/routes.dart';
import '../features/reports/routes.dart';
import '../features/work/routes.dart';

/// 全局应用路由配置与分 Tab 页面栈
class AppRouter {
  AppRouter({required this.authState});

  final AuthState authState;

  static final GlobalKey<NavigatorState> rootNavigatorKey =
      GlobalKey<NavigatorState>(debugLabel: 'rootNav');

  late final GoRouter router = GoRouter(
    navigatorKey: rootNavigatorKey,
    initialLocation: '/work',
    refreshListenable: authState,
    redirect: (context, state) {
      final isAuth = authState.isAuthenticated;
      final isAuthRoute = state.matchedLocation.startsWith('/login') ||
          state.matchedLocation.startsWith('/register') ||
          state.matchedLocation.startsWith('/verify');
      final isGallery = state.matchedLocation == '/gallery';

      // 允许自由访问控件展示页进行组件验证
      if (isGallery) return null;

      // 未登录且当前不在登录相关页面，重定向到登录页
      if (!isAuth && !isAuthRoute) {
        return '/login';
      }

      // 已登录却停留在登录页，重定向到工作页
      if (isAuth && isAuthRoute) {
        return '/work';
      }

      return null;
    },
    routes: [
      // 5 个主导航 Tab 的 StatefulShellRoute（各 Tab 独立导航栈）
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return AppScaffold(
            body: navigationShell,
            bottomNavigationBar: AppTabBar(
              currentIndex: navigationShell.currentIndex,
              onTap: (index) {
                navigationShell.goBranch(
                  index,
                  initialLocation: index == navigationShell.currentIndex,
                );
              },
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

      // 登录认证路由
      ...authRoutes,

      // 其他跨 Tab 页面路由
      ...projectsRoutes,
      ...evidenceRoutes,
      ...reportsRoutes,

      // 自适应控件展示调试页
      GoRoute(
        path: '/gallery',
        name: 'component-gallery',
        builder: (context, state) => const ComponentGalleryScreen(),
      ),
    ],
  );
}
