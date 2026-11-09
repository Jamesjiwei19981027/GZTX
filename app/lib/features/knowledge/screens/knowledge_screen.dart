import 'package:flutter/material.dart';
import 'dart:async';
import 'package:go_router/go_router.dart';

import '../../../design/design.dart';
import '../../../core/api/api_client.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/models/project.dart';
import '../../../core/media/native_voice_recorder.dart';
import '../controllers/personal_knowledge_controller.dart';
import '../controllers/project_knowledge_controller.dart';
import '../data/knowledge_repository.dart';
import '../data/voice_input.dart';
import '../widgets/knowledge_state_container.dart';
import 'personal_knowledge_view.dart';
import 'project_knowledge_view.dart';

/// 知识 Tab 根页：选项目 → 在“我的知识”和“项目知识”之间切换。
class KnowledgeScreen extends StatefulWidget {
  const KnowledgeScreen({super.key});

  @override
  State<KnowledgeScreen> createState() => _KnowledgeScreenState();
}

enum _KnowledgeTab { personal, project }

class _KnowledgeScreenState extends State<KnowledgeScreen> {
  _KnowledgeTab _tab = _KnowledgeTab.personal;
  KnowledgeRepository? _repository;
  PersonalKnowledgeController? _personal;
  ProjectKnowledgeController? _project;
  int? _projectId;
  int? _userId;
  ApiClient? _api;
  ApiVoiceTranscriber? _transcriber;
  NativeKnowledgeRecorder? _recorder;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final auth = context.authState;
    final project = auth.currentProject;
    final user = auth.currentUser;
    final api = auth.api;
    final projectId = project?.id;
    if (api == _api && projectId == _projectId && user?.id == _userId) return;
    _disposeControllers();
    _api = api;
    _projectId = projectId;
    _userId = user?.id;
    if (projectId == null || projectId <= 0) return;
    _repository = KnowledgeRepository(api);
    _transcriber = ApiVoiceTranscriber(api: api);
    _recorder = NativeKnowledgeRecorder();
    _personal = PersonalKnowledgeController(
      repository: _repository!,
      projectId: projectId,
      userId: user?.id ?? 0,
    )..load();
    _project = ProjectKnowledgeController(
      repository: _repository!,
      projectId: projectId,
    )..load();
  }

  void _disposeControllers() {
    _personal?.dispose();
    _project?.dispose();
    _personal = null;
    _project = null;
    _repository = null;
    _transcriber?.dispose();
    _transcriber = null;
    final recorder = _recorder;
    _recorder = null;
    if (recorder != null) {
      unawaited(recorder.dispose().catchError((Object error) {
        debugPrint('释放知识录音组件失败：$error');
      }));
    }
  }

  @override
  void dispose() {
    _disposeControllers();
    super.dispose();
  }

  Future<void> _chooseProject(List<Project> projects) async {
    final currentId = context.authStateRead.currentProject?.id;
    await showAppActionSheet(
      context: context,
      title: '选择项目',
      actions: [
        for (final project in projects)
          AppActionSheetItem(
            label:
                project.id == currentId ? '${project.name}（当前）' : project.name,
            onPressed: () => context.authStateRead.selectProject(project),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.authState;
    final projects = auth.projects;
    final project = auth.currentProject;
    final concrete = project != null &&
        project.id > 0 &&
        (projects.isEmpty || projects.any((item) => item.id == project.id));

    return AppScaffold(
      title: '知识',
      actions: [
        IconButton(
          tooltip: '问知识助手',
          onPressed:
              concrete ? () => context.pushNamed('knowledge-chat') : null,
          icon: const AppIcon('ai', size: 18),
        ),
      ],
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _projectBar(context, projects, project),
          if (!concrete)
            const Expanded(
              child: KnowledgeStateContainer(
                child: AppEmptyState(
                  title: '先选择一个项目',
                  description: '选择项目后，就能记录、整理和查找自己的知识',
                ),
              ),
            )
          else ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.sm,
                AppSpacing.lg,
                0,
              ),
              child: AppSegmentedControl<_KnowledgeTab>(
                segments: const {
                  _KnowledgeTab.personal: '我的知识',
                  _KnowledgeTab.project: '项目知识',
                },
                selectedValue: _tab,
                onValueChanged: (value) => setState(() => _tab = value),
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Expanded(
              child: _tab == _KnowledgeTab.personal
                  ? PersonalKnowledgeView(
                      controller: _personal!,
                      companyId: auth.currentCompany?.id ?? 0,
                      transcriber: _transcriber,
                      recorder: _recorder!,
                    )
                  : ProjectKnowledgeView(
                      controller: _project!,
                      onSavedToPersonal: () {
                        _personal?.load();
                        setState(() => _tab = _KnowledgeTab.personal);
                      },
                    ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _projectBar(
    BuildContext context,
    List<Project> projects,
    Project? project,
  ) {
    final isDark = isDarkMode(context);
    return InkWell(
      onTap: projects.isEmpty ? null : () => _chooseProject(projects),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.md,
        ),
        color: isDark ? AppColors.darkSurface : Colors.white,
        child: Row(
          children: [
            const AppIcon(
              'folder',
              size: 18,
            ),
            const SizedBox(width: AppSpacing.sm),
            Text(
              '当前项目',
              style: TextStyle(
                fontSize: 12,
                color: isDark
                    ? AppColors.darkTextSecondary
                    : AppColors.textSecondary,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                project?.name ?? '未选择项目',
                textAlign: TextAlign.right,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: isDark
                      ? AppColors.darkTextPrimary
                      : AppColors.textPrimary,
                ),
              ),
            ),
            if (projects.isNotEmpty)
              AppIcon(
                'chevron-down',
                size: 18,
                color: isDark
                    ? AppColors.darkTextTertiary
                    : AppColors.textTertiary,
              ),
          ],
        ),
      ),
    );
  }
}
