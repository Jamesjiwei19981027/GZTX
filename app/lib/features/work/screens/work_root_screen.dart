/// 工作 Tab 根页（work-root）。
///
/// 对应网页 `mobile/features/work/MobileWorkScreens.tsx` 的
/// `MobileWorkbenchScreen`：当前用户与项目、重点待办与跟进、AI 汇报入口、
/// 待办统计卡、任务趋势、日程日历与项目进度简介。
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_provider.dart';
import '../../../core/errors/app_error.dart';
import '../../../core/models/project.dart';
import '../../../core/models/user.dart';
import '../../../design/design.dart';
import '../../../router/app_destination.dart';
import '../data/work_api.dart';
import '../data/work_models.dart';
import '../data/work_scope.dart';
import '../widgets/work_home_sections.dart';
import '../widgets/work_trend_card.dart';
import '../widgets/work_widgets.dart';

class WorkRootScreen extends StatefulWidget {
  const WorkRootScreen({super.key, this.api, this.authState});

  /// 测试注入；为空时从 `AuthState` 读取。
  final WorkApi? api;
  final AuthState? authState;

  @override
  State<WorkRootScreen> createState() => _WorkRootScreenState();
}

class _WorkRootScreenState extends State<WorkRootScreen> {
  AuthState? _auth;
  AuthStatus? _lastAuthStatus;
  int? _observedProjectId;
  bool _bootstrapped = false;

  List<WorkTask> _tasks = const [];
  bool _loading = true;
  Object? _error;

  List<ProjectProgressSummary> _progress = const [];
  bool _progressLoading = true;
  Set<int> _progressFailures = const {};

  String _selectedDay = TaskTime.todayKey();
  late DateTime _displayMonth = TaskTime.parseLocalDay(_selectedDay) ??
      DateTime(DateTime.now().year, DateTime.now().month);
  int _reloadToken = 0;
  int _progressToken = 0;

  WorkApi get _api {
    if (widget.api != null) return widget.api!;
    final auth = _auth ?? _tryReadAuth();
    if (auth != null) return WorkApi(auth.api);
    return WorkApi(context.read<AuthState>().api);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final auth = widget.authState ?? _tryReadAuth();
    if (_auth != auth) {
      _auth?.removeListener(_onAuthChanged);
      _auth = auth;
      _auth?.addListener(_onAuthChanged);
    }
    _checkAndLoad();
  }

  @override
  void dispose() {
    _auth?.removeListener(_onAuthChanged);
    super.dispose();
  }

  void _onAuthChanged() {
    _checkAndLoad();
  }

  void _checkAndLoad() {
    final auth = _auth;
    if (auth != null) {
      if (auth.status == AuthStatus.authenticating) {
        // 登录态正在初始化中，绝不发起请求，避免 401 冲刷本地 token
        return;
      }
      if (auth.status != AuthStatus.authenticated) {
        if (_loading || _progressLoading) {
          setState(() {
            _loading = false;
            _progressLoading = false;
          });
        }
        return;
      }

      final currentProjectId = auth.currentProject?.id;
      final statusChanged = _lastAuthStatus != auth.status;
      final projectChanged = _observedProjectId != currentProjectId;
      _lastAuthStatus = auth.status;
      _observedProjectId = currentProjectId;

      if (!_bootstrapped || statusChanged) {
        _bootstrapped = true;
        _loadAll();
      } else if (projectChanged) {
        _loadAll();
      }
      return;
    }

    if (!_bootstrapped) {
      _bootstrapped = true;
      _loadAll();
    }
  }

  AuthState? _tryReadAuth() {
    try {
      return context.read<AuthState>();
    } catch (_) {
      return null;
    }
  }

  Future<void> _loadAll() async {
    await Future.wait([_loadTasks(), _loadProgress()]);
  }

  Future<void> _loadTasks() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await _api.listAllTasks();
      if (!mounted) return;
      setState(() {
        _tasks = items;
        _loading = false;
        _reloadToken++;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  List<Project> get _progressTargets {
    final auth = _auth;
    if (auth == null) return const [];
    final current = auth.currentProject;
    if (current != null) return [current];
    return auth.projects;
  }

  Future<void> _loadProgress() async {
    final token = ++_progressToken;
    final targets = _progressTargets;
    if (!mounted) return;
    if (targets.isEmpty) {
      setState(() {
        _progress = const [];
        _progressLoading = false;
        _progressFailures = const {};
      });
      return;
    }
    setState(() {
      _progressLoading = true;
      _progressFailures = const {};
    });
    final items = <ProjectProgressSummary>[];
    final failures = <int>{};
    for (final project in targets) {
      try {
        final summary = await _api.projectProgress(
          projectId: project.id,
          projectName: project.name,
        );
        if (!mounted || token != _progressToken) return;
        items.add(summary);
      } catch (_) {
        if (!mounted || token != _progressToken) return;
        failures.add(project.id);
        items.add(ProjectProgressSummary(
          projectId: project.id,
          projectName: project.name,
        ));
      }
    }
    if (!mounted || token != _progressToken) return;
    setState(() {
      _progress = items;
      _progressFailures = failures;
      _progressLoading = false;
    });
  }

  Future<void> _navigateTo(AppDestination target) async {
    await target.push(context);
    if (!mounted) return;
    await _loadAll();
  }

  Future<void> _navigate(String path) async {
    await context.push(path);
    if (!mounted) return;
    await _loadAll();
  }

  Future<void> _toggleTask(WorkTask task) async {
    if (task.isAxisLocked) {
      showAppToast(
        context,
        '该事项由人轴责任节点同步，请在责任节点中更新进度',
        type: ToastType.warning,
      );
      return;
    }
    try {
      if (task.isDone) {
        await _api.uncompleteTask(task.id);
      } else {
        await _api.completeTask(task.id);
      }
      if (!mounted) return;
      await _loadTasks();
    } catch (error) {
      if (!mounted) return;
      final message =
          error is AuthException ? '登录已过期，请重新登录' : describeError(error).message;
      showAppToast(context, message, type: ToastType.error);
    }
  }

  void _selectDay(String day) {
    setState(() {
      _selectedDay = day;
      final parsed = TaskTime.parseLocalDay(day);
      if (parsed != null) {
        _displayMonth = DateTime(parsed.year, parsed.month);
      }
    });
  }

  void _moveMonth(int delta) {
    setState(() {
      final next = DateTime(_displayMonth.year, _displayMonth.month + delta);
      _displayMonth = next;
      _selectedDay = TaskTime.localDateKey(next);
    });
  }

  void _openNewTaskOn(String day) {
    _navigate('/work/task-edit?date=$day');
  }

  Future<void> _openMoreActions() async {
    await showAppActionSheet(
      context: context,
      title: '更多工作台',
      actions: [
        AppActionSheetItem(
          label: '我的任务',
          icon: const AppIcon('work', size: 18),
          onPressed: () => _navigate('/work/tasks'),
        ),
        AppActionSheetItem(
          label: '工作看板',
          icon: const AppIcon('kanban', size: 18),
          onPressed: () => _navigate('/work/kanban'),
        ),
        AppActionSheetItem(
          label: '任务统计',
          icon: const AppIcon('stats', size: 18),
          onPressed: () => _navigate('/work/statistics'),
        ),
        AppActionSheetItem(
          label: '回收站',
          icon: const AppIcon('trash', size: 18),
          onPressed: () => _navigate('/work/trash'),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final user =
        widget.authState == null ? context.currentUser : _auth?.currentUser;
    final project = widget.authState == null
        ? context.currentProject
        : _auth?.currentProject;
    final scopedTasks = filterTasksByProject(_tasks, project?.id);
    final focus = focusTasks(scopedTasks);
    final counts = summaryCounts(scopedTasks);
    final total = pendingCount(scopedTasks);

    return AppScaffold(
      title: '工作',
      actions: [
        IconButton(
          tooltip: '全局搜索',
          onPressed: () => _navigate('/work/search'),
          icon: const AppIcon('search', size: 20),
        ),
        IconButton(
          tooltip: '更多',
          onPressed: _openMoreActions,
          icon: const AppIcon('more-horizontal', size: 20),
        ),
      ],
      body: RefreshIndicator(
        onRefresh: _loadAll,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.md,
            AppSpacing.lg,
            AppSpacing.xxxl,
          ),
          children: [
            _Header(
              user: user,
              project: project,
              onSwitchProject: () =>
                  _navigateTo(const AppDestination('project-switch')),
            ),
            const SizedBox(height: AppSpacing.md),
            WorkStateContainer(
              isLoading: _loading && _tasks.isEmpty,
              error: _error,
              onRetry: _loadAll,
              loadingLabel: '正在同步工作台…',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  WorkSection(
                    title: '重点待办与跟进',
                    footer: total > 5 ? '显示前 5 项待办，共 $total 项' : null,
                    padding: EdgeInsets.zero,
                    child: focus.isEmpty
                        ? const WorkEmptyHint(text: '暂无待办事项')
                        : Column(
                            children: [
                              for (var i = 0; i < focus.length; i++) ...[
                                WorkTaskTile(
                                  task: focus[i],
                                  onTap: () =>
                                      _navigate('/work/task/${focus[i].id}'),
                                  onToggle: () => _toggleTask(focus[i]),
                                ),
                                if (i < focus.length - 1)
                                  const Divider(height: 0.5, thickness: 0.5),
                              ],
                            ],
                          ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _AssistantEntry(
                    onProgress: () =>
                        _navigateTo(const AppDestination('ai-chat')),
                    onReports: () =>
                        _navigateTo(const AppDestination('ai-root')),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  _SummaryCards(
                    pending: counts.pending,
                    dueToday: counts.dueToday,
                    overdue: counts.overdue,
                    onTap: (scope) =>
                        _navigate('/work/kanban?scope=${scope.queryValue}'),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  WorkTrendCard(
                    api: _api,
                    projectId: project?.id,
                    reloadToken: _reloadToken,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  WorkHomeCalendar(
                    tasks: scopedTasks,
                    selectedDay: _selectedDay,
                    displayMonth: _displayMonth,
                    onSelectDay: _selectDay,
                    onDoubleTapDay: _openNewTaskOn,
                    onToday: () {
                      final today = TaskTime.todayKey();
                      _selectDay(today);
                      setState(() {
                        final parsed = TaskTime.parseLocalDay(today)!;
                        _displayMonth = DateTime(parsed.year, parsed.month);
                      });
                    },
                    onMoveMonth: _moveMonth,
                    onOpenFullCalendar: () => _navigate('/work/calendar'),
                    onOpenNewTaskWithDate: _openNewTaskOn,
                    onOpenTask: (task) => _navigate('/work/task/${task.id}'),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  WorkProjectProgressSection(
                    items: _progress,
                    loading: _progressLoading,
                    failures: _progressFailures,
                    onRetry: _loadProgress,
                    onOpenProject: (id) => _navigateTo(AppDestination(
                        'project-overview',
                        pathParameters: {'id': '$id'})),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  AppButton(
                    label: '新建任务',
                    isFullWidth: true,
                    size: AppButtonSize.lg,
                    icon: const AppIcon('plus', size: 18, color: Colors.white),
                    onPressed: () => _openNewTaskOn(_selectedDay),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.user,
    required this.project,
    required this.onSwitchProject,
  });

  final User? user;
  final Project? project;
  final VoidCallback onSwitchProject;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final name = user?.displayName ?? '未登录用户';
    final initial = name.isEmpty ? '用' : name.substring(0, 1);
    return Row(
      children: [
        Container(
          width: 40,
          height: 40,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: AppColors.primaryLight,
            shape: BoxShape.circle,
          ),
          child: Text(
            initial,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: AppColors.primary,
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: isDark
                      ? AppColors.darkTextPrimary
                      : AppColors.textPrimary,
                ),
              ),
              InkWell(
                onTap: onSwitchProject,
                borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const AppIcon('folder', size: 14),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          project?.name ?? '未选择项目',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 12,
                            color: isDark
                                ? AppColors.darkTextSecondary
                                : AppColors.textSecondary,
                          ),
                        ),
                      ),
                      const SizedBox(width: 2),
                      const AppIcon('chevron-right', size: 14),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _AssistantEntry extends StatelessWidget {
  const _AssistantEntry({required this.onProgress, required this.onReports});

  final VoidCallback onProgress;
  final VoidCallback onReports;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : const Color(0xFFEAF2FE),
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : const Color(0xFFC9DCFB),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const AppIcon('ai', size: 18, color: AppColors.primary),
              const SizedBox(width: AppSpacing.sm),
              Text(
                'AI 汇报与助手',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: isDark
                      ? AppColors.darkTextPrimary
                      : AppColors.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '记录进展与材料，整理后沿人轴汇报给直属领导',
            style: TextStyle(
              fontSize: 12,
              height: 1.4,
              color: isDark
                  ? AppColors.darkTextSecondary
                  : AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.md,
            runSpacing: AppSpacing.sm,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              AppButton(
                label: '告诉 AI 最新进展',
                size: AppButtonSize.sm,
                onPressed: onProgress,
              ),
              TextButton(onPressed: onReports, child: const Text('查看汇报')),
            ],
          ),
        ],
      ),
    );
  }
}

class _SummaryCards extends StatelessWidget {
  const _SummaryCards({
    required this.pending,
    required this.dueToday,
    required this.overdue,
    required this.onTap,
  });

  final int pending;
  final int dueToday;
  final int overdue;
  final ValueChanged<TaskWorkspaceScope> onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final cards = [
      (label: '待办事项', value: pending, scope: TaskWorkspaceScope.pending),
      (label: '今日到期', value: dueToday, scope: TaskWorkspaceScope.today),
      (label: '已逾期', value: overdue, scope: TaskWorkspaceScope.overdue),
    ];
    return Row(
      children: [
        for (var i = 0; i < cards.length; i++) ...[
          if (i > 0) const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: InkWell(
              onTap: () => onTap(cards[i].scope),
              borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
              child: Container(
                constraints: const BoxConstraints(minHeight: 78),
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.sm,
                  vertical: AppSpacing.md,
                ),
                decoration: BoxDecoration(
                  color: isDark ? AppColors.darkSurface : Colors.white,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
                  border: Border.all(
                    color: isDark ? AppColors.darkBorder : AppColors.border,
                  ),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      cards[i].label,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 11,
                        color: isDark
                            ? AppColors.darkTextSecondary
                            : AppColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${cards[i].value}',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        color: isDark
                            ? const Color(0xFF9EC5FF)
                            : AppColors.primary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}
