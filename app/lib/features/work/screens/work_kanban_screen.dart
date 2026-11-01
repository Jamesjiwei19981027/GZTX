/// 工作看板（work-kanban）。
///
/// 对应网页 `MobileKanbanScreen` 与 `components/views/KanbanView.tsx`：
/// 三列状态、长按拖动改状态（带触感反馈），并提供「移动状态」菜单作为替代操作。
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_provider.dart';
import '../../../core/auth/auth_state.dart';
import '../../../design/design.dart';
import '../data/work_api.dart';
import '../data/work_models.dart';
import '../data/work_scope.dart';
import '../widgets/work_widgets.dart';

class WorkKanbanScreen extends StatefulWidget {
  const WorkKanbanScreen({
    super.key,
    this.api,
    this.authState,
    this.initialScope = TaskWorkspaceScope.all,
  });

  final WorkApi? api;
  final AuthState? authState;
  final TaskWorkspaceScope initialScope;

  @override
  State<WorkKanbanScreen> createState() => _WorkKanbanScreenState();
}

class _WorkKanbanScreenState extends State<WorkKanbanScreen> {
  bool _bootstrapped = false;

  List<WorkTask> _tasks = const [];
  bool _loading = true;
  Object? _error;
  late TaskWorkspaceScope _scope = widget.initialScope;
  int? _movingTaskId;

  WorkApi get _api => widget.api ?? WorkApi(context.read<AuthState>().api);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_bootstrapped) return;
    _bootstrapped = true;
    _load();
  }

  @override
  void didUpdateWidget(covariant WorkKanbanScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialScope != widget.initialScope) {
      setState(() => _scope = widget.initialScope);
    }
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await _api.listTasks(pageSize: 100);
      if (!mounted) return;
      setState(() {
        _tasks = page.items;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  Future<void> _move(WorkTask task, int status) async {
    if (task.status == status) return;
    if (task.isAxisLocked) {
      showAppToast(context, '该事项由人轴责任节点同步，不能在看板直接改状态',
          type: ToastType.warning);
      return;
    }
    HapticFeedback.lightImpact();
    setState(() => _movingTaskId = task.id);
    try {
      await _api.updateTask(task.id, {'status': status});
      if (!mounted) return;
      await _load();
    } catch (error) {
      if (!mounted) return;
      showAppToast(context, describeError(error).message, type: ToastType.error);
    } finally {
      if (mounted) setState(() => _movingTaskId = null);
    }
  }

  void _switchView(String view) {
    if (view == 'kanban') return;
    context.pushReplacement('/work/tasks?scope=${_scope.queryValue}');
  }

  @override
  Widget build(BuildContext context) {
    final scoped = filterTaskWorkspace(_tasks, _scope);
    final isDark = isDarkMode(context);

    return AppScaffold(
      title: '工作看板',
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.sm,
              AppSpacing.lg,
              AppSpacing.sm,
            ),
            child: Column(
              children: [
                AppSegmentedControl<String>(
                  segments: const {'kanban': '任务看板', 'tasks': '任务列表'},
                  selectedValue: 'kanban',
                  onValueChanged: _switchView,
                ),
                const SizedBox(height: AppSpacing.sm),
                Align(
                  alignment: Alignment.centerLeft,
                  child: Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: AppSpacing.sm,
                    children: TaskWorkspaceScope.values
                        .map(
                          (scope) => WorkFilterChip(
                            label: scope.label,
                            selected: _scope == scope,
                            onTap: () => setState(() => _scope = scope),
                          ),
                        )
                        .toList(),
                  ),
                ),
              ],
            ),
          ),
          Text(
            '长按卡片可拖到其它状态列，松手即保存',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 11,
              color: isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Expanded(
            child: WorkStateContainer(
              isLoading: _loading,
              error: _error,
              onRetry: _load,
              loadingLabel: '正在载入看板…',
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final columnWidth = (constraints.maxWidth < 680)
                      ? 220.0
                      : ((constraints.maxWidth - AppSpacing.lg * 2 - AppSpacing.sm * 2) / 3)
                          .clamp(220.0, 360.0);
                  return SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.lg,
                      0,
                      AppSpacing.lg,
                      AppSpacing.lg,
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        for (final entry in kanbanColumns.entries) ...[
                          SizedBox(
                            width: columnWidth,
                            child: _Column(
                              status: entry.key,
                              title: entry.value,
                              tasks: scoped
                                  .where((task) => task.status == entry.key)
                                  .toList(),
                              movingTaskId: _movingTaskId,
                              onDropTask: (taskId, targetStatus) {
                                for (final task in _tasks) {
                                  if (task.id == taskId) {
                                    _move(task, targetStatus);
                                    return;
                                  }
                                }
                              },
                              onOpenTask: (task) async {
                                await context.push('/work/task/${task.id}');
                                if (!mounted) return;
                                await _load();
                              },
                              onMoveTask: _move,
                              onCreate: () => context.push('/work/task-edit'),
                            ),
                          ),
                          if (entry.key != kanbanColumns.keys.last)
                            const SizedBox(width: AppSpacing.sm),
                        ],
                      ],
                    ),
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Column extends StatelessWidget {
  const _Column({
    required this.status,
    required this.title,
    required this.tasks,
    required this.movingTaskId,
    required this.onDropTask,
    required this.onOpenTask,
    required this.onMoveTask,
    required this.onCreate,
  });

  final int status;
  final String title;
  final List<WorkTask> tasks;
  final int? movingTaskId;
  final void Function(int taskId, int status) onDropTask;
  final ValueChanged<WorkTask> onOpenTask;
  final void Function(WorkTask task, int status) onMoveTask;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return DragTarget<int>(
      onWillAcceptWithDetails: (details) => true,
      onAcceptWithDetails: (details) => onDropTask(details.data, status),
      builder: (context, candidate, rejected) {
        return AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          decoration: BoxDecoration(
            color: candidate.isNotEmpty
                ? (isDark ? const Color(0xFF23324A) : const Color(0xFFEAF2FE))
                : (isDark ? AppColors.darkSurface : const Color(0xFFF6F7F9)),
            borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
            border: Border.all(
              color: candidate.isNotEmpty
                  ? AppColors.primary
                  : (isDark ? AppColors.darkBorder : AppColors.border),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.md,
                  AppSpacing.md,
                  AppSpacing.md,
                  AppSpacing.sm,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: isDark
                              ? AppColors.darkTextPrimary
                              : AppColors.textPrimary,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 1,
                      ),
                      decoration: BoxDecoration(
                        color: isDark
                            ? AppColors.darkSurfaceVariant
                            : Colors.white,
                        borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                      ),
                      child: Text(
                        '${tasks.length}',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: isDark
                              ? AppColors.darkTextSecondary
                              : AppColors.textSecondary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: tasks.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(AppSpacing.md),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                '暂无「$title」事项',
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: AppColors.textTertiary,
                                ),
                              ),
                              const SizedBox(height: AppSpacing.sm),
                              AppButton(
                                label: '在此状态新建',
                                size: AppButtonSize.sm,
                                variant: AppButtonVariant.secondary,
                                onPressed: onCreate,
                              ),
                            ],
                          ),
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(
                          AppSpacing.sm,
                          0,
                          AppSpacing.sm,
                          AppSpacing.sm,
                        ),
                        itemCount: tasks.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: AppSpacing.sm),
                        itemBuilder: (context, index) {
                          final task = tasks[index];
                          return LongPressDraggable<int>(
                            data: task.id,
                            onDragStarted: HapticFeedback.mediumImpact,
                            feedback: Material(
                              color: Colors.transparent,
                              child: SizedBox(
                                width: 200,
                                child: _KanbanCard(task: task, dragging: true),
                              ),
                            ),
                            childWhenDragging: Opacity(
                              opacity: 0.35,
                              child: _KanbanCard(task: task),
                            ),
                            child: _KanbanCard(
                              task: task,
                              busy: movingTaskId == task.id,
                              onTap: () => onOpenTask(task),
                              onMove: (next) => onMoveTask(task, next),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _KanbanCard extends StatelessWidget {
  const _KanbanCard({
    required this.task,
    this.onTap,
    this.onMove,
    this.busy = false,
    this.dragging = false,
  });

  final WorkTask task;
  final VoidCallback? onTap;
  final ValueChanged<int>? onMove;
  final bool busy;
  final bool dragging;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final otherStatuses = kanbanColumns.keys.where((key) => key != task.status);
    return Material(
      color: isDark ? AppColors.darkSurfaceVariant : Colors.white,
      borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
            border: Border.all(
              color: isDark ? AppColors.darkBorder : AppColors.border,
            ),
            boxShadow: dragging
                ? [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.18),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ]
                : null,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                task.title,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  height: 1.35,
                  color: task.isDone
                      ? (isDark ? AppColors.darkTextTertiary : AppColors.textTertiary)
                      : (isDark ? AppColors.darkTextPrimary : AppColors.textPrimary),
                  decoration: task.isDone ? TextDecoration.lineThrough : null,
                ),
              ),
              if (task.description != null && task.description!.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  task.description!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 11,
                    height: 1.4,
                    color: isDark
                        ? AppColors.darkTextSecondary
                        : AppColors.textSecondary,
                  ),
                ),
              ],
              const SizedBox(height: 6),
              Wrap(
                spacing: 4,
                runSpacing: 2,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    task.dueDate ?? '无截止日',
                    style: TextStyle(
                      fontSize: 11,
                      color: task.isOverdue
                          ? AppColors.danger
                          : (isDark
                              ? AppColors.darkTextTertiary
                              : AppColors.textTertiary),
                    ),
                  ),
                  WorkPriorityBadge(priority: task.priority),
                ],
              ),
              if (onMove != null && !task.isAxisLocked) ...[
                const SizedBox(height: 4),
                Align(
                  alignment: Alignment.centerRight,
                  child: PopupMenuButton<int>(
                    tooltip: '移动状态',
                    onSelected: onMove,
                    itemBuilder: (context) => otherStatuses
                        .map(
                          (key) => PopupMenuItem(
                            value: key,
                            child: Text('移至 ${kanbanColumns[key]}'),
                          ),
                        )
                        .toList(),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 4,
                        vertical: 4,
                      ),
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (busy)
                              const AppLoading(size: 12)
                            else
                              Text(
                                '移动状态',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: isDark
                                      ? AppColors.darkTextSecondary
                                      : AppColors.textSecondary,
                                ),
                              ),
                            const Icon(Icons.expand_more, size: 14),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
