import 'package:flutter/material.dart';

import '../../../design/design.dart';
import '../models/report_models.dart';

/// 汇报模块通用视觉组件。
///
/// 统一深色模式、卡片边框、状态标签与列表项，避免各页面各写一套。

class ReportCard extends StatelessWidget {
  const ReportCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.lg),
    this.margin,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    final dark = isDarkMode(context);
    return Container(
      margin: margin,
      padding: padding,
      decoration: BoxDecoration(
        color: dark ? AppColors.darkSurface : AppColors.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        border:
            Border.all(color: dark ? AppColors.darkBorder : AppColors.border),
      ),
      child: child,
    );
  }
}

class ReportSectionTitle extends StatelessWidget {
  const ReportSectionTitle(this.title, {super.key, this.trailing});

  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final dark = isDarkMode(context);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                letterSpacing: 0.4,
                color: dark
                    ? AppColors.darkTextSecondary
                    : AppColors.textSecondary,
              ),
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

enum ReportBannerTone { info, success, warning, error, neutral }

class ReportInfoBanner extends StatelessWidget {
  const ReportInfoBanner(
    this.message, {
    super.key,
    this.tone = ReportBannerTone.info,
    this.icon,
  });

  final String message;
  final ReportBannerTone tone;
  final Widget? icon;

  @override
  Widget build(BuildContext context) {
    final dark = isDarkMode(context);
    final (Color bg, Color fg, Color border, String iconName) = switch (tone) {
      ReportBannerTone.info => (
          const Color(0xFFEAF1FD),
          AppColors.primary,
          const Color(0xFFC9DAF8),
          'info'
        ),
      ReportBannerTone.success => (
          const Color(0xFFE8F5EC),
          AppColors.success,
          const Color(0xFFC4EED0),
          'check-circle'
        ),
      ReportBannerTone.warning => (
          const Color(0xFFFFF7E6),
          AppColors.warning,
          const Color(0xFFF5D9A8),
          'alert'
        ),
      ReportBannerTone.error => (
          const Color(0xFFFDEBE9),
          AppColors.danger,
          const Color(0xFFF3C9C4),
          'alert'
        ),
      ReportBannerTone.neutral => (
          dark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant,
          dark ? AppColors.darkTextSecondary : AppColors.textSecondary,
          dark ? AppColors.darkBorder : AppColors.border,
          'info'
        ),
    };
    final effectiveBg = tone == ReportBannerTone.info && dark
        ? const Color(0xFF16233A)
        : tone == ReportBannerTone.success && dark
            ? const Color(0xFF142A20)
            : tone == ReportBannerTone.warning && dark
                ? const Color(0xFF332515)
                : tone == ReportBannerTone.error && dark
                    ? const Color(0xFF3A1B1B)
                    : bg;
    final effectiveFg = tone == ReportBannerTone.info && dark
        ? const Color(0xFFA8C7FA)
        : tone == ReportBannerTone.success && dark
            ? const Color(0xFF9ADBB4)
            : tone == ReportBannerTone.warning && dark
                ? const Color(0xFFF0BF75)
                : tone == ReportBannerTone.error && dark
                    ? const Color(0xFFF2B8B5)
                    : fg;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: effectiveBg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(
          color: dark ? AppColors.darkBorder : border,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          icon ?? AppIcon(iconName, size: 18, color: effectiveFg),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              message,
              style: TextStyle(fontSize: 13, height: 1.45, color: effectiveFg),
            ),
          ),
        ],
      ),
    );
  }
}

class ReportStatusChip extends StatelessWidget {
  const ReportStatusChip({
    super.key,
    required this.label,
    this.tone = ReportBannerTone.neutral,
  });

  final String label;
  final ReportBannerTone tone;

  @override
  Widget build(BuildContext context) {
    final dark = isDarkMode(context);
    final (Color bg, Color fg) = switch (tone) {
      ReportBannerTone.success => (
          dark ? const Color(0xFF173A29) : const Color(0xFFE8F5EC),
          dark ? const Color(0xFF9ADBB4) : AppColors.success,
        ),
      ReportBannerTone.warning => (
          dark ? const Color(0xFF3B2C16) : const Color(0xFFFFF3DC),
          dark ? const Color(0xFFF0BF75) : AppColors.warning,
        ),
      ReportBannerTone.error => (
          dark ? const Color(0xFF3A1B1B) : const Color(0xFFFDEBE9),
          dark ? const Color(0xFFF2B8B5) : AppColors.danger,
        ),
      ReportBannerTone.info => (
          dark ? const Color(0xFF16233A) : const Color(0xFFEAF1FD),
          dark ? const Color(0xFFA8C7FA) : AppColors.primary,
        ),
      _ => (
          dark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant,
          dark ? AppColors.darkTextSecondary : AppColors.textSecondary,
        ),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: fg),
      ),
    );
  }
}

/// 汇报项目选择条。只有一个项目时展示静态名称，多于一个项目可切换。
class ReportProjectBar extends StatelessWidget {
  const ReportProjectBar({
    super.key,
    required this.projectName,
    this.projects = const [],
    this.onSelect,
  });

  final String projectName;
  final List<ProjectOption> projects;
  final ValueChanged<ProjectOption>? onSelect;

  @override
  Widget build(BuildContext context) {
    final dark = isDarkMode(context);
    final canSwitch = projects.length > 1 && onSelect != null;
    return Material(
      color: dark ? AppColors.darkSurface : AppColors.surface,
      child: InkWell(
        onTap: canSwitch
            ? () async {
                await showAppActionSheet(
                  context: context,
                  title: '选择汇报项目',
                  message: '不同项目的对话、汇报与草稿严格隔离',
                  actions: [
                    for (final project in projects)
                      AppActionSheetItem(
                        label: project.name,
                        onPressed: () => onSelect!(project),
                      ),
                  ],
                );
              }
            : null,
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.md,
          ),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: dark ? AppColors.darkBorder : AppColors.border,
              ),
            ),
          ),
          child: Row(
            children: [
              Text(
                '汇报项目',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: dark
                      ? AppColors.darkTextSecondary
                      : AppColors.textSecondary,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Text(
                  projectName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 14,
                    color: dark
                        ? AppColors.darkTextPrimary
                        : AppColors.textPrimary,
                  ),
                ),
              ),
              if (canSwitch)
                AppIcon(
                  'chevron-down',
                  size: 18,
                  color: dark
                      ? AppColors.darkTextTertiary
                      : AppColors.textTertiary,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 选择项目的数据载体，避免页面依赖 AuthState 的具体类型。
class ProjectOption {
  const ProjectOption({required this.id, required this.name});

  final int id;
  final String name;
}

/// iOS 上 CupertinoPageScaffold 不会自动让出键盘高度，这里统一补内边距；
/// Android 由 Scaffold 的 resizeToAvoidBottomInset 处理，不能重复抬升。
class ReportKeyboardPadding extends StatelessWidget {
  const ReportKeyboardPadding({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.viewInsetsOf(context).bottom;
    final extra = isCupertinoPlatform(context) ? inset : 0.0;
    return Padding(
      padding: EdgeInsets.only(bottom: extra),
      child: child,
    );
  }
}

/// 来源依据列表（对齐网页版 `ReportSources.tsx`）
class ReportSourcesList extends StatelessWidget {
  const ReportSourcesList({
    super.key,
    this.sources = const [],
    this.taskSnapshots = const [],
    this.evidenceSnapshots = const [],
  });

  final List<ReportSource> sources;
  final List<ReportTaskSnapshot> taskSnapshots;
  final List<ReportEvidenceSnapshot> evidenceSnapshots;

  @override
  Widget build(BuildContext context) {
    final items = <({
      String key,
      String type,
      String title,
      String detail,
      bool completed
    })>[];
    for (var index = 0; index < sources.length; index++) {
      final source = sources[index];
      if ((source.sourceType == 'task' &&
              taskSnapshots.any((task) => task.id == source.sourceId)) ||
          (const ['evidence', 'evidence_package'].contains(source.sourceType) &&
              evidenceSnapshots
                  .any((evidence) => evidence.id == source.sourceId))) {
        continue;
      }
      items.add((
        key: 'source-${source.id ?? index}',
        type: source.sourceType,
        title: source.title,
        detail: source.detail,
        completed: false,
      ));
    }
    for (final task in taskSnapshots) {
      items.add((
        key: 'task-${task.id}',
        type: 'task',
        title: task.title,
        detail: '任务快照 · 状态：${task.statusLabel}',
        completed: task.statusLabel == '已完成',
      ));
    }
    for (final evidence in evidenceSnapshots) {
      final summary = evidence.summary?.trim();
      items.add((
        key: 'evidence-${evidence.id}',
        type: 'evidence',
        title: summary != null && summary.isNotEmpty ? summary : '项目材料证据',
        detail:
            '材料快照 · 状态：${evidence.statusLabel} · 附件：${evidence.fileCount} 个',
        completed: false,
      ));
    }

    final dark = isDarkMode(context);
    if (items.isEmpty) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: dark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant,
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        ),
        child: Text(
          '暂无事实来源依据',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 12,
            color: dark ? AppColors.darkTextTertiary : AppColors.textTertiary,
          ),
        ),
      );
    }

    return ReportCard(
      padding: EdgeInsets.zero,
      child: Column(
        children: [
          for (var index = 0; index < items.length; index++) ...[
            if (index > 0)
              Divider(
                height: 1,
                color: dark ? AppColors.darkBorder : AppColors.borderLight,
              ),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.md,
              ),
              child: Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: dark
                          ? AppColors.darkSurfaceVariant
                          : AppColors.surfaceVariant,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                    ),
                    child: Center(
                      child: AppIcon(
                        reportSourceIcon(items[index].type),
                        size: 18,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          items[index].title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: completedTitleStyle(
                            isDark: dark,
                            completed: items[index].completed,
                            base: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: dark
                                  ? AppColors.darkTextPrimary
                                  : AppColors.textPrimary,
                            ),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          items[index].detail,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 12,
                            color: dark
                                ? AppColors.darkTextTertiary
                                : AppColors.textTertiary,
                          ),
                        ),
                      ],
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

/// 页面级错误展示（区分断网、无权限、普通失败）
class ReportErrorView extends StatelessWidget {
  const ReportErrorView({
    super.key,
    required this.message,
    this.onRetry,
    this.forbidden = false,
    this.network = false,
  });

  final String message;
  final VoidCallback? onRetry;
  final bool forbidden;
  final bool network;

  @override
  Widget build(BuildContext context) {
    if (forbidden) {
      return const AppErrorState(
        isForbidden: true,
        message: '您暂未获得该汇报页面的访问授权',
      );
    }
    return AppErrorState(
      title: network ? '网络连接异常' : '加载失败',
      message: message,
      onRetry: onRetry,
    );
  }
}

/// 状态标签对应的色调
ReportBannerTone statusTone(String? status) {
  switch (status) {
    case 'submitted':
    case 'aggregated':
      return ReportBannerTone.success;
    case 'draft':
      return ReportBannerTone.warning;
    default:
      return ReportBannerTone.neutral;
  }
}
