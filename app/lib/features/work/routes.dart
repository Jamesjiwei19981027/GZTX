import 'package:go_router/go_router.dart';
import '../../router/app_destination.dart';

import 'data/work_scope.dart';
import 'screens/work_calendar_screen.dart';
import 'screens/work_chat_extract_screen.dart';
import 'screens/work_kanban_screen.dart';
import 'screens/work_quick_add_screen.dart';
import 'screens/work_root_screen.dart';
import 'screens/work_search_screen.dart';
import 'screens/work_statistics_screen.dart';
import 'screens/work_task_detail_screen.dart';
import 'screens/work_task_edit_screen.dart';
import 'screens/work_tasks_screen.dart';
import 'screens/work_trash_screen.dart';

int? _queryInt(GoRouterState state, String key) =>
    int.tryParse(state.uri.queryParameters[key] ?? '');

/// T02 工作模块路由表（Tab 0）。
///
/// 屏幕标识与 `REGISTERED_SCREENS.work` 严格对齐：
/// - work-root
/// - work-tasks
/// - work-kanban
/// - work-calendar
/// - work-statistics
/// - work-trash
/// - work-task-detail
/// - work-task-edit
/// - work-quick-add
/// - work-search
/// - work-chat-extract
final List<RouteBase> workRoutes = [
  GoRoute(
    path: '/work',
    name: 'work-root',
    builder: (context, state) => const WorkRootScreen(),
    routes: [
      GoRoute(
        path: 'tasks',
        name: 'work-tasks',
        builder: (context, state) => WorkTasksScreen(
          initialScope: TaskWorkspaceScope.fromQuery(
            state.uri.queryParameters['scope'],
          ),
        ),
      ),
      GoRoute(
        path: 'kanban',
        name: 'work-kanban',
        builder: (context, state) => WorkKanbanScreen(
          initialScope: TaskWorkspaceScope.fromQuery(
            state.uri.queryParameters['scope'],
          ),
        ),
      ),
      GoRoute(
        path: 'calendar',
        name: 'work-calendar',
        builder: (context, state) => WorkCalendarScreen(
          initialDay: state.uri.queryParameters['date'],
        ),
      ),
      GoRoute(
        path: 'statistics',
        name: 'work-statistics',
        builder: (context, state) => WorkStatisticsScreen(
          initialPeriod: state.uri.queryParameters['period'] ?? 'week',
        ),
      ),
      GoRoute(
        path: 'trash',
        name: 'work-trash',
        builder: (context, state) => const WorkTrashScreen(),
      ),
      GoRoute(
        path: 'task/:id',
        name: 'work-task-detail',
        builder: (context, state) {
          final id = int.tryParse(state.pathParameters['id'] ?? '') ?? 0;
          return WorkTaskDetailScreen(taskId: id);
        },
        routes: [
          GoRoute(
            path: 'edit',
            name: 'work-task-edit-nested',
            builder: (context, state) {
              final id = int.tryParse(state.pathParameters['id'] ?? '') ?? 0;
              return WorkTaskEditScreen(taskId: id);
            },
          ),
        ],
      ),
      GoRoute(
        path: 'task-edit',
        name: 'work-task-edit',
        builder: (context, state) => WorkTaskEditScreen(
          taskId: _queryInt(state, 'id'),
          initialDate: state.uri.queryParameters['date'],
          initialStatus: _queryInt(state, 'status'),
          initialDraft:
              state.extra is TaskDraft ? state.extra as TaskDraft : null,
        ),
      ),
      GoRoute(
        path: 'quick-add',
        name: 'work-quick-add',
        builder: (context, state) => WorkQuickAddScreen(
          initialDate: state.uri.queryParameters['date'],
        ),
      ),
      GoRoute(
        path: 'search',
        name: 'work-search',
        builder: (context, state) => const WorkSearchScreen(),
      ),
      GoRoute(
        path: 'chat-extract',
        name: 'work-chat-extract',
        builder: (context, state) => WorkChatExtractScreen(
          initialText: state.uri.queryParameters['text'],
        ),
      ),
    ],
  ),
];
