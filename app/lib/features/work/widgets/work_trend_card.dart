/// 首页「任务趋势」卡片（对应网页 `components/TaskTrendCard.tsx`）。
library;

import 'package:flutter/material.dart';

import '../../../design/design.dart';
import '../data/work_api.dart';
import '../data/work_models.dart';
import 'work_widgets.dart';

/// 周期选项：本周 / 本月 / 本季度（本季度仅在展开统计详情后出现）。
const _periodLabels = <String, String>{
  'week': '本周',
  'month': '本月',
  'quarter': '本季度',
};

class WorkTrendCard extends StatefulWidget {
  const WorkTrendCard({
    super.key,
    required this.api,
    this.projectId,
    this.reloadToken = 0,
    this.initiallyExpanded = false,
  });

  final WorkApi api;
  final int? projectId;
  final int reloadToken;
  final bool initiallyExpanded;

  @override
  State<WorkTrendCard> createState() => _WorkTrendCardState();
}

class _WorkTrendCardState extends State<WorkTrendCard> {
  String _period = 'week';
  late bool _expanded = widget.initiallyExpanded;
  bool _loading = true;
  Object? _error;
  TaskTrend? _trend;
  TaskStatsSummary? _stats;

  /// 请求序号：参数变化后旧回调不得写回结果。
  int _token = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(covariant WorkTrendCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.projectId != widget.projectId ||
        oldWidget.reloadToken != widget.reloadToken) {
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
        widget.api.trend(_period, projectId: widget.projectId),
        widget.api.stats(_period, projectId: widget.projectId),
      ]);
      if (!mounted || token != _token) return;
      setState(() {
        _trend = results[0] as TaskTrend;
        _stats = results[1] as TaskStatsSummary;
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

  void _selectPeriod(String value) {
    if (value == _period) return;
    setState(() => _period = value);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final series = _trend?.series ?? const <TrendPoint>[];
    final periods = <String>['week', 'month', if (_expanded) 'quarter'];

    return WorkSection(
      title: '任务趋势',
      trailing: Wrap(
        spacing: 4,
        children: periods.map((value) {
          final selected = value == _period;
          return InkWell(
            onTap: () => _selectPeriod(value),
            borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
            child: Container(
              constraints: const BoxConstraints(minHeight: 32),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: selected
                    ? (isDark ? AppColors.darkSurfaceVariant : const Color(0xFFEAF1FC))
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              ),
              child: Text(
                _periodLabels[value]!,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                  color: selected
                      ? AppColors.primary
                      : (isDark
                          ? AppColors.darkTextSecondary
                          : AppColors.textSecondary),
                ),
              ),
            ),
          );
        }).toList(),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            widget.projectId == null ? '全部可见任务' : '当前项目及个人待办',
            style: TextStyle(
              fontSize: 11,
              color: isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 20),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  AppLoading(size: 18),
                  SizedBox(width: AppSpacing.sm),
                  Text(
                    '正在同步趋势…',
                    style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
                  ),
                ],
              ),
            )
          else if (_error != null)
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '趋势加载失败：${describeError(_error!).message}',
                  style: const TextStyle(fontSize: 13, color: AppColors.danger),
                ),
                const SizedBox(height: AppSpacing.sm),
                AppButton(
                  label: '重试',
                  size: AppButtonSize.sm,
                  variant: AppButtonVariant.secondary,
                  onPressed: _load,
                ),
              ],
            )
          else ...[
            Wrap(
              spacing: AppSpacing.lg,
              runSpacing: 4,
              children: [
                Text(
                  '新增 ${_trend?.totalCreated ?? 0}',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primary,
                  ),
                ),
                Text(
                  '完成 ${_trend?.totalCompleted ?? 0}',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF047857),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            if (series.isEmpty)
              const WorkEmptyHint(text: '这个周期暂无新增或完成记录')
            else ...[
              WorkTrendChart(series: series),
              const SizedBox(height: 4),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    series.first.date.length >= 5
                        ? series.first.date.substring(5)
                        : series.first.date,
                    style: TextStyle(
                      fontSize: 10,
                      color: isDark
                          ? AppColors.darkTextTertiary
                          : AppColors.textTertiary,
                    ),
                  ),
                  Text(
                    series.last.date.length >= 5
                        ? series.last.date.substring(5)
                        : series.last.date,
                    style: TextStyle(
                      fontSize: 10,
                      color: isDark
                          ? AppColors.darkTextTertiary
                          : AppColors.textTertiary,
                    ),
                  ),
                ],
              ),
              if (series.every((p) => p.created == 0 && p.completed == 0))
                const WorkEmptyHint(text: '这个周期暂无新增或完成记录'),
            ],
            if (_expanded && _stats != null) ...[
              const SizedBox(height: AppSpacing.md),
              Text(
                '本周期新建 ${_stats!.total} 项：待办 ${_stats!.pending} · '
                '进行中 ${_stats!.inProgress} · 已完成 ${_stats!.completed}，'
                '其中未完成且逾期 ${_stats!.overdue} 项。',
                style: TextStyle(
                  fontSize: 12,
                  height: 1.5,
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '上方完成数包含以前创建、本周期完成的任务；首页卡片包含所有日期的任务，因此数量可能不同。',
                style: TextStyle(
                  fontSize: 11,
                  height: 1.4,
                  color: isDark
                      ? AppColors.darkTextTertiary
                      : AppColors.textTertiary,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 160),
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: series
                        .map(
                          (point) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 2),
                            child: Text(
                              '${point.date}　新增 ${point.created} / 完成 ${point.completed}',
                              style: TextStyle(
                                fontSize: 12,
                                color: isDark
                                    ? AppColors.darkTextSecondary
                                    : AppColors.textSecondary,
                              ),
                            ),
                          ),
                        )
                        .toList(),
                  ),
                ),
              ),
            ],
          ],
          const SizedBox(height: AppSpacing.sm),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(
              onPressed: () {
                setState(() {
                  _expanded = !_expanded;
                  if (!_expanded && _period == 'quarter') _period = 'week';
                });
                if (!_expanded && _period != 'week') _load();
              },
              child: Text(_expanded ? '收起统计详情' : '展开统计详情'),
            ),
          ),
        ],
      ),
    );
  }
}
