import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_provider.dart';
import '../../core/models/project.dart';
import 'screens/agent_chat_screen.dart';
import 'screens/leadership_report_screen.dart';
import 'screens/project_report_screen.dart';
import 'screens/report_detail_screen.dart';
import 'screens/report_editor_screen.dart';
import 'screens/report_hub_screen.dart';
import 'screens/report_inbox_screen.dart';
import 'screens/report_review_screen.dart';
import 'widgets/report_ui.dart';

/// T07 AI 汇报模块路由。
///
/// 屏幕名严格沿用网页版 `mobileRoutes.ts` 的 `REGISTERED_SCREENS`：
/// - `ai-root`              `/reports`
/// - `ai-chat`              `/reports/chat`
/// - `ai-report-create`     `/reports/create`
/// - `ai-report-submitted`  `/reports/submitted/:id`
/// - `ai-report-detail`     `/reports/detail?reportId=`
/// - `ai-inbox`             `/reports/inbox`
/// - `ai-review-followup`   `/reports/review/followup`
/// - `ai-review-conflict`   `/reports/review/conflict`
/// - `ai-project-contrast`  `/reports/project/contrast`
/// - `ai-project-aggregate` `/reports/project/aggregate`
/// - `ai-leadership`        `/reports/leadership`
/// - `ai-agent-bindings`    `/reports/bindings`
///
/// 页面统一从 `projectId` 查询参数取项目，缺省回退到全局当前项目；
/// 参数变化时页面自身重新加载，避免同一路由换项目后仍显示旧数据。
final List<RouteBase> reportsRoutes = [
  GoRoute(
    path: '/reports',
    name: 'ai-root',
    builder: (context, state) => ReportHubScreen(
      projectId: _projectId(context, state),
      projectName: _projectName(context, state),
      projects: _projects(context),
      onSelectProject: (option) => _selectProject(context, state, option),
    ),
    routes: [
      GoRoute(
        path: 'chat',
        name: 'ai-chat',
        builder: (context, state) => AgentChatScreen(
          projectId: _projectId(context, state),
          projectName: _projectName(context, state),
          projects: _projects(context),
          onSelectProject: (option) => _selectProject(context, state, option),
        ),
      ),
      GoRoute(
        path: 'create',
        name: 'ai-report-create',
        builder: (context, state) => ReportEditorScreen(
          projectId: _projectId(context, state),
          projectName: _projectName(context, state),
          projects: _projects(context),
          onSelectProject: (option) => _selectProject(context, state, option),
          initialDraftReportId: _intParam(state, 'draftReportId'),
        ),
      ),
      GoRoute(
        path: 'submitted/:id',
        name: 'ai-report-submitted',
        builder: (context, state) => ReportDetailScreen(
          projectId: _projectId(context, state),
          projectName: _projectName(context, state),
          reportId: _intPath(state, 'id'),
          mode: ReportDetailMode.submitted,
        ),
      ),
      GoRoute(
        path: 'detail',
        name: 'ai-report-detail',
        builder: (context, state) => ReportDetailScreen(
          projectId: _projectId(context, state),
          projectName: _projectName(context, state),
          reportId: _intParam(state, 'reportId'),
          fromManager: state.uri.queryParameters['fromManager'] == '1',
          mode: ReportDetailMode.history,
        ),
      ),
      GoRoute(
        path: 'inbox',
        name: 'ai-inbox',
        builder: (context, state) => ReportInboxScreen(
          projectId: _projectId(context, state),
          projectName: _projectName(context, state),
          projects: _projects(context),
          onSelectProject: (option) => _selectProject(context, state, option),
        ),
      ),
      GoRoute(
        path: 'review/followup',
        name: 'ai-review-followup',
        builder: (context, state) => ReportReviewScreen(
          projectId: _projectId(context, state),
          projectName: _projectName(context, state),
          mode: ReportReviewMode.followup,
        ),
      ),
      GoRoute(
        path: 'review/conflict',
        name: 'ai-review-conflict',
        builder: (context, state) => ReportReviewScreen(
          projectId: _projectId(context, state),
          projectName: _projectName(context, state),
          mode: ReportReviewMode.conflict,
        ),
      ),
      GoRoute(
        path: 'project/contrast',
        name: 'ai-project-contrast',
        builder: (context, state) => ProjectReportScreen(
          projectId: _projectId(context, state),
          projectName: _projectName(context, state),
          mode: ProjectReportMode.contrast,
        ),
      ),
      GoRoute(
        path: 'project/aggregate',
        name: 'ai-project-aggregate',
        builder: (context, state) => ProjectReportScreen(
          projectId: _projectId(context, state),
          projectName: _projectName(context, state),
          mode: ProjectReportMode.aggregate,
        ),
      ),
      GoRoute(
        path: 'leadership',
        name: 'ai-leadership',
        builder: (context, state) => const LeadershipReportScreen(),
      ),
      GoRoute(
        path: 'bindings',
        name: 'ai-agent-bindings',
        builder: (context, state) => ReportReviewScreen(
          projectId: _projectId(context, state),
          projectName: _projectName(context, state),
          mode: ReportReviewMode.bindings,
        ),
      ),
    ],
  ),
];

int? _intParam(GoRouterState state, String key) {
  final raw = state.uri.queryParameters[key];
  if (raw == null || raw.trim().isEmpty) return null;
  return int.tryParse(raw.trim());
}

int? _intPath(GoRouterState state, String key) {
  final raw = state.pathParameters[key];
  if (raw == null || raw.trim().isEmpty) return null;
  return int.tryParse(raw.trim());
}

int? _projectId(BuildContext context, GoRouterState state) {
  final explicit = _intParam(state, 'projectId');
  if (explicit != null && explicit > 0) return explicit;
  final current = context.authStateRead.currentProject?.id;
  return current != null && current > 0 ? current : null;
}

String? _projectName(BuildContext context, GoRouterState state) {
  final effectiveId = _projectId(context, state);
  if (effectiveId == null) return null;
  final auth = context.authStateRead;
  for (final project in auth.projects) {
    if (project.id == effectiveId) return project.name;
  }
  if (auth.currentProject?.id == effectiveId) {
    return auth.currentProject?.name;
  }
  return null;
}

List<ProjectOption> _projects(BuildContext context) {
  final auth = context.authStateRead;
  final current = auth.currentProject;
  final options = <ProjectOption>[];
  for (final project in auth.projects) {
    if (project.id > 0) {
      options.add(ProjectOption(id: project.id, name: project.name));
    } else if (current != null && project.id == current.id && current.id > 0) {
      options.add(ProjectOption(id: current.id, name: current.name));
    }
  }
  if (options.isEmpty && current != null && current.id > 0) {
    options.add(ProjectOption(id: current.id, name: current.name));
  }
  return options;
}

void _selectProject(
  BuildContext context,
  GoRouterState state,
  ProjectOption option,
) {
  Project? target;
  for (final project in context.authStateRead.projects) {
    if (project.id == option.id) {
      target = project;
      break;
    }
  }
  if (target != null) {
    context.authStateRead.selectProject(target);
  }
  final newParams = Map<String, String>.from(state.uri.queryParameters);
  newParams['projectId'] = '${option.id}';
  newParams.remove('draftReportId');
  final newUri = state.uri.replace(queryParameters: newParams);
  GoRouter.of(context).go(newUri.toString());
}
