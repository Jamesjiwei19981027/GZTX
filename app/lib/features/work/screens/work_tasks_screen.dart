/// 我的任务列表（work-tasks）。
///
/// 对应网页 `mobile/features/tasks/MobileTaskScreens.tsx` 的 `MobileMyTasksScreen`
/// 与 `components/TaskWorkspaceToolbar.tsx`：视图切换、范围切换、搜索与筛选、
/// 批量完成 / 顺延 / 删除、逐项勾选完成。
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_provider.dart';
import '../../../core/auth/auth_state.dart';
import '../../../design/design.dart';
import '../data/work_api.dart';
import '../data/work_models.dart';
import '../data/work_scope.dart';
import '../widgets/work_widgets.dart';

class WorkTasksScreen extends StatefulWidget {
  const WorkTasksScreen({
    super.key,
    this.api,
    this.authState,
    this.initialScope = TaskWorkspaceScope.all,
  });

  final WorkApi? api;
  final AuthState? authState;
  final TaskWorkspaceScope initialScope;

  @override
  State<WorkTasksScreen> createState() => _WorkTasksScreenState();
}

class _WorkTasksScreenState extends State<WorkTasksScreen> {
  AuthState? _auth;
  bool _bootstrapped = false;

  List<WorkTask> _tasks = const [];
  bool _loading = true;
  Object? _error;

  late TaskWorkspaceScope _scope = widget.initialScope;
  TaskStatusFilter _status = TaskStatusFilter.all;
  TaskPriorityFilter _priority = TaskPriorityFilter.all;
  final TextEditingController _searchController = TextEditingController();
  String _search = '';

  bool _batchMode = false;
  final Set<int> _selected = {};
  bool _busy = false;

  WorkApi get _api =>
      widget.api ??
      WorkApi((_auth ?? widget.authState ?? context.read<AuthState>()).api);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final auth = widget.authState ?? _tryReadAuth();
    if (_auth != auth) {
      _auth?.removeListener(_onAuthChanged);
      _auth = auth;
      _auth?.addListener(_onAuthChanged);
    }
    if (_bootstrapped) return;
    _bootstrapped = true;
    _load();
  }

  AuthState? _tryReadAuth() {
    try {
      return context.read<AuthState>();
    } catch (_) {
      return null;
    }
  }

  void _onAuthChanged() {
    if (mounted) setState(() {});
  }

  @override
  void didUpdateWidget(covariant WorkTasksScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialScope != widget.initialScope) {
      setState(() {
        _scope = widget.initialScope;
        _selected.clear();
      });
    }
  }

  @override
  void dispose() {
    _auth?.removeListener(_onAuthChanged);
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
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
        _selected.clear();
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  int? get _selectedProjectId => (_auth ?? widget.authState)?.currentProject?.id;

  List<WorkTask> get _projectTasks =>
      filterTasksByProject(_tasks, _selectedProjectId);

  List<WorkTask> get _visibleTasks {
    final scoped = filterTaskWorkspace(_projectTasks, _scope);
    return filterTaskList(
      scoped,
      status: _status,
      priority: _priority,
      search: _search,
    );
  }

  Future<void> _toggleTask(WorkTask task) async {
    if (task.isAxisLocked) {
      showAppToast(context, '该事项由人轴责任节点同步，请在责任节点中更新进度',
          type: ToastType.warning);
      return;
    }
    try {
      if (task.isDone) {
        await _api.uncompleteTask(task.id);
      } else {
        await _api.completeTask(task.id);
      }
      if (!mounted) return;
      await _load();
    } catch (error) {
      if (!mounted) return;
      showAppToast(context, describeError(error).message, type: ToastType.error);
    }
  }

  Future<void> _runBatch(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
      if (!mounted) return;
      setState(() {
        _busy = false;
        _batchMode = false;
        _selected.clear();
      });
      await _load();
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = false);
      showAppToast(context, describeError(error).message, type: ToastType.error);
    }
  }

  Future<void> _batchComplete() =>
      _runBatch(() => _api.batchComplete(_selected.toList()));

  Future<void> _batchDelete() async {
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: '批量删除任务',
      message: '选中的 ${_selected.length} 项任务将移入回收站，30 天后自动清除，期间可恢复。',
      confirmLabel: '移入回收站',
      isDestructive: true,
    );
    if (!confirmed || !mounted) return;
    await _runBatch(() => _api.batchDelete(_selected.toList()));
  }

  Future<void> _batchReschedule() async {
    final initial = TaskTime.parseLocalDay(TaskTime.todayKey())!;
    final picked = await showAppDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(initial.year - 2),
      lastDate: DateTime(initial.year + 5),
    );
    if (picked == null || !mounted) return;
    final target = TaskTime.localDateKey(picked);
    final selectedTasks =
        _tasks.where((task) => _selected.contains(task.id)).toList();
    await _runBatch(() async {
      for (final task in selectedTasks) {
        if (task.isAxisLocked) continue;
        final targetDueIso = TaskTime.toApiDueDate(target, task.dueTime);
        await _api.updateTask(task.id, {'due_date': targetDueIso});
      }
    });
  }

  void _toggleSelectAll() {
    final visible = _visibleTasks;
    setState(() {
      if (_selected.length == visible.length) {
        _selected.clear();
      } else {
        _selected
          ..clear()
          ..addAll(visible.map((task) => task.id));
      }
    });
  }

  Future<void> _openTask(WorkTask task) async {
    if (_batchMode) {
      setState(() {
        if (!_selected.remove(task.id)) _selected.add(task.id);
      });
      return;
    }
    await context.push('/work/task/${task.id}');
    if (!mounted) return;
    await _load();
  }

  void _switchView(String view) {
    if (view == 'tasks') return;
    context.pushReplacement('/work/kanban?scope=${_scope.queryValue}');
  }

  @override
  Widget build(BuildContext context) {
    final visible = _visibleTasks;
    final allSelected =
        visible.isNotEmpty && _selected.length == visible.length;

    return AppScaffold(
      title: '我的任务',
      actions: [
        TextButton(
          onPressed: () => setState(() {
            _batchMode = !_batchMode;
            _selected.clear();
          }),
          child: Text(_batchMode ? '退出批量' : '批量操作'),
        ),
      ],
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.sm,
              AppSpacing.lg,
              0,
            ),
            child: Column(
              children: [
                AppSegmentedControl<String>(
                  segments: const {'kanban': '任务看板', 'tasks': '任务列表'},
                  selectedValue: 'tasks',
                  onValueChanged: _switchView,
                ),
                const SizedBox(height: AppSpacing.sm),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonHideUnderline(
                        child: DropdownButton<TaskWorkspaceScope>(
                          value: _scope,
                          isExpanded: true,
                          items: TaskWorkspaceScope.values
                              .map(
                                (scope) => DropdownMenuItem(
                                  value: scope,
                                  child: Text(
                                    scope.label,
                                    style: const TextStyle(fontSize: 13),
                                  ),
                                ),
                              )
                              .toList(),
                          onChanged: (value) {
                            if (value == null) return;
                            setState(() {
                              _scope = value;
                              _selected.clear();
                            });
                          },
                        ),
                      ),
                    ),
                    TextButton.icon(
                      onPressed: () async {
                        await context.push('/work/trash');
                        if (!mounted) return;
                        await _load();
                      },
                      icon: const AppIcon('trash', size: 16),
                      label: const Text('回收站'),
                    ),
                  ],
                ),
                AppTextField(
                  controller: _searchController,
                  placeholder: '搜索事项标题…',
                  prefix: const AppIcon('search', size: 18),
                  onChanged: (value) => setState(() => _search = value),
                ),
                const SizedBox(height: AppSpacing.sm),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.sm,
                    children: [
                      for (final status in TaskStatusFilter.values)
                        WorkFilterChip(
                          label: status == TaskStatusFilter.all
                              ? '全部 (${_projectTasks.length})'
                              : status.label,
                          selected: _status == status,
                          onTap: () => setState(() => _status = status),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                Align(
                  alignment: Alignment.centerLeft,
                  child: PopupMenuButton<TaskPriorityFilter>(
                    initialValue: _priority,
                    onSelected: (value) => setState(() => _priority = value),
                    itemBuilder: (context) => TaskPriorityFilter.values
                        .map(
                          (value) => PopupMenuItem(
                            value: value,
                            child: Text(value.label),
                          ),
                        )
                        .toList(),
                    child: Container(
                      constraints: const BoxConstraints(minHeight: 34),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 7,
                      ),
                      decoration: BoxDecoration(
                        borderRadius:
                            BorderRadius.circular(AppSpacing.radiusFull),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const AppIcon('filter', size: 14),
                          const SizedBox(width: 4),
                          Text(
                            _priority.label,
                            style: const TextStyle(fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (_batchMode)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.sm,
                AppSpacing.lg,
                0,
              ),
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.sm,
              ),
              decoration: BoxDecoration(
                color: const Color(0xFFEAF2FE),
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              ),
              child: Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  TextButton(
                    onPressed: _toggleSelectAll,
                    child: Text(allSelected ? '取消全选' : '全选本页'),
                  ),
                  Text(
                    '已选 ${_selected.length} 项',
                    style: const TextStyle(fontSize: 12),
                  ),
                  AppButton(
                    label: '完成',
                    size: AppButtonSize.sm,
                    onPressed: _busy || _selected.isEmpty ? null : _batchComplete,
                  ),
                  AppButton(
                    label: '顺延',
                    size: AppButtonSize.sm,
                    variant: AppButtonVariant.secondary,
                    onPressed:
                        _busy || _selected.isEmpty ? null : _batchReschedule,
                  ),
                  AppButton(
                    label: '删除',
                    size: AppButtonSize.sm,
                    variant: AppButtonVariant.danger,
                    onPressed: _busy || _selected.isEmpty ? null : _batchDelete,
                  ),
                ],
              ),
            ),
          const SizedBox(height: AppSpacing.sm),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _load,
              child: WorkStateContainer(
                isLoading: _loading && _tasks.isEmpty,
                error: _error,
                onRetry: _load,
                loadingLabel: '正在载入任务…',
                child: visible.isEmpty
                    ? ListView(
                        children: [
                          AppEmptyState(
                            title: '暂无匹配事项',
                            description: '可调整筛选条件或新建待办',
                            icon: const AppIcon('work', size: 40),
                            actionLabel: '新建任务',
                            onAction: () => context.push('/work/task-edit'),
                          ),
                        ],
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(
                          AppSpacing.lg,
                          0,
                          AppSpacing.lg,
                          AppSpacing.xxxl,
                        ),
                        itemCount: visible.length,
                        separatorBuilder: (_, __) =>
                            const Divider(height: 0.5, thickness: 0.5),
                        itemBuilder: (context, index) {
                          final task = visible[index];
                          return Container(
                            color: _selected.contains(task.id)
                                ? const Color(0xFFEFF5FF)
                                : null,
                            child: WorkTaskTile(
                              task: task,
                              onTap: () => _openTask(task),
                              onToggle:
                                  _batchMode ? null : () => _toggleTask(task),
                              showChevron: !_batchMode,
                              subtitle: Row(
                                children: [
                                  if (_batchMode)
                                    Padding(
                                      padding: const EdgeInsets.only(right: 8),
                                      child: Icon(
                                        _selected.contains(task.id)
                                            ? Icons.check_box
                                            : Icons.check_box_outline_blank,
                                        size: 20,
                                        color: _selected.contains(task.id)
                                            ? AppColors.primary
                                            : AppColors.textTertiary,
                                      ),
                                    ),
                                  Expanded(
                                    child: WorkTaskMeta(task: task),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
