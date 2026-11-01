import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/auth_provider.dart';
import '../../design/design.dart';
import 'data/evidence_api.dart';
import 'screens/evidence_detail_screen.dart';
import 'screens/evidence_submit_screen.dart';
import 'screens/wiki_draft_screen.dart';
import 'screens/wiki_screen.dart';
import 'services/attachment_picker.dart';
import 'services/evidence_draft_store.dart';
import 'services/voice_recorder.dart';

/// T05 材料提交与项目 AI 知识库路由。
///
/// 入口在人轴页（T04），本任务只提供路由：
/// - `axis-evidence-submit`  `/evidence/submit?nodeId=&projectId=&nodeTitle=`
/// - `axis-evidence-detail`  `/evidence/package/:packageId`
/// - `axis-wiki`             `/evidence/wiki?projectId=`
/// - `axis-wiki-draft`       `/evidence/wiki/draft/:draftId?projectId=`
/// - `axis-wiki-search`      `/evidence/wiki/search?projectId=`
final List<RouteBase> evidenceRoutes = [
  GoRoute(
    path: '/evidence/submit',
    name: 'axis-evidence-submit',
    builder: (context, state) {
      final projectId =
          _intParam(state, 'projectId') ?? context.authStateRead.currentProject?.id;
      final nodeId = _intParam(state, 'nodeId');
      return _ProjectGate(
        projectId: projectId,
        title: '提交证据材料',
        child: (resolvedProjectId) => EvidenceSubmitScreen(
          api: EvidenceApi(context.apiClient),
          userId: context.authStateRead.currentUser?.id ?? 0,
          userName: context.authStateRead.currentUser?.displayName ?? '当前用户',
          companyId: context.authStateRead.currentCompany?.id ?? 0,
          projectId: resolvedProjectId,
          nodeId: nodeId,
          initialNodeTitle: state.uri.queryParameters['nodeTitle'],
          attachmentPicker: const UnavailableAttachmentPicker(),
          voiceRecorder: const UnavailableVoiceRecorder(),
          draftStore: EvidenceDraftStore(),
        ),
      );
    },
  ),
  GoRoute(
    path: '/evidence/package/:packageId',
    name: 'axis-evidence-detail',
    builder: (context, state) {
      final packageId = int.tryParse(state.pathParameters['packageId'] ?? '') ?? 0;
      return EvidenceDetailScreen(
        api: EvidenceApi(context.apiClient),
        packageId: packageId,
        currentUserId: context.authStateRead.currentUser?.id,
      );
    },
  ),
  GoRoute(
    path: '/evidence/wiki',
    name: 'axis-wiki',
    builder: (context, state) {
      final projectId =
          _intParam(state, 'projectId') ?? context.authStateRead.currentProject?.id;
      return _ProjectGate(
        projectId: projectId,
        title: '项目知识',
        child: (resolvedProjectId) => WikiScreen(
          api: EvidenceApi(context.apiClient),
          projectId: resolvedProjectId,
          projectName: context.authStateRead.currentProject?.name ?? '当前项目',
        ),
      );
    },
  ),
  GoRoute(
    path: '/evidence/wiki/search',
    name: 'axis-wiki-search',
    builder: (context, state) {
      final projectId =
          _intParam(state, 'projectId') ?? context.authStateRead.currentProject?.id;
      return _ProjectGate(
        projectId: projectId,
        title: '项目知识',
        child: (resolvedProjectId) => WikiScreen(
          api: EvidenceApi(context.apiClient),
          projectId: resolvedProjectId,
          projectName: context.authStateRead.currentProject?.name ?? '当前项目',
          initialTab: WikiTab.search,
        ),
      );
    },
  ),
  GoRoute(
    path: '/evidence/wiki/draft/:draftId',
    name: 'axis-wiki-draft',
    builder: (context, state) {
      final projectId =
          _intParam(state, 'projectId') ?? context.authStateRead.currentProject?.id;
      final draftId = int.tryParse(state.pathParameters['draftId'] ?? '') ?? 0;
      return _ProjectGate(
        projectId: projectId,
        title: '知识草稿',
        child: (resolvedProjectId) => WikiDraftScreen(
          api: EvidenceApi(context.apiClient),
          projectId: resolvedProjectId,
          draftId: draftId,
        ),
      );
    },
  ),
];

int? _intParam(GoRouterState state, String key) {
  final raw = state.uri.queryParameters[key];
  if (raw == null || raw.trim().isEmpty) return null;
  return int.tryParse(raw.trim());
}

/// 未选择项目时给出可见的空状态，避免页面一直转圈
class _ProjectGate extends StatelessWidget {
  const _ProjectGate({
    required this.projectId,
    required this.child,
    required this.title,
  });

  final int? projectId;
  final Widget Function(int projectId) child;
  final String title;

  @override
  Widget build(BuildContext context) {
    final id = projectId;
    if (id == null || id <= 0) {
      return AppScaffold(
        title: title,
        body: AppEmptyState(
          title: '请先选择项目',
          description: '材料与项目知识都属于具体项目，请先在顶部切换到目标项目后重试。',
          icon: const AppIcon('file', size: 44, color: AppColors.primary),
          actionLabel: '返回',
          onAction: () => context.pop(),
        ),
      );
    }
    return child(id);
  }
}
