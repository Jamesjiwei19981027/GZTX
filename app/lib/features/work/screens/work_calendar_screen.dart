/// 日程日历（work-calendar）。
///
/// 对应网页 `MobileCalendarScreen` 与 `components/views/CalendarView.tsx`：
/// 月视图 / 周视图、按本地日期分组、双击日期新建、过去日期可补录。
library;

import 'package:clock/clock.dart';
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

class WorkCalendarScreen extends StatefulWidget {
  const WorkCalendarScreen({
    super.key,
    this.api,
    this.initialDay,
    this.authState,
  });

  final WorkApi? api;
  final String? initialDay;
  final AuthState? authState;

  @override
  State<WorkCalendarScreen> createState() => _WorkCalendarScreenState();
}

class _WorkCalendarScreenState extends State<WorkCalendarScreen> {
  bool _bootstrapped = false;
  AuthState? _auth;
  int? _lastProjectId;

  List<WorkTask> _tasks = const [];
  bool _loading = true;
  Object? _error;

  bool _weekMode = false;
  late String _selectedDay = widget.initialDay ?? TaskTime.todayKey();
  late DateTime _cursor =
      TaskTime.parseLocalDay(_selectedDay) ?? clock.now();

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
      _lastProjectId = _selectedProjectId;
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

  AuthState? _tryReadAuth() {
    try {
      return context.read<AuthState>();
    } catch (_) {
      return null;
    }
  }

  int? get _selectedProjectId =>
      (_auth ?? widget.authState ?? _tryReadAuth())?.currentProject?.id;

  void _onAuthChanged() {
    if (!mounted) return;
    final projectId = _selectedProjectId;
    if (projectId != _lastProjectId) {
      _lastProjectId = projectId;
      _load();
    }
  }

  List<WorkTask> get _projectTasks =>
      filterTasksByProject(_tasks, _selectedProjectId);

  @override
  void didUpdateWidget(covariant WorkCalendarScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialDay != widget.initialDay &&
        widget.initialDay != null) {
      setState(() {
        _selectedDay = widget.initialDay!;
        _cursor = TaskTime.parseLocalDay(_selectedDay) ?? _cursor;
      });
    }
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
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _loading = false;
      });
    }
  }

  void _select(String day) {
    setState(() {
      _selectedDay = day;
      final parsed = TaskTime.parseLocalDay(day);
      if (parsed != null) _cursor = parsed;
    });
  }

  void _shift(int amount) {
    setState(() {
      if (_weekMode) {
        _cursor = _cursor.add(Duration(days: 7 * amount));
      } else {
        _cursor = DateTime(_cursor.year, _cursor.month + amount);
      }
      _selectedDay = TaskTime.localDateKey(_cursor);
    });
  }

  void _today() {
    final now = clock.now();
    setState(() {
      _cursor = now;
      _selectedDay = TaskTime.localDateKey(now);
    });
  }

  Future<void> _openDay(String day) async {
    await context.push('/work/task-edit?date=$day');
    if (!mounted) return;
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final grouped = groupTasksByLocalDay(_projectTasks);
    final dayTasks = grouped[_selectedDay] ?? const <WorkTask>[];
    final isPast = _selectedDay.compareTo(TaskTime.todayKey()) < 0;
    final days = _weekMode ? _weekDays(_cursor) : const <String>[];

    return AppScaffold(
      title: '日程日历',
      actions: [
        TextButton(
          onPressed: () => setState(() => _weekMode = !_weekMode),
          child: Text(_weekMode ? '月视图' : '周视图'),
        ),
      ],
      body: WorkStateContainer(
        isLoading: _loading,
        error: _error,
        onRetry: _load,
        loadingLabel: '正在载入日程…',
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.md,
            AppSpacing.lg,
            AppSpacing.xxxl,
          ),
          children: [
            Row(
              children: [
                IconButton(
                  tooltip: _weekMode ? '上一周' : '上个月',
                  onPressed: () => _shift(-1),
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: Text(
                    '${_cursor.year}年${_cursor.month}月',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: isDark
                          ? AppColors.darkTextPrimary
                          : AppColors.textPrimary,
                    ),
                  ),
                ),
                TextButton(onPressed: _today, child: const Text('今天')),
                IconButton(
                  tooltip: _weekMode ? '下一周' : '下个月',
                  onPressed: () => _shift(1),
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
            WorkSection(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Column(
                children: [
                  if (_weekMode)
                    Wrap(
                      spacing: AppSpacing.sm,
                      runSpacing: AppSpacing.sm,
                      children: days
                          .map(
                            (day) => SizedBox(
                              width: 40,
                              child: InkWell(
                                onTap: () => _select(day),
                                child: Container(
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 8),
                                  decoration: BoxDecoration(
                                    color: day == _selectedDay
                                        ? AppColors.primary
                                        : Colors.transparent,
                                    borderRadius: BorderRadius.circular(
                                      AppSpacing.radiusMd,
                                    ),
                                  ),
                                  child: Column(
                                    children: [
                                      Text(
                                        '${int.parse(day.substring(8))}',
                                        style: TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w600,
                                          color: day == _selectedDay
                                              ? Colors.white
                                              : (isDark
                                                  ? AppColors.darkTextPrimary
                                                  : AppColors.textPrimary),
                                        ),
                                      ),
                                      if (grouped.containsKey(day))
                                        Container(
                                          width: 4,
                                          height: 4,
                                          margin:
                                              const EdgeInsets.only(top: 2),
                                          decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: day == _selectedDay
                                                ? Colors.white
                                                : AppColors.primary,
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          )
                          .toList(),
                    )
                  else
                    WorkMonthGrid(
                      month: _cursor,
                      selectedDay: _selectedDay,
                      daysWithTasks: grouped.keys.toSet(),
                      onSelect: _select,
                      onDoubleTap: _openDay,
                      startMonday: false,
                      cellHeight: 46,
                    ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                Expanded(
                  child: Text(
                    '$_selectedDay 日程事项 (${dayTasks.length})',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: isDark
                          ? AppColors.darkTextSecondary
                          : AppColors.textSecondary,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () => _openDay(_selectedDay),
                  child: const Text('在此日期新建'),
                ),
              ],
            ),
            if (isPast)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: Text(
                  '所选日期已经过去，仍可补录或调整当天日程',
                  style: TextStyle(
                    fontSize: 11,
                    color: isDark
                        ? AppColors.darkTextTertiary
                        : AppColors.textTertiary,
                  ),
                ),
              ),
            if (dayTasks.isEmpty)
              const WorkSection(child: WorkEmptyHint(text: '当天暂无安排事项'))
            else
              WorkSection(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    for (var i = 0; i < dayTasks.length; i++) ...[
                      WorkTaskTile(
                        task: dayTasks[i],
                        dense: true,
                        onTap: () async {
                          await context.push('/work/task/${dayTasks[i].id}');
                          if (!mounted) return;
                          await _load();
                        },
                        subtitle: WorkTaskMeta(task: dayTasks[i]),
                      ),
                      if (i < dayTasks.length - 1)
                        const Divider(height: 0.5, thickness: 0.5),
                    ],
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  List<String> _weekDays(DateTime cursor) {
    final start = cursor.subtract(Duration(days: (cursor.weekday + 6) % 7));
    return List.generate(
      7,
      (index) => TaskTime.localDateKey(start.add(Duration(days: index))),
    );
  }
}
