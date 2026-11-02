import 'package:go_router/go_router.dart';
import '../../core/media/system_media.dart';

import 'invite_link.dart';
import 'screens/invite_accept_screen.dart';
import 'screens/member_detail_screen.dart';
import 'screens/project_create_screen.dart';
import 'screens/project_invite_screen.dart';
import 'screens/project_overview_screen.dart';
import 'screens/project_settings_screen.dart';
import 'screens/project_switch_screen.dart';
import 'screens/team_screen.dart';

/// 屏幕标识（对齐 `frontend/src/mobile/navigation/mobileRoutes.ts` 的 REGISTERED_SCREENS）
const String projectSwitchScreenName = 'project-switch';
const String projectCreateScreenName = 'project-create';
const String companyCreateScreenName = 'company-create';
const String projectOverviewScreenName = 'project-overview';
const String projectSettingsScreenName = 'project-settings';
const String projectInviteScreenName = 'project-invite';
const String inviteAcceptScreenName = 'invite-accept';
const String teamScreenName = 'me-team';
const String memberDetailScreenName = 'me-member-detail';

/// 静态路径必须写在 `/projects/:id` 之前，否则 `:id` 会先吃掉 `create` / `switch`
/// 这类固定片段。
final List<RouteBase> projectsRoutes = [
  GoRoute(
    path: '/projects/switch',
    name: projectSwitchScreenName,
    builder: (context, state) => const ProjectSwitchScreen(),
  ),
  GoRoute(
    path: '/projects/create',
    name: projectCreateScreenName,
    builder: (context, state) => const ProjectCreateScreen(),
  ),
  GoRoute(
    path: '/projects/company/create',
    name: companyCreateScreenName,
    builder: (context, state) => const ProjectCreateScreen(
      initialMode: WorkspaceCreateMode.company,
    ),
  ),
  GoRoute(
    path: '/projects/invite/accept',
    name: inviteAcceptScreenName,
    builder: (context, state) => InviteAcceptScreen(
      initialToken: state.uri.queryParameters['token'] ??
          state.uri.queryParameters['invite'],
    ),
  ),
  GoRoute(
    path: '/projects/:id',
    name: projectOverviewScreenName,
    builder: (context, state) => ProjectOverviewScreen(
      projectId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
    ),
    routes: [
      GoRoute(
        path: 'settings',
        name: projectSettingsScreenName,
        builder: (context, state) => ProjectSettingsScreen(
          projectId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
        ),
      ),
      GoRoute(
        path: 'invite',
        name: projectInviteScreenName,
        builder: (context, state) => ProjectInviteScreen(
          projectId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
          onShare: SystemMedia.shareInvite,
        ),
      ),
      GoRoute(
        path: 'team',
        name: teamScreenName,
        builder: (context, state) => TeamScreen(
          projectId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
        ),
        routes: [
          GoRoute(
            path: ':userId',
            name: memberDetailScreenName,
            builder: (context, state) => MemberDetailScreen(
              projectId: int.tryParse(state.pathParameters['id'] ?? '') ?? 0,
              userId: int.tryParse(state.pathParameters['userId'] ?? '') ?? 0,
            ),
          ),
        ],
      ),
    ],
  ),
];

/// 深链接入口复用的地址构造（T10 注册系统链接时直接复用）
String projectsInviteAcceptLink(String token) => inviteAcceptLocation(token);
