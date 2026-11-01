/// 首页「日程日历」与「项目进度简介」（对应网页 `components/WorkbenchOverview.tsx`）。
library;

import 'package:flutter/material.dart';

import '../../../design/design.dart';
import '../data/work_models.dart';
import 'work_widgets.dart';

class WorkHomeCalendar extends StatelessWidget {
  const WorkHomeCalendar({
    super.key,
    required this.tasks,
    required this.selectedDay,
    required this.displayMonth,
    required this.onSelectDay,
    required this.onDoubleTapDay,
    required this.onToday,
    required this.onMoveMonth,
    required this.onOpenFullCalendar,
    required this.onOpenNewTaskWithDate,
    required this.onOpenTask,
  });

  final List<WorkTask> tasks;
  final String selectedDay;
  final DateTime displayMonth;
  final ValueChanged<String> onSelectDay;
  final ValueChanged<String> onDoubleTapDay;
  final VoidCallback onToday;
  final ValueChanged<int> onMoveMonth;
  final VoidCallback onOpenFullCalendar;
  final ValueChanged<String> onOpenNewTaskWithDate;
  final ValueChanged<WorkTask> onOpenTask;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final grouped = groupTasksByLocalDay(tasks);
    final dayTasks = grouped[selectedDay] ?? const <WorkTask>[];

    return WorkSection(
      title: '日程日历',
      trailing: Wrap(
        spacing: 4,
        children: [
          TextButton(onPressed: onToday, child: const Text('今天')),
          TextButton(onPressed: onOpenFullCalendar, child: const Text('完整日历')),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              IconButton(
                tooltip: '上个月',
                onPressed: () => onMoveMonth(-1),
                icon: const Icon(Icons.chevron_left, size: 20),
              ),
              Expanded(
                child: Text(
                  '${displayMonth.year}年${displayMonth.month}月',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: isDark
                        ? AppColors.darkTextPrimary
                        : AppColors.textPrimary,
                  ),
                ),
              ),
              IconButton(
                tooltip: '下个月',
                onPressed: () => onMoveMonth(1),
                icon: const Icon(Icons.chevron_right, size: 20),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          WorkMonthGrid(
            month: displayMonth,
            selectedDay: selectedDay,
            daysWithTasks: grouped.keys.toSet(),
            onSelect: onSelectDay,
            onDoubleTap: onDoubleTapDay,
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: Text(
                  '$selectedDay · ${dayTasks.length} 项安排',
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark
                        ? AppColors.darkTextSecondary
                        : AppColors.textSecondary,
                  ),
                ),
              ),
              TextButton(
                onPressed: () => onOpenNewTaskWithDate(selectedDay),
                child: const Text('添加当天日程'),
              ),
            ],
          ),
          Text(
            '单击日期查看，双击新增日程；点击任务可修改，过去日期也可补录',
            style: TextStyle(
              fontSize: 11,
              height: 1.4,
              color: isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          if (dayTasks.isEmpty)
            const WorkEmptyHint(text: '当天暂无日程')
          else
            ...dayTasks.map(
              (task) => InkWell(
                onTap: () => onOpenTask(task),
                borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
                  child: Row(
                    children: [
                      SizedBox(
                        width: 48,
                        child: Text(
                          task.dueTime ?? '全天',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: AppColors.primary,
                          ),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          task.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            height: 1.3,
                            color: task.isDone
                                ? (isDark
                                    ? AppColors.darkTextTertiary
                                    : AppColors.textTertiary)
                                : (isDark
                                    ? AppColors.darkTextPrimary
                                    : AppColors.textPrimary),
                            decoration: task.isDone
                                ? TextDecoration.lineThrough
                                : null,
                          ),
                        ),
                      ),
                      if (task.isDone)
                        const Padding(
                          padding: EdgeInsets.only(left: 6),
                          child: Text(
                            '已完成',
                            style: TextStyle(
                              fontSize: 11,
                              color: Color(0xFF047857),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// 项目进度简介。
class WorkProjectProgressSection extends StatelessWidget {
  const WorkProjectProgressSection({
    super.key,
    required this.items,
    required this.loading,
    required this.failures,
    required this.onRetry,
    required this.onOpenProject,
  });

  final List<ProjectProgressSummary> items;
  final bool loading;
  final Set<int> failures;
  final VoidCallback onRetry;
  final ValueChanged<int> onOpenProject;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return WorkSection(
      title: '项目进度简介',
      footer: '根据项目人轴事项与里程碑的正式进度汇总',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (loading)
            Row(
              children: [
                const AppLoading(size: 16),
                const SizedBox(width: AppSpacing.sm),
                Text(
                  '正在同步项目进度…',
                  style: TextStyle(
                    fontSize: 13,
                    color: isDark
                        ? AppColors.darkTextSecondary
                        : AppColors.textSecondary,
                  ),
                ),
              ],
            )
          else if (items.isEmpty)
            const WorkEmptyHint(text: '暂无可见项目'),
          for (final item in items) ...[
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          item.projectName,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: isDark
                                ? AppColors.darkTextPrimary
                                : AppColors.textPrimary,
                          ),
                        ),
                      ),
                      Text(
                        item.total == 0 ? '暂无事项' : '${item.percent}%',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppColors.primary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                    child: LinearProgressIndicator(
                      value: item.total == 0 ? 0 : item.percent / 100,
                      minHeight: 6,
                      backgroundColor:
                          isDark ? AppColors.darkSurfaceVariant : AppColors.borderLight,
                      valueColor:
                          const AlwaysStoppedAnimation<Color>(AppColors.primary),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: AppSpacing.md,
                    runSpacing: 2,
                    children: [
                      Text(
                        '已完成 ${item.completed} / ${item.total} 项',
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark
                              ? AppColors.darkTextTertiary
                              : AppColors.textTertiary,
                        ),
                      ),
                      Text(
                        '逾期 ${item.overdue} 项',
                        style: TextStyle(
                          fontSize: 11,
                          color: item.overdue > 0
                              ? AppColors.danger
                              : (isDark
                                  ? AppColors.darkTextTertiary
                                  : AppColors.textTertiary),
                        ),
                      ),
                    ],
                  ),
                  if (item.next != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        '待推进：${item.next}',
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark
                              ? AppColors.darkTextSecondary
                              : AppColors.textSecondary,
                        ),
                      ),
                    ),
                  if (failures.contains(item.projectId))
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton(
                        onPressed: onRetry,
                        child: const Text('进度加载失败，点击重试'),
                      ),
                    )
                  else
                    Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton(
                        onPressed: () => onOpenProject(item.projectId),
                        child: const Text('查看项目详情'),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
