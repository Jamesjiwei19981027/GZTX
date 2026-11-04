import 'package:flutter/material.dart';

import '../../../design/design.dart';
import '../../reports/models/report_models.dart';

/// 与网页 `latestReportByUser` 同口径：按 `submitted_at || created_at` 取最新，
/// 时间相同或缺失（含解析失败）时再比 id。按时刻比较，不受时区写法影响。
Map<int, AgentReport> latestReportByUser(Iterable<AgentReport> reports) {
  final result = <int, AgentReport>{};
  for (final report in reports) {
    final userId = report.authorUserId;
    if (userId == null) continue;
    final existing = result[userId];
    if (existing == null || _isNewerReport(report, existing)) {
      result[userId] = report;
    }
  }
  return result;
}

DateTime? _reportTime(AgentReport report) {
  final submitted = report.submittedAt;
  final raw = (submitted != null && submitted.isNotEmpty)
      ? submitted
      : report.createdAt;
  if (raw == null || raw.isEmpty) return null;
  return DateTime.tryParse(raw)?.toUtc();
}

bool _isNewerReport(AgentReport a, AgentReport b) {
  final ta = _reportTime(a);
  final tb = _reportTime(b);
  if (ta != null && tb != null && ta != tb) return ta.isAfter(tb);
  return a.id > b.id;
}

String reportStatusLabel(AgentReport? report) {
  if (report == null) return '暂无汇报';
  if (report.status == 'draft') {
    return '草稿待提交 · ${report.sourceCount} 条来源';
  }
  if (report.isSubmitted ||
      report.status == 'submitted' ||
      report.status == 'aggregated') {
    final raw = report.submittedAt ?? report.createdAt;
    if (raw != null && raw.isNotEmpty) {
      final dt = DateTime.tryParse(raw)?.toLocal();
      if (dt != null) {
        final m = dt.month.toString().padLeft(2, '0');
        final d = dt.day.toString().padLeft(2, '0');
        final hh = dt.hour.toString().padLeft(2, '0');
        final mm = dt.minute.toString().padLeft(2, '0');
        return '$m-$d $hh:$mm 已提交';
      }
    }
    return '已提交';
  }
  return report.statusLabel;
}

class AxisReportPresentation {
  const AxisReportPresentation({
    required this.text,
    required this.textColor,
    this.icon,
    this.iconColor,
  });

  final String text;
  final Color textColor;
  final IconData? icon;
  final Color? iconColor;
}

AxisReportPresentation formatReportPresentation(
  AgentReport? report, {
  required bool isDark,
}) {
  if (report == null) {
    return AxisReportPresentation(
      text: '暂无汇报',
      textColor: AppColors.textTertiaryOf(isDark),
      icon: null,
      iconColor: null,
    );
  }
  if (report.status == 'draft') {
    return AxisReportPresentation(
      text: reportStatusLabel(report),
      textColor: AppColors.primary,
      icon: Icons.description_outlined,
      iconColor: AppColors.primary,
    );
  }
  if (report.isSubmitted ||
      report.status == 'submitted' ||
      report.status == 'aggregated') {
    return AxisReportPresentation(
      text: reportStatusLabel(report),
      textColor: AppColors.success,
      icon: Icons.check_circle,
      iconColor: AppColors.success,
    );
  }
  return AxisReportPresentation(
    text: reportStatusLabel(report),
    textColor: AppColors.textSecondaryOf(isDark),
    icon: null,
    iconColor: null,
  );
}
