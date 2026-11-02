/// T02 工作 Tab 通用控件。
///
/// 所有控件都同时适配 iOS（Cupertino）与安卓（Material），文案全中文。
library;

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../../../core/errors/app_error.dart';
import '../../../design/design.dart';
import '../data/work_models.dart';

/// 把底座异常翻译成页面可展示的状态。
({String title, String message, bool isOffline, bool isForbidden}) describeError(
  Object error,
) {
  if (error is NetworkException) {
    return (
      title: '网络连接异常',
      message: '无法连接服务器，请检查网络后重试',
      isOffline: true,
      isForbidden: false,
    );
  }
  if (error is AuthException) {
    return (
      title: '登录已过期',
      message: '请重新登录后再继续操作',
      isOffline: false,
      isForbidden: false,
    );
  }
  if (error is ValidationException) {
    return (
      title: '提交内容有误',
      message: error.message,
      isOffline: false,
      isForbidden: false,
    );
  }
  if (error is ApiException) {
    final forbidden = error.statusCode == 403;
    return (
      title: forbidden ? '暂无访问权限' : '操作失败',
      message: error.message,
      isOffline: false,
      isForbidden: forbidden,
    );
  }
  return (
    title: '加载失败',
    message: error.toString(),
    isOffline: false,
    isForbidden: false,
  );
}

/// 卡片分组：标题 + 可选操作 + 内容 + 脚注。
class WorkSection extends StatelessWidget {
  const WorkSection({
    super.key,
    this.title,
    this.trailing,
    this.footer,
    this.child,
    this.padding = const EdgeInsets.all(AppSpacing.lg),
    this.headerPadding = const EdgeInsets.fromLTRB(
      AppSpacing.lg,
      AppSpacing.md,
      AppSpacing.lg,
      0,
    ),
  });

  final String? title;
  final Widget? trailing;
  final String? footer;
  final Widget? child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry headerPadding;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : Colors.white,
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title != null)
            Padding(
              padding: headerPadding,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Expanded(
                    child: Text(
                      title!,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: isDark
                            ? AppColors.darkTextPrimary
                            : AppColors.textPrimary,
                      ),
                    ),
                  ),
                  if (trailing != null) trailing!,
                ],
              ),
            ),
          if (child != null) Padding(padding: padding, child: child!),
          if (footer != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                0,
                AppSpacing.lg,
                AppSpacing.md,
              ),
              child: Text(
                footer!,
                style: TextStyle(
                  fontSize: 11,
                  height: 1.4,
                  color: isDark
                      ? AppColors.darkTextTertiary
                      : AppColors.textTertiary,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// 胶囊筛选按钮（状态、优先级、搜索分类共用）。
class WorkFilterChip extends StatelessWidget {
  const WorkFilterChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Semantics(
      button: true,
      selected: selected,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
        child: Container(
          constraints: const BoxConstraints(minHeight: 34),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.primary
                : (isDark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant),
            borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
              color: selected
                  ? Colors.white
                  : (isDark ? AppColors.darkTextSecondary : AppColors.textSecondary),
            ),
          ),
        ),
      ),
    );
  }
}

/// 状态徽标。
class WorkStatusBadge extends StatelessWidget {
  const WorkStatusBadge({super.key, required this.status});

  final int status;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final (label, fg, bg) = switch (status) {
      2 => ('已完成', AppColors.success, AppColors.successLight),
      1 => ('进行中', AppColors.primary, AppColors.primaryLight),
      _ => (
          '待办',
          isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
          isDark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant,
        ),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: bg.withValues(alpha: isDark ? 0.35 : 1),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: fg),
      ),
    );
  }
}

/// 优先级徽标（仅高优先显示「高优」，与网页一致）。
class WorkPriorityBadge extends StatelessWidget {
  const WorkPriorityBadge({super.key, required this.priority});

  final int priority;

  @override
  Widget build(BuildContext context) {
    if (priority != 2) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.dangerContainerOf(isDarkMode(context)),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        '高优',
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: AppColors.onDangerContainerOf(isDarkMode(context)),
        ),
      ),
    );
  }
}

/// 空状态提示条。
class WorkEmptyHint extends StatelessWidget {
  const WorkEmptyHint({super.key, required this.text, this.icon});

  final String text;
  final String? icon;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            AppIcon(
              icon!,
              size: 32,
              color: isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
          Text(
            text,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 13,
              color: isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
            ),
          ),
        ],
      ),
    );
  }
}

/// 加载中 / 加载失败 / 内容 三态容器。
class WorkStateContainer extends StatelessWidget {
  const WorkStateContainer({
    super.key,
    required this.isLoading,
    required this.error,
    required this.onRetry,
    required this.child,
    this.loadingLabel = '加载中…',
  });

  final bool isLoading;
  final Object? error;
  final VoidCallback onRetry;
  final Widget child;
  final String loadingLabel;

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return SingleChildScrollView(
        physics: const ClampingScrollPhysics(),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const AppLoading(),
                const SizedBox(height: AppSpacing.md),
                Text(
                  loadingLabel,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }
    if (error != null) {
      final info = describeError(error!);
      return SingleChildScrollView(
        physics: const ClampingScrollPhysics(),
        child: Center(
          child: AppErrorState(
            title: info.title,
            message: info.message,
            isForbidden: info.isForbidden,
            onRetry: info.isForbidden ? null : onRetry,
          ),
        ),
      );
    }
    return child;
  }
}

/// 任务行：左侧勾选圈 + 标题 + 徽标副标题 + 右侧扩展。
class WorkTaskTile extends StatelessWidget {
  const WorkTaskTile({
    super.key,
    required this.task,
    this.onTap,
    this.onToggle,
    this.trailing,
    this.subtitle,
    this.showChevron = true,
    this.dense = false,
    this.emphasizeOverdue = true,
  });

  final WorkTask task;
  final VoidCallback? onTap;
  final VoidCallback? onToggle;
  final Widget? trailing;
  final Widget? subtitle;
  final bool showChevron;
  final bool dense;
  final bool emphasizeOverdue;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final titleColor = task.isDone
        ? (isDark ? AppColors.darkTextTertiary : AppColors.textTertiary)
        : (isDark ? AppColors.darkTextPrimary : AppColors.textPrimary);

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: dense ? 8 : 10,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            if (onToggle != null)
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: onToggle,
                child: Semantics(
                  button: true,
                  label: task.isDone ? '标为未完成' : '完成任务',
                  child: Padding(
                    padding: const EdgeInsets.only(right: 10, top: 6, bottom: 6),
                    child: _CheckCircle(done: task.isDone),
                  ),
                ),
              ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    task.title,
                    style: TextStyle(
                      fontSize: dense ? 14 : 15,
                      fontWeight: FontWeight.w500,
                      height: 1.3,
                      color: titleColor,
                      decoration: task.isDone ? TextDecoration.lineThrough : null,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 4),
                    subtitle!,
                  ] else if (_hasMeta(task)) ...[
                    const SizedBox(height: 4),
                    WorkTaskMeta(task: task, emphasizeOverdue: emphasizeOverdue),
                  ],
                ],
              ),
            ),
            if (trailing != null) ... [
              const SizedBox(width: AppSpacing.sm),
              trailing!,
            ] else if (showChevron)
              Padding(
                padding: const EdgeInsets.only(left: AppSpacing.sm),
                child: Icon(
                  isCupertinoPlatform(context)
                      ? CupertinoIcons.chevron_forward
                      : Icons.chevron_right,
                  size: 16,
                  color: isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
                ),
              ),
          ],
        ),
      ),
    );
  }

  bool _hasMeta(WorkTask task) =>
      task.dueDate != null ||
      task.priority == 2 ||
      task.isAxisLocked ||
      (task.categoryName != null && task.categoryName!.isNotEmpty);
}

/// 任务元信息：截止日期 / 高优 / 人轴 / 分类。
class WorkTaskMeta extends StatelessWidget {
  const WorkTaskMeta({
    super.key,
    required this.task,
    this.emphasizeOverdue = true,
  });

  final WorkTask task;
  final bool emphasizeOverdue;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final muted = isDark ? AppColors.darkTextTertiary : AppColors.textTertiary;
    final overdue = emphasizeOverdue && task.isOverdue;
    return Wrap(
      spacing: 6,
      runSpacing: 4,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        if (task.dueDate != null)
          Text(
            task.isDueToday ? '今日到期' : task.dueDate!,
            style: TextStyle(
              fontSize: 11,
              color: overdue ? AppColors.danger : muted,
              fontWeight: overdue ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
        WorkPriorityBadge(priority: task.priority),
        if (task.isAxisLocked)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: const Color(0xFFF3E8FF),
              borderRadius: BorderRadius.circular(4),
            ),
            child: const Text(
              '人轴',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: Color(0xFF7C3AED),
              ),
            ),
          ),
        if (task.categoryName != null && task.categoryName!.isNotEmpty)
          Text(
            task.categoryName!,
            style: TextStyle(fontSize: 11, color: muted),
          ),
        if (task.tags.isNotEmpty)
          Text(
            task.tags.map((t) => '#${t.name}').join(' '),
            style: TextStyle(fontSize: 11, color: muted),
          ),
      ],
    );
  }
}

class _CheckCircle extends StatelessWidget {
  const _CheckCircle({required this.done});

  final bool done;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Container(
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: done ? AppColors.success : Colors.transparent,
        border: Border.all(
          color: done
              ? AppColors.success
              : (isDark ? AppColors.darkBorder : const Color(0xFFC7CBD1)),
          width: 2,
        ),
      ),
      child: done
          ? const Icon(Icons.check, size: 14, color: Colors.white)
          : null,
    );
  }
}

/// 趋势柱状图（无第三方依赖，CustomPaint 绘制）。
class WorkTrendChart extends StatelessWidget {
  const WorkTrendChart({
    super.key,
    required this.series,
    this.height = 96,
  });

  final List<TrendPoint> series;
  final double height;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final maxValue = series.fold<int>(
      1,
      (max, point) =>
          [max, point.created, point.completed].reduce((a, b) => a > b ? a : b),
    );
    return SizedBox(
      height: height,
      child: CustomPaint(
        painter: _TrendPainter(
          series: series,
          maxValue: maxValue,
          trackColor: isDark ? AppColors.darkSurfaceVariant : AppColors.borderLight,
          createdColor: AppColors.primary,
          completedColor: const Color(0xFF10B981),
        ),
        child: const SizedBox.expand(),
      ),
    );
  }
}

class _TrendPainter extends CustomPainter {
  _TrendPainter({
    required this.series,
    required this.maxValue,
    required this.trackColor,
    required this.createdColor,
    required this.completedColor,
  });

  final List<TrendPoint> series;
  final int maxValue;
  final Color trackColor;
  final Color createdColor;
  final Color completedColor;

  @override
  void paint(Canvas canvas, Size size) {
    if (series.isEmpty || size.width <= 0) return;
    final paint = Paint()..style = PaintingStyle.fill;
    final slot = size.width / series.length;
    final barWidth = (slot * 0.32).clamp(1.0, 8.0);
    final baseline = size.height;
    for (var i = 0; i < series.length; i++) {
      final center = slot * i + slot / 2;
      final createdHeight = size.height * (series[i].created / maxValue);
      final completedHeight = size.height * (series[i].completed / maxValue);
      paint.color = trackColor.withValues(alpha: 0.35);
      canvas.drawRect(
        Rect.fromLTWH(center - barWidth, 0, barWidth, size.height),
        paint,
      );
      paint.color = createdColor;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(
            center - barWidth - 1,
            baseline - createdHeight,
            barWidth,
            createdHeight,
          ),
          const Radius.circular(2),
        ),
        paint,
      );
      paint.color = completedColor;
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(
            center + 1,
            baseline - completedHeight,
            barWidth,
            completedHeight,
          ),
          const Radius.circular(2),
        ),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_TrendPainter oldDelegate) =>
      oldDelegate.series != series || oldDelegate.maxValue != maxValue;
}

/// 月历网格：周一或周日起始，可标记有任务的日期。
class WorkMonthGrid extends StatelessWidget {
  const WorkMonthGrid({
    super.key,
    required this.month,
    required this.selectedDay,
    required this.daysWithTasks,
    required this.onSelect,
    this.onDoubleTap,
    this.startMonday = true,
    this.cellHeight = 44,
  });

  final DateTime month;
  final String selectedDay;
  final Set<String> daysWithTasks;
  final ValueChanged<String> onSelect;
  final ValueChanged<String>? onDoubleTap;
  final bool startMonday;
  final double cellHeight;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final weekLabels = startMonday
        ? const ['一', '二', '三', '四', '五', '六', '日']
        : const ['日', '一', '二', '三', '四', '五', '六'];
    final days = buildMonthGrid(month, startMonday: startMonday);
    final today = TaskTime.todayKey();

    return MediaQuery.withClampedTextScaling(
      minScaleFactor: 0.8,
      maxScaleFactor: 1.25,
      child: Column(
        children: [
          Row(
            children: weekLabels
                .map(
                  (label) => Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Text(
                        label,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark
                              ? AppColors.darkTextTertiary
                              : AppColors.textTertiary,
                        ),
                      ),
                    ),
                  ),
                )
                .toList(),
          ),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            padding: EdgeInsets.zero,
            itemCount: days.length,
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              mainAxisExtent: cellHeight,
              crossAxisSpacing: 4,
              mainAxisSpacing: 4,
            ),
            itemBuilder: (context, index) {
              final day = days[index];
              if (day.isEmpty) return const SizedBox.shrink();
              final selected = day == selectedDay;
              final inMonth = day.startsWith(TaskTime.monthKey(month));
              final hasTasks = daysWithTasks.contains(day);
              final isToday = day == today;
              return GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => onSelect(day),
                onDoubleTap:
                    onDoubleTap == null ? null : () => onDoubleTap!(day),
                child: Semantics(
                  button: true,
                  selected: selected,
                  label: day,
                  child: Container(
                    decoration: BoxDecoration(
                      color: selected
                          ? AppColors.primary
                          : (inMonth
                              ? (isDark
                                  ? AppColors.darkSurfaceVariant
                                  : const Color(0xFFF6F7F9))
                              : Colors.transparent),
                      borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                      border: isToday && !selected
                          ? Border.all(color: AppColors.primary, width: 1)
                          : null,
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        FittedBox(
                          fit: BoxFit.scaleDown,
                          child: Text(
                            '${int.parse(day.substring(8))}',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight:
                                  selected ? FontWeight.w700 : FontWeight.w500,
                              color: selected
                                  ? Colors.white
                                  : (inMonth
                                      ? (isDark
                                          ? AppColors.darkTextPrimary
                                          : AppColors.textPrimary)
                                      : (isDark
                                          ? AppColors.darkTextTertiary
                                          : AppColors.textTertiary)),
                            ),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Container(
                          width: 4,
                          height: 4,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: hasTasks
                                ? (selected ? Colors.white : AppColors.primary)
                                : Colors.transparent,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

/// 生成月历区块（周一起始时含上下月补齐日，空串表示留白）。
List<String> buildMonthGrid(DateTime month, {bool startMonday = true}) {
  final first = DateTime(month.year, month.month, 1);
  final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
  final leading = startMonday
      ? (first.weekday + 6) % 7
      : first.weekday % 7;
  final cells = <String>[];
  for (var i = 0; i < leading; i++) {
    cells.add('');
  }
  for (var d = 1; d <= daysInMonth; d++) {
    cells.add(
      '${TaskTime.monthKey(first)}-${d.toString().padLeft(2, '0')}',
    );
  }
  while (cells.length % 7 != 0) {
    cells.add('');
  }
  return cells;
}
