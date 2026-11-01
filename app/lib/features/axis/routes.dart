import 'package:go_router/go_router.dart';

import 'screens/axis_audit_screen.dart';
import 'screens/axis_delegations_screen.dart';
import 'screens/axis_edit_responsibility_screen.dart';
import 'screens/axis_node_detail_screen.dart';
import 'screens/axis_progress_screen.dart';
import 'screens/axis_root_screen.dart';

int? _queryInt(GoRouterState state, String key) =>
    int.tryParse(state.uri.queryParameters[key] ?? '');

int? _projectIdOf(GoRouterState state) => _queryInt(state, 'projectId');

/// T04 人轴路由（Tab 1）
///
/// 路由名与网页 `mobileRoutes.ts` 的 screen id 对齐：
/// axis-root、axis-person-detail、axis-node-detail、axis-edit-responsibility、
/// axis-progress、axis-delegations、axis-audit。
final List<RouteBase> axisRoutes = [
  GoRoute(
    path: '/axis',
    name: 'axis-root',
    builder: (context, state) => const AxisRootScreen(),
    routes: [
      GoRoute(
        path: 'person/:id',
        name: 'axis-person-detail',
        builder: (context, state) => AxisNodeDetailScreen(
          nodeId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
          projectId: _projectIdOf(state),
        ),
      ),
      GoRoute(
        path: 'node/:id',
        name: 'axis-node-detail',
        builder: (context, state) => AxisNodeDetailScreen(
          nodeId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
          projectId: _projectIdOf(state),
        ),
      ),
      GoRoute(
        path: 'person/:id/edit',
        name: 'axis-edit-responsibility',
        builder: (context, state) => AxisEditResponsibilityScreen(
          personId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
          projectId: _projectIdOf(state),
        ),
      ),
      GoRoute(
        path: 'node/:id/progress',
        name: 'axis-progress',
        builder: (context, state) => AxisProgressScreen(
          nodeId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
          projectId: _projectIdOf(state),
        ),
      ),
      GoRoute(
        path: 'delegations',
        name: 'axis-delegations',
        builder: (context, state) => const AxisDelegationsScreen(),
      ),
      GoRoute(
        path: 'audit',
        name: 'axis-audit',
        builder: (context, state) => const AxisAuditScreen(),
      ),
    ],
  ),
];
