/// 项目概览
///
/// 网页真源：`MobileProjectScreens.tsx` 中的 `MobileProjectOverviewScreen`（09）。
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:worktodo_app/core/auth/auth_provider.dart';
import 'package:worktodo_app/core/time/time_utils.dart';
import 'package:worktodo_app/design/design.dart';

import '../data/projects_repository.dart';
import '../models/project_models.dart';
import '../widgets/project_error_view.dart';
import '../widgets/project_widgets.dart';
import 'project_settings_screen.dart';

class ProjectOverviewScreen extends StatefulWidget {
  const ProjectOverviewScreen({super.key, required this.projectId});

  final int projectId;

  @override
  State<ProjectOverviewScreen> createState() => _ProjectOverviewScreenState();
}

class _ProjectOverviewScreenState extends State<ProjectOverviewScreen> {
  bool _loading = true;
  Object? _error;

  ProjectDetail? _project;
  List<ProjectMember> _members = const [];
  ProjectPermissions? _permissions;
  Object? _permissionsError;

  bool _tasksLoading = true;
  Object? _tasksError;
  List<ProjectTask> _tasks = const [];

  /// 任务是否撞到分页安全上限（撞到就必须在界面上说明「仅显示前 N 条」）
  bool _tasksTruncated = false;
  int? _tasksTotal;

  int _loadSeq = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadAll());
  }

  @override
  void didUpdateWidget(ProjectOverviewScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.projectId == widget.projectId) return;
    // go_router 复用同一个页面状态（如 /projects/11 → /projects/12），
    // 必须清掉上一个项目的展示数据并按新 ID 重新加载，否则会出现
    // 「看到 11 的标题/任务/权限，操作却指向 12」的串项目。
    setState(() {
      _project = null;
      _members = const [];
      _permissions = null;
      _permissionsError = null;
      _tasks = const [];
      _tasksError = null;
      _tasksTruncated = false;
      _tasksTotal = null;
      _tasksLoading = true;
      _loading = true;
      _error = null;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _loadAll();
    });
  }

  ProjectsRepository get _repo => ProjectsRepository(context.authStateRead.api);

  Future<void> _loadAll() async {
    final seq = ++_loadSeq;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final detail = await _repo.fetchProject(widget.projectId);
      final members = await _repo.fetchMembers(widget.projectId);
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _project = detail;
        _members = members;
        _loading = false;
      });
      await _loadPermissions(seq);
      await _loadTasks(seq);
    } catch (error) {
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _loading = false;
        _error = error;
      });
    }
  }

  Future<void> _loadPermissions(int seq) async {
    try {
      final permissions = await _repo.fetchPermissions(widget.projectId);
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _permissions = permissions;
        _permissionsError = null;
      });
    } catch (error) {
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _permissions = null;
        _permissionsError = error;
      });
    }
  }

  Future<void> _loadTasks(int seq) async {
    setState(() {
      _tasksLoading = true;
      _tasksError = null;
    });
    try {
      final tasks = await _repo.fetchProjectTasks(widget.projectId);
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _tasks = tasks.tasks;
        _tasksTruncated = tasks.truncated;
        _tasksTotal = tasks.total;
        _tasksLoading = false;
      });
    } catch (error) {
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _tasksLoading = false;
        _tasksError = error;
      });
    }
  }

  void _openProjectScoped(String routeName) {
    final project = _project;
    final auth = context.authStateRead;
    if (project != null) {
      final matched =
          auth.projects.where((item) => item.id == project.id).toList();
      if (matched.isNotEmpty) auth.selectProject(matched.first);
    }
    context.pushNamed(routeName);
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: _project?.name ?? '项目概览',
      actions: [
        GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () async {
            final projectId = widget.projectId;
            await Navigator.of(context).push(MaterialPageRoute<void>(
                builder: (_) => ProjectSettingsScreen(projectId: projectId)));
            if (mounted && projectId == widget.projectId) _loadAll();
          },
          child: const Padding(
            padding: EdgeInsets.symmetric(horizontal: 12),
            child: AppIcon('settings', size: 20),
          ),
        ),
      ],
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppLoading(size: 26),
            SizedBox(height: AppSpacing.md),
            Text(
              '正在载入项目详情…',
              style: TextStyle(fontSize: 14, color: AppColors.textSecondary),
            ),
          ],
        ),
      );
    }

    if (_error != null) {
      return ProjectErrorView(
        error: _error!,
        onRetry: _loadAll,
        onBack: () => Navigator.of(context).maybePop(),
      );
    }

    final project = _project;
    if (project == null) {
      return AppEmptyState(
        title: '无法载入项目',
        description: '项目不存在或无权限访问',
        actionLabel: '返回',
        onAction: () => Navigator.of(context).maybePop(),
      );
    }

    final canInvite = _permissions?.canInviteMembers ?? false;

    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.lg,
        AppSpacing.lg,
        AppSpacing.xxxl,
      ),
      children: [
        if (_permissionsError != null) ...[
          InfoBanner(
            message:
                '权限信息加载失败（${projectErrorMessage(_permissionsError!)}），管理入口暂不可用。',
            tone: InfoBannerTone.warning,
            icon: 'alert',
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        if (canInvite) ...[
          _buildInviteEntry(),
          const SizedBox(height: AppSpacing.lg),
        ],
        _buildProjectCard(project),
        const SizedBox(height: AppSpacing.lg),
        _buildTasksSection(),
        const SizedBox(height: AppSpacing.lg),
        _buildKanbanSection(),
        const SizedBox(height: AppSpacing.lg),
        _buildNavigationSection(),
      ],
    );
  }

  Widget _buildInviteEntry() {
    return InkWell(
      onTap: () => context.push('/projects/${widget.projectId}/invite'),
      borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.lg,
        ),
        decoration: BoxDecoration(
          color: AppColors.primary,
          borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        ),
        child: const Row(
          children: [
            AppIcon('team', size: 22, color: Colors.white),
            SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '邀请新成员加入',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                  SizedBox(height: AppSpacing.xs),
                  Text(
                    '添加项目成员，共同推进任务',
                    style: TextStyle(fontSize: 12, color: Color(0xFFD7E3F7)),
                  ),
                ],
              ),
            ),
            AppIcon('chevron-right', size: 18, color: Colors.white),
          ],
        ),
      ),
    );
  }

  Widget _buildProjectCard(ProjectDetail project) {
    // 后端 member_count 只统计未退出成员；接口缺失时按成员列表中的现任成员兜底
    final activeMembers = _members.where((member) => member.isActive).length;
    final memberCount = project.memberCount ?? activeMembers;
    return SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ProjectAvatar(text: project.name, size: 48),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      project.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Wrap(
                      spacing: AppSpacing.sm,
                      runSpacing: AppSpacing.xs,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        ProjectChip(
                          label: project.statusLabel,
                          tone: project.isArchived
                              ? ProjectChipTone.neutral
                              : ProjectChipTone.success,
                        ),
                        Text(
                          '成员 $memberCount 人',
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.textTertiary,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (project.finalOwnerName != null) ...[
            const SizedBox(height: AppSpacing.md),
            Divider(
              height: 1,
              color: isDarkMode(context)
                  ? AppColors.darkBorder
                  : AppColors.borderLight,
            ),
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                const Expanded(
                  child: Text(
                    '项目终责负责人',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ),
                Text(
                  project.finalOwnerName!,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: isDarkMode(context)
                        ? AppColors.darkTextPrimary
                        : AppColors.textPrimary,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildTasksSection() {
    return SectionCard(
      title: '项目任务待办 · ${_tasks.length}',
      trailing: InlineTextButton(
        label: '管理任务',
        onPressed: () => _openProjectScoped('work-tasks'),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_tasksTruncated) ...[
            _buildTruncatedNotice(what: '任务'),
            const SizedBox(height: AppSpacing.sm),
          ],
          _buildTaskBody(),
        ],
      ),
    );
  }

  /// 撞到分页安全上限时的显式提示：不能把「前 N 条」当成全部任务展示
  Widget _buildTruncatedNotice({required String what}) {
    final total = _tasksTotal;
    final totalText = total == null ? '' : '（共 $total 条）';
    return Text(
      '仅显示前 ${_tasks.length} 条$what$totalText，完整数据请到任务列表查看。',
      style: const TextStyle(fontSize: 12, color: AppColors.warning),
    );
  }

  Widget _buildTaskBody() {
    if (_tasksLoading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Text(
          '正在加载全部项目任务…',
          style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
        ),
      );
    }
    if (_tasksError != null) {
      return InkWell(
        onTap: () => _loadTasks(_loadSeq),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
          child: Text(
            '${projectErrorMessage(_tasksError!)}，点击重试',
            style: const TextStyle(fontSize: 13, color: AppColors.danger),
          ),
        ),
      );
    }
    if (_tasks.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Text(
          '当前项目暂无任务',
          style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
        ),
      );
    }
    return Column(
      children: [
        for (var index = 0; index < _tasks.length; index++) ...[
          if (index > 0)
            Divider(
              height: 1,
              color: isDarkMode(context)
                  ? AppColors.darkBorder
                  : AppColors.borderLight,
            ),
          _TaskRow(
            task: _tasks[index],
            onTap: () => context.pushNamed('work-task-detail',
                pathParameters: {'id': '${_tasks[index].id}'}),
          ),
        ],
      ],
    );
  }

  Widget _buildKanbanSection() {
    const columns = [
      (ProjectTask.statusTodo, '待办'),
      (ProjectTask.statusInProgress, '进行中'),
      (ProjectTask.statusDone, '已完成'),
    ];
    return SectionCard(
      title: '任务看板',
      trailing: InlineTextButton(
        label: '管理看板',
        onPressed: () => _openProjectScoped('work-kanban'),
      ),
      child: _tasksLoading
          ? const Text(
              '正在加载看板…',
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            )
          : _tasksError != null
              ? InkWell(
                  onTap: () => _loadTasks(_loadSeq),
                  child: Text(
                    '${projectErrorMessage(_tasksError!)}，点击重试',
                    style: const TextStyle(
                      fontSize: 13,
                      color: AppColors.danger,
                    ),
                  ),
                )
              : Column(
                  children: [
                    for (final column in columns) ...[
                      _buildKanbanColumn(column.$1, column.$2),
                      if (column != columns.last)
                        const SizedBox(height: AppSpacing.sm),
                    ],
                    if (_tasksTruncated) ...[
                      const SizedBox(height: AppSpacing.sm),
                      _buildTruncatedNotice(what: '任务'),
                    ],
                  ],
                ),
    );
  }

  Widget _buildKanbanColumn(int status, String label) {
    final isDark = isDarkMode(context);
    final items =
        _tasks.where((task) => task.status == status).toList(growable: false);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$label · ${items.length}',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: isDark
                  ? AppColors.darkTextSecondary
                  : AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          if (items.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: AppSpacing.xs),
              child: Text(
                '暂无任务',
                style: TextStyle(fontSize: 12, color: AppColors.textTertiary),
              ),
            )
          else
            for (final task in items)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xs),
                child: InkWell(
                  onTap: () => context.pushNamed('work-task-detail',
                      pathParameters: {'id': '${task.id}'}),
                  borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.sm,
                      vertical: AppSpacing.sm,
                    ),
                    decoration: BoxDecoration(
                      color: isDark ? AppColors.darkSurface : Colors.white,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                      border: Border.all(
                        color: isDark ? AppColors.darkBorder : AppColors.border,
                      ),
                    ),
                    child: Text(
                      task.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 13),
                    ),
                  ),
                ),
              ),
        ],
      ),
    );
  }

  Widget _buildNavigationSection() {
    return AppListSection(
      header: '协同导航',
      margin: EdgeInsets.zero,
      children: [
        AppListTile(
          leading: const AppIcon('work', size: 20, color: AppColors.primary),
          title: '任务待办',
          subtitle: '查看与分配当前项目的全部事项',
          onTap: () => _openProjectScoped('work-tasks'),
        ),
        AppListTile(
          leading: const AppIcon('kanban', size: 20, color: AppColors.warning),
          title: '任务看板',
          subtitle: '按状态轻触流转事项进度',
          onTap: () => _openProjectScoped('work-kanban'),
        ),
        AppListTile(
          leading: const AppIcon('axis', size: 20, color: Color(0xFF8B5CF6)),
          title: '人轴责任链',
          subtitle: '直属领导、下属人员责任拓扑与汇报关系',
          onTap: () => _openProjectScoped('axis-root'),
        ),
        AppListTile(
          leading: const AppIcon('file', size: 20, color: Color(0xFF6366F1)),
          title: '项目知识空间',
          subtitle: '共享知识、授权总结与个人知识沉淀',
          onTap: () => _openProjectScoped('knowledge-root'),
        ),
      ],
    );
  }
}

class _TaskRow extends StatelessWidget {
  const _TaskRow({required this.task, required this.onTap});

  final ProjectTask task;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final dueLabel = apiDateToLocalKey(task.dueDate);
    final subtitle = dueLabel.isEmpty
        ? task.assigneeSummary
        : '${task.assigneeSummary} · $dueLabel';
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: AppIcon(
                task.isDone ? 'check-circle' : 'work',
                size: 18,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    task.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      decoration: task.isDone
                          ? TextDecoration.lineThrough
                          : TextDecoration.none,
                      color: task.isDone
                          ? AppColors.textTertiary
                          : (isDarkMode(context)
                              ? AppColors.darkTextPrimary
                              : AppColors.textPrimary),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xxs),
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textTertiary,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Text(
              task.statusLabel,
              style:
                  const TextStyle(fontSize: 12, color: AppColors.textTertiary),
            ),
          ],
        ),
      ),
    );
  }
}
