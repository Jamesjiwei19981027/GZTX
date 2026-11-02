/// 工作统计报表（work-statistics）。
///
/// 对应网页 `mobile/features/work/MobileStatisticsScreen.tsx`。
library;

import 'package:clock/clock.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_provider.dart';
import '../../../core/auth/auth_state.dart';
import '../../../design/design.dart';
import '../data/work_api.dart';
import '../data/work_models.dart';
import '../data/work_scope.dart';
import '../widgets/work_widgets.dart';

class WorkStatisticsScreen extends StatefulWidget {
  const WorkStatisticsScreen({
    super.key,
    this.api,
    this.authState,
    this.initialPeriod = 'week',
  });

  final WorkApi? api;
  final AuthState? authState;
  final String initialPeriod;

  @override
  State<WorkStatisticsScreen> createState() => _WorkStatisticsScreenState();
}

class _WorkStatisticsScreenState extends State<WorkStatisticsScreen> {
  bool _bootstrapped = false;
  AuthState? _auth;
  int? _lastProjectId;

  late String _period = widget.initialPeriod;
  TaskStatsSummary? _stats;
  TaskTrend? _trend;
  List<WorkTask> _tasks = const [];
  bool _loading = true;
  Object? _error;
  int _token = 0;

  WorkApi get _api =>
      widget.api ??
      WorkApi((_auth ?? widget.authState ?? context.read<AuthState>()).api);

  int? get _projectId =>
      (_auth ?? widget.authState ?? _tryReadAuth())?.currentProject?.id;

  AuthState? _tryReadAuth() {
    try {
      return context.read<AuthState>();
    } catch (_) {
      return null;
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final auth = widget.authState ?? _tryReadAuth();
    if (_auth != auth) {
      _auth?.removeListener(_onAuthChanged);
      _auth = auth;
      _auth?.addListener(_onAuthChanged);
      _lastProjectId = _projectId;
    }
    if (_bootstrapped) return;
    _bootstrapped = true;
    _load();
  }

  @override
  void dispose() {
    _auth?.removeListener(_onAuthChanged);
    super.dispose();
  }

  void _onAuthChanged() {
    if (!mounted) return;
    final projectId = _projectId;
    if (projectId != _lastProjectId) {
      _lastProjectId = projectId;
      _load();
    }
  }

  Future<void> _load() async {
    final token = ++_token;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        _api.stats(_period, projectId: _projectId),
        _api.trend(_period, projectId: _projectId),
        _api.listAllTasks(),
      ]);
      if (!mounted || token != _token) return;
      setState(() {
        _stats = results[0] as TaskStatsSummary;
        _trend = results[1] as TaskTrend;
        _tasks = results[2] as List<WorkTask>;
        _loading = false;
      });
    } catch (error) {
      if (!mounted || token != _token) return;
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  void _selectPeriod(String period) {
    if (period == _period) return;
    setState(() => _period = period);
    _load();
  }

  DateTime _periodStartDate(String period) {
    final now = clock.now();
    final today = DateTime(now.year, now.month, now.day);
    return switch (period) {
      'month' => DateTime(today.year, today.month, 1),
      'quarter' => DateTime(today.year, ((today.month - 1) ~/ 3) * 3 + 1, 1),
      'year' => DateTime(today.year, 1, 1),
      _ => today.subtract(Duration(days: today.weekday - 1)),
    };
  }

  bool _isTaskInPeriod(WorkTask task, DateTime start) {
    if (task.createdAt != null && !task.createdAt!.isBefore(start)) {
      return true;
    }
    if (task.completedAt != null && !task.completedAt!.isBefore(start)) {
      return true;
    }
    if (task.dueDate != null) {
      final due = TaskTime.parseLocalDay(task.dueDate);
      if (due != null && !due.isBefore(start)) {
        return true;
      }
    }
    return false;
  }

  List<({int userId, String name, int total, int completed})> get _memberLoads {
    final start = _periodStartDate(_period);
    final scopedTasks = filterTasksByProject(_tasks, _projectId);
    final periodTasks = scopedTasks.where((t) => _isTaskInPeriod(t, start));
    final map = <int, ({String name, int total, int completed})>{};
    for (final task in periodTasks) {
      for (final assignee in task.assignees) {
        final current = map[assignee.userId] ??
            (name: assignee.displayName, total: 0, completed: 0);
        final name = current.name.isNotEmpty
            ? current.name
            : (assignee.displayName.isNotEmpty
                ? assignee.displayName
                : '成员 #${assignee.userId}');
        map[assignee.userId] = (
          name: name,
          total: current.total + 1,
          completed: current.completed + (task.isDone ? 1 : 0),
        );
      }
    }
    final list = map.entries
        .map((entry) => (
              userId: entry.key,
              name: entry.value.name,
              total: entry.value.total,
              completed: entry.value.completed,
            ))
        .toList()
      ..sort((a, b) => b.total.compareTo(a.total));
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final stats = _stats;
    return AppScaffold(
      title: '工作统计报表',
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: AppSegmentedControl<String>(
              segments: const {
                'week': '本周',
                'month': '本月',
                'quarter': '本季度',
              },
              selectedValue: _period,
              onValueChanged: _selectPeriod,
            ),
          ),
          Expanded(
            child: WorkStateContainer(
              isLoading: _loading,
              error: _error,
              onRetry: _load,
              loadingLabel: '计算统计指标中…',
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg,
                  0,
                  AppSpacing.lg,
                  AppSpacing.xxxl,
                ),
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: _StatCard(
                          label: '事项总数',
                          value: '${stats?.total ?? 0}',
                          hint: '当前范围统计',
                          color: isDark
                              ? AppColors.darkTextPrimary
                              : AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: _StatCard(
                          label: '已完成事项',
                          value: '${stats?.completed ?? 0}',
                          hint:
                              '达成率 ${stats != null && stats.total > 0 ? ((stats.completed / stats.total) * 100).round() : 0}%',
                          color: AppColors.success,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Row(
                    children: [
                      Expanded(
                        child: _StatCard(
                          label: '进行中事项',
                          value: '${stats?.inProgress ?? 0}',
                          hint: '推进中',
                          color: AppColors.primary,
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: _StatCard(
                          label: '逾期未结',
                          value: '${stats?.overdue ?? 0}',
                          hint: '需重点督促',
                          color: AppColors.danger,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  WorkSection(
                    title: '状态分布',
                    child: stats == null || stats.total == 0
                        ? const WorkEmptyHint(text: '暂无事项数据')
                        : Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              ClipRRect(
                                borderRadius:
                                    BorderRadius.circular(AppSpacing.radiusFull),
                                child: SizedBox(
                                  height: 14,
                                  child: Row(
                                    children: [
                                      if (stats.completed > 0)
                                        Expanded(
                                          flex: stats.completed,
                                          child: Container(
                                              color: AppColors.success),
                                        ),
                                      if (stats.inProgress > 0)
                                        Expanded(
                                          flex: stats.inProgress,
                                          child: Container(
                                              color: AppColors.primary),
                                        ),
                                      if (stats.pending > 0)
                                        Expanded(
                                          flex: stats.pending,
                                          child: Container(
                                              color: AppColors.textTertiary),
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                              const SizedBox(height: AppSpacing.md),
                              Wrap(
                                spacing: AppSpacing.md,
                                runSpacing: 6,
                                children: [
                                  _legend('已完成', stats.completed,
                                      AppColors.success),
                                  _legend('进行中', stats.inProgress,
                                      AppColors.primary),
                                  _legend('待办', stats.pending,
                                      AppColors.textTertiary),
                                  _legend('其中逾期', stats.overdue,
                                      AppColors.danger),
                                ],
                              ),
                            ],
                          ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  WorkSection(
                    title: '新增与完成趋势',
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _dotLabel('新增', AppColors.primary),
                        const SizedBox(width: AppSpacing.sm),
                        _dotLabel('完成', const Color(0xFF10B981)),
                      ],
                    ),
                    child: (_trend?.series ?? const <TrendPoint>[]).isEmpty
                        ? const WorkEmptyHint(text: '暂无趋势采样')
                        : Column(
                            children: [
                              WorkTrendChart(series: _trend!.series),
                              const SizedBox(height: AppSpacing.sm),
                              for (final point
                                  in _trend!.series.reversed.take(10))
                                Padding(
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 2),
                                  child: Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          point.date,
                                          style: const TextStyle(fontSize: 12),
                                        ),
                                      ),
                                      Text(
                                        '新增 ${point.created} / 完成 ${point.completed}',
                                        style: const TextStyle(fontSize: 12),
                                      ),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  WorkSection(
                    title: '团队成员事项负载',
                    padding: EdgeInsets.zero,
                    child: _memberLoads.isEmpty
                        ? const WorkEmptyHint(text: '暂无团队人员事项')
                        : Column(
                            children: _memberLoads
                                .map(
                                  (item) => Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: AppSpacing.lg,
                                      vertical: 8,
                                    ),
                                    child: Row(
                                      children: [
                                        Container(
                                          width: 30,
                                          height: 30,
                                          alignment: Alignment.center,
                                          decoration: BoxDecoration(
                                            color: isDark
                                                ? AppColors.darkSurfaceVariant
                                                : AppColors.surfaceVariant,
                                            shape: BoxShape.circle,
                                          ),
                                          child: Text(
                                            item.name.isEmpty
                                                ? '用'
                                                : item.name.substring(0, 1),
                                            style: const TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w600,
                                            ),
                                          ),
                                        ),
                                        const SizedBox(width: AppSpacing.sm),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                item.name,
                                                style: const TextStyle(
                                                  fontSize: 13,
                                                  fontWeight: FontWeight.w500,
                                                ),
                                              ),
                                              Text(
                                                '已承接 ${item.total} 项 · 完成 ${item.completed} 项',
                                                style: const TextStyle(
                                                  fontSize: 11,
                                                  color:
                                                      AppColors.textTertiary,
                                                ),
                                              ),
                                            ],
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
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _legend(String label, int value, Color color) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 4),
          Text(
            '$label: $value',
            style: const TextStyle(fontSize: 11),
          ),
        ],
      );

  Widget _dotLabel(String label, Color color) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 3),
          Text(label, style: const TextStyle(fontSize: 11)),
        ],
      );
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.hint,
    required this.color,
  });

  final String label;
  final String value;
  final String hint;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : Colors.white,
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              color: isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
          Text(
            hint,
            style: TextStyle(
              fontSize: 11,
              color: isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
            ),
          ),
        ],
      ),
    );
  }
}
