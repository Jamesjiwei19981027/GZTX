/// 任务详情（work-task-detail）。
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_provider.dart';
import '../../../core/auth/auth_state.dart';
import '../../../core/models/project.dart';
import '../../../core/time/time_utils.dart';
import '../../../design/design.dart';
import '../data/work_api.dart';
import '../data/work_models.dart';
import '../widgets/work_widgets.dart';

class WorkTaskDetailScreen extends StatefulWidget {
  const WorkTaskDetailScreen({
    super.key,
    required this.taskId,
    this.api,
  });

  final int taskId;
  final WorkApi? api;

  @override
  State<WorkTaskDetailScreen> createState() => _WorkTaskDetailScreenState();
}

class _WorkTaskDetailScreenState extends State<WorkTaskDetailScreen> {
  bool _bootstrapped = false;
  WorkApi? _api;

  WorkTask? _task;
  bool _loading = true;
  Object? _error;
  bool _busy = false;

  bool _historyOpen = false;
  bool _historyLoading = false;
  Object? _historyError;
  List<ScheduleChange> _history = const [];

  /// 请求序号：任务 ID 变化或重复请求时，旧回调不写回。
  int _loadToken = 0;
  int _historyToken = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _api ??= widget.api ?? WorkApi(context.read<AuthState>().api);
    if (_bootstrapped) return;
    _bootstrapped = true;
    _load();
  }

  /// 任务只带项目 ID：按当前项目、再按已加载项目列表取名称，取不到才退回编号。
  String _projectLabel(int projectId) {
    AuthState? auth;
    try {
      auth = context.read<AuthState>();
    } catch (_) {
      auth = null;
    }
    if (auth?.currentProject?.id == projectId) return auth!.currentProject!.name;
    for (final p in auth?.projects ?? const <Project>[]) {
      if (p.id == projectId) return p.name;
    }
    return '项目 #$projectId';
  }

  @override
  void didUpdateWidget(covariant WorkTaskDetailScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.taskId != widget.taskId) {
      _historyOpen = false;
      _history = const [];
      _historyError = null;
      _load();
    }
  }

  Future<void> _load() async {
    final token = ++_loadToken;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final task = await _api!.getTask(widget.taskId);
      if (!mounted || token != _loadToken) return;
      setState(() {
        _task = task;
        _loading = false;
      });
    } catch (error) {
      if (!mounted || token != _loadToken) return;
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  Future<void> _loadHistory() async {
    final token = ++_historyToken;
    setState(() {
      _historyLoading = true;
      _historyError = null;
    });
    try {
      final rows = await _api!.scheduleHistory(widget.taskId);
      if (!mounted || token != _historyToken) return;
      setState(() {
        _history = rows;
        _historyLoading = false;
      });
    } catch (error) {
      if (!mounted || token != _historyToken) return;
      setState(() {
        _historyError = error;
        _historyLoading = false;
      });
    }
  }

  Future<void> _toggleCompletion() async {
    final task = _task;
    if (task == null) return;
    if (task.isAxisLocked) {
      showAppToast(context, '该事项由人轴责任节点同步，请在责任节点中更新进度',
          type: ToastType.warning);
      return;
    }
    setState(() => _busy = true);
    try {
      if (task.isDone) {
        await _api!.uncompleteTask(task.id);
      } else {
        await _api!.completeTask(task.id);
      }
      if (!mounted) return;
      await _load();
    } catch (error) {
      if (!mounted) return;
      showAppToast(context, describeError(error).message, type: ToastType.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final task = _task;
    if (task == null) return;
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: '放入回收站？',
      message: '任务将被移至回收站，保留 30 天后自动清除。期间可随时恢复。',
      confirmLabel: '移至回收站',
      isDestructive: true,
    );
    if (!confirmed || !mounted) return;
    setState(() => _busy = true);
    try {
      await _api!.deleteTask(task.id);
      if (!mounted) return;
      showAppToast(context, '已移入回收站', type: ToastType.success);
      context.pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _busy = false);
      showAppToast(context, describeError(error).message, type: ToastType.error);
    }
  }

  Future<void> _edit() async {
    final task = _task;
    if (task == null) return;
    await context.push('/work/task-edit?id=${task.id}');
    if (!mounted) return;
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return AppScaffold(
      title: '任务详情',
      actions: [
        if (_task != null && !_task!.isAxisLocked)
          TextButton(onPressed: _edit, child: const Text('编辑')),
      ],
      body: WorkStateContainer(
        isLoading: _loading,
        error: _error,
        onRetry: _load,
        loadingLabel: '正在载入任务…',
        child: _task == null
            ? const SizedBox.shrink()
            : ListView(
                padding: const EdgeInsets.all(AppSpacing.lg),
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _task!.title,
                              style: TextStyle(
                                fontSize: 19,
                                fontWeight: FontWeight.w700,
                                height: 1.35,
                                color: _task!.isDone
                                    ? (isDark
                                        ? AppColors.darkTextTertiary
                                        : AppColors.textTertiary)
                                    : (isDark
                                        ? AppColors.darkTextPrimary
                                        : AppColors.textPrimary),
                                decoration: _task!.isDone
                                    ? TextDecoration.lineThrough
                                    : null,
                              ),
                            ),
                            const SizedBox(height: AppSpacing.sm),
                            Wrap(
                              spacing: 6,
                              runSpacing: 4,
                              children: [
                                WorkStatusBadge(status: _task!.status),
                                _pill(
                                  _task!.priorityLabel,
                                  _task!.priority == 2
                                      ? AppColors.danger
                                      : AppColors.warning,
                                ),
                                if (_task!.categoryName != null &&
                                    _task!.categoryName!.isNotEmpty)
                                  _pill(_task!.categoryName!, AppColors.textSecondary),
                              ],
                            ),
                          ],
                        ),
                      ),
                      if (!_task!.isAxisLocked)
                        Padding(
                          padding: const EdgeInsets.only(left: AppSpacing.sm),
                          child: OutlinedButton(
                            onPressed: _busy ? null : _toggleCompletion,
                            child: Text(_task!.isDone ? '标为未完成' : '完成'),
                          ),
                        ),
                    ],
                  ),
                  if (_task!.isAxisLocked) ...[
                    const SizedBox(height: AppSpacing.md),
                    Container(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF5EDFF),
                        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                        border: Border.all(color: const Color(0xFFE0C9FF)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Row(
                            children: [
                              AppIcon('axis', size: 16, color: Color(0xFF7C3AED)),
                              SizedBox(width: 6),
                              Text(
                                '人轴责任链关联事项（只读）',
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF6D28D9),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            '此任务由人轴事项节点同步生成，实施状态与交付证据由责任链统一把控，不能在待办中直接勾选完成。',
                            style: TextStyle(
                              fontSize: 12,
                              height: 1.5,
                              color: Color(0xFF6D28D9),
                            ),
                          ),
                          if (_task!.projectNodeId != null)
                            TextButton(
                              onPressed: () => context
                                  .push('/axis/node/${_task!.projectNodeId}'),
                              child: Text(
                                '前往责任节点 #${_task!.projectNodeId}',
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                  if (_task!.description != null &&
                      _task!.description!.trim().isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.md),
                    Container(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      decoration: BoxDecoration(
                        color: isDark
                            ? AppColors.darkSurfaceVariant
                            : const Color(0xFFF6F7F9),
                        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                      ),
                      child: Text(
                        _task!.description!,
                        style: TextStyle(
                          fontSize: 13,
                          height: 1.6,
                          color: isDark
                              ? AppColors.darkTextSecondary
                              : AppColors.textSecondary,
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: AppSpacing.md),
                  WorkSection(
                    title: '事项属性',
                    padding: EdgeInsets.zero,
                    child: Column(
                      children: [
                        _propertyRow('截止时间', _task!.dueText),
                        if (_task!.isRecurring)
                          _propertyRow('重复规则', _task!.recurrenceRule ?? '周期重复'),
                        _propertyRow('执行人员', _task!.assigneeText),
                        _propertyRow('所属项目',
                            _task!.projectId == null ? '个人待办' : _projectLabel(_task!.projectId!)),
                      ],
                    ),
                  ),
                  if (_task!.checklist.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.md),
                    WorkSection(
                      title: '清单项 (${_task!.checklist.length})',
                      padding: EdgeInsets.zero,
                      child: Column(
                        children: _task!.checklist
                            .map(
                              (item) => Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: AppSpacing.lg,
                                  vertical: 8,
                                ),
                                child: Row(
                                  children: [
                                    Icon(
                                      item.completed
                                          ? Icons.check_circle
                                          : Icons.radio_button_unchecked,
                                      size: 18,
                                      color: item.completed
                                          ? AppColors.success
                                          : AppColors.textTertiary,
                                    ),
                                    const SizedBox(width: AppSpacing.sm),
                                    Expanded(
                                      child: Text(
                                        item.title,
                                        style: TextStyle(
                                          fontSize: 13,
                                          color: item.completed
                                              ? AppColors.textTertiary
                                              : (isDark
                                                  ? AppColors.darkTextPrimary
                                                  : AppColors.textPrimary),
                                          decoration: item.completed
                                              ? TextDecoration.lineThrough
                                              : null,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            )
                            .toList(),
                      ),
                    ),
                  ],
                  const SizedBox(height: AppSpacing.md),
                  _ScheduleHistorySection(
                    open: _historyOpen,
                    loading: _historyLoading,
                    error: _historyError,
                    rows: _history,
                    onToggle: () {
                      setState(() => _historyOpen = !_historyOpen);
                      if (_historyOpen && _history.isEmpty && !_historyLoading) {
                        _loadHistory();
                      }
                    },
                    onRetry: _loadHistory,
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  if (!_task!.isAxisLocked)
                    AppButton(
                      label: '删除任务',
                      variant: AppButtonVariant.danger,
                      isFullWidth: true,
                      isLoading: _busy,
                      onPressed: _delete,
                    ),
                ],
              ),
      ),
    );
  }

  Widget _pill(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Text(
          text,
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color),
        ),
      );

  Widget _propertyRow(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: 10,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 76,
              child: Text(
                label,
                style: const TextStyle(
                  fontSize: 13,
                  color: AppColors.textSecondary,
                ),
              ),
            ),
            Expanded(
              child: Text(
                value,
                style: const TextStyle(fontSize: 13, height: 1.4),
              ),
            ),
          ],
        ),
      );
}

class _ScheduleHistorySection extends StatelessWidget {
  const _ScheduleHistorySection({
    required this.open,
    required this.loading,
    required this.error,
    required this.rows,
    required this.onToggle,
    required this.onRetry,
  });

  final bool open;
  final bool loading;
  final Object? error;
  final List<ScheduleChange> rows;
  final VoidCallback onToggle;
  final VoidCallback onRetry;

  String _format(DateTime? value) =>
      value == null ? '未设置' : formatDisplayDateTime(value);

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextButton(
          onPressed: onToggle,
          child: Text(open ? '收起日程修改记录' : '查看日程修改记录'),
        ),
        if (open)
          if (loading)
            const Row(
              children: [
                AppLoading(size: 16),
                SizedBox(width: AppSpacing.sm),
                Text('正在加载…', style: TextStyle(fontSize: 12)),
              ],
            )
          else if (error != null)
            Row(
              children: [
                const Expanded(
                  child: Text(
                    '记录加载失败',
                    style: TextStyle(fontSize: 12, color: AppColors.danger),
                  ),
                ),
                TextButton(onPressed: onRetry, child: const Text('重试')),
              ],
            )
          else if (rows.isEmpty)
            const Text(
              '暂无修改记录；历史记录从本功能启用后开始保留。',
              style: TextStyle(fontSize: 12, color: AppColors.textTertiary),
            )
          else
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '首次记录时间：${_format(rows.first.oldDueDate)}',
                  style: const TextStyle(fontSize: 12),
                ),
                for (final row in rows)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      '${_format(row.createdAt)}：${_format(row.oldDueDate)} → '
                      '${_format(row.newDueDate)}',
                      style: const TextStyle(fontSize: 12, height: 1.4),
                    ),
                  ),
                const Padding(
                  padding: EdgeInsets.only(top: 6),
                  child: Text(
                    '日程调整不会改写已提交的汇报。',
                    style: TextStyle(fontSize: 12, color: AppColors.textTertiary),
                  ),
                ),
              ],
            ),
      ],
    );
  }
}
