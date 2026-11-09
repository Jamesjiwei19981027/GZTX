import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_provider.dart';
import '../../../core/errors/app_error.dart';
import '../../../design/design.dart';
import '../data/reports_api.dart';
import '../models/report_capabilities.dart';
import '../models/report_models.dart';
import '../widgets/report_ui.dart';
import '../widgets/report_review_card.dart';
import 'report_scope.dart';

enum ReportDetailMode { history, detail, submitted }

/// 汇报详情、历史与送达状态（路由 `ai-report-detail`、`ai-report-submitted`）。
///
/// 对齐网页版 `ReportDetailScreen.tsx`：
/// - 无 reportId：汇报历史与版本列表（可筛选草稿/已提交）；
/// - 有 reportId：单份汇报详情与来源；
/// - submitted：提交成功后的流转与送达节点，AI 回执严格显示“状态暂不可确认”。
class ReportDetailScreen extends StatefulWidget {
  const ReportDetailScreen({
    super.key,
    this.api,
    this.userId,
    this.projectId,
    this.projectName,
    this.reportId,
    this.fromManager = false,
    this.mode = ReportDetailMode.history,
  });

  final ReportsApi? api;
  final int? userId;
  final int? projectId;
  final String? projectName;
  final int? reportId;
  final bool fromManager;
  final ReportDetailMode mode;

  @override
  State<ReportDetailScreen> createState() => _ReportDetailScreenState();
}

class _ReportDetailScreenState extends State<ReportDetailScreen> {
  ReportsApi? _api;
  int _projectId = 0;
  int _userId = 0;
  int? _reportId;
  int _version = 0;
  bool _disposed = false;
  bool _synced = false;

  bool _loading = true;
  String? _error;
  bool _networkError = false;
  bool _forbidden = false;
  List<AgentReport> _reports = const [];
  AgentReport? _selected;
  List<ReportMember> _members = const [];
  String _filter = 'all'; // all | submitted | draft
  late ReportDetailMode _mode;

  @override
  void initState() {
    super.initState();
    _mode = widget.mode == ReportDetailMode.history && widget.reportId != null
        ? ReportDetailMode.detail
        : widget.mode;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(covariant ReportDetailScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.projectId != widget.projectId ||
        oldWidget.api != widget.api ||
        oldWidget.userId != widget.userId ||
        oldWidget.reportId != widget.reportId ||
        oldWidget.mode != widget.mode ||
        oldWidget.fromManager != widget.fromManager) {
      _mode = widget.mode == ReportDetailMode.history && widget.reportId != null
          ? ReportDetailMode.detail
          : widget.mode;
      _sync();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  void _sync() {
    final api = widget.api ?? ReportsApi(context.apiClient);
    final projectId = ReportScope.projectId(context, widget.projectId);
    final userId = ReportScope.userId(context, widget.userId);
    final reportId = widget.reportId;
    if (_synced &&
        api == _api &&
        projectId == _projectId &&
        userId == _userId &&
        reportId == _reportId) {
      return;
    }
    _synced = true;
    _api = api;
    _projectId = projectId;
    _userId = userId;
    _reportId = reportId;
    _load();
  }

  Future<void> _load() async {
    final version = ++_version;
    final projectId = _projectId;
    final reportId = _reportId;
    if (projectId <= 0) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = null;
          _reports = const [];
          _selected = null;
        });
      }
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _networkError = false;
      _forbidden = false;
    });
    try {
      final results = await Future.wait<Object?>([
        _api!.listMyReports(projectId: projectId),
        _api!.listProjectMembers(projectId),
        reportId != null
            ? _api!.getReport(reportId)
            : Future<AgentReport?>.value(),
      ]);
      if (_disposed || version != _version) return;
      final reports = results[0] as List<AgentReport>;
      final members = results[1] as List<ReportMember>;
      final detail = results[2] as AgentReport?;
      AgentReport? selected = detail;
      if (selected == null && reportId != null) {
        for (final report in reports) {
          if (report.id == reportId) {
            selected = report;
            break;
          }
        }
      }
      if (selected == null &&
          reportId == null &&
          _mode != ReportDetailMode.history &&
          reports.isNotEmpty) {
        selected = reports.first;
      }
      setState(() {
        _reports = reports;
        _members = members;
        _selected = selected;
        _loading = false;
        if (reportId != null && selected == null) {
          _error = '汇报不存在或无权查看';
        }
      });
    } catch (cause) {
      if (_disposed || version != _version) return;
      setState(() {
        _loading = false;
        _error = reportErrorMessage(cause, fallback: '加载汇报详情失败');
        _networkError = cause is NetworkException;
        _forbidden = cause is ApiException && cause.statusCode == 403;
      });
    }
  }

  List<AgentReport> get _filteredReports {
    switch (_filter) {
      case 'draft':
        return _reports.where((report) => report.status == 'draft').toList();
      case 'submitted':
        return _reports.where((report) => report.isSubmitted).toList();
      default:
        return _reports;
    }
  }

  @override
  Widget build(BuildContext context) {
    final projectId = ReportScope.projectId(context, widget.projectId);
    final title = switch (_mode) {
      ReportDetailMode.submitted => '汇报提交与送达',
      ReportDetailMode.detail => '汇报详情与版本',
      ReportDetailMode.history => '汇报历史与版本',
    };

    if (projectId <= 0) {
      return AppScaffold(
        title: title,
        body: const AppEmptyState(
          title: '请选择具体项目',
          description: '汇报按项目隔离，请先切换到具体项目。',
          icon: AppIcon('folder', size: 44, color: AppColors.primary),
        ),
      );
    }

    return AppScaffold(
      title: title,
      body: _buildBody(context, projectId),
    );
  }

  Widget _buildBody(BuildContext context, int projectId) {
    if (_loading) {
      return const Center(child: AppLoading());
    }
    if (_error != null) {
      return ReportErrorView(
        message: _error!,
        forbidden: _forbidden,
        network: _networkError,
        onRetry: _load,
      );
    }
    if (_mode == ReportDetailMode.submitted) {
      return _submittedView(context, projectId);
    }
    if (_mode == ReportDetailMode.detail) {
      return _detailView(context, projectId);
    }
    return _historyView(context, projectId);
  }

  Widget _historyView(BuildContext context, int projectId) {
    final filtered = _filteredReports;
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        AppSegmentedControl<String>(
          segments: const {'all': '全部', 'submitted': '已提交', 'draft': '草稿'},
          selectedValue: _filter,
          onValueChanged: (value) => setState(() => _filter = value),
        ),
        const SizedBox(height: AppSpacing.lg),
        if (filtered.isEmpty)
          AppEmptyState(
            title: '暂无汇报记录',
            description: '您在当前项目中尚未提交任何汇报。可以在项目 AI 入口整理本周进展。',
            icon: const AppIcon('file', size: 44, color: AppColors.primary),
            actionLabel: '整理本周汇报',
            onAction: () =>
                context.push('/reports/create?projectId=$projectId'),
          )
        else
          ReportCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (var index = 0; index < filtered.length; index++) ...[
                  if (index > 0)
                    Divider(
                      height: 1,
                      color: isDarkMode(context)
                          ? AppColors.darkBorder
                          : AppColors.borderLight,
                    ),
                  _historyRow(
                      context, filtered[index], filtered.length - index),
                ],
              ],
            ),
          ),
      ],
    );
  }

  Widget _historyRow(BuildContext context, AgentReport report, int version) {
    final dark = isDarkMode(context);
    final submitted = report.isSubmitted;
    return InkWell(
      onTap: () => setState(() {
        _selected = report;
        _mode = ReportDetailMode.detail;
      }),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          report.summaryPreview,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: dark
                                ? AppColors.darkTextPrimary
                                : AppColors.textPrimary,
                          ),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Text(
                        '第 $version 版',
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppColors.textTertiary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    submitted
                        ? '${formatReportMonthDayTime(report.submittedAt)} · 已送达直属领导'
                        : '草稿 · 未提交',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11.5,
                      color: AppColors.textTertiary,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            if (submitted)
              ReportStatusChip(
                label: report.isUnread ? '未读' : '已读',
                tone: report.isUnread
                    ? ReportBannerTone.warning
                    : ReportBannerTone.success,
              )
            else
              const ReportStatusChip(label: '草稿'),
            const SizedBox(width: AppSpacing.xs),
            const AppIcon('chevron-right',
                size: 16, color: AppColors.textTertiary),
          ],
        ),
      ),
    );
  }

  Widget _detailView(BuildContext context, int projectId) {
    final report = _selected;
    if (report == null) {
      return const AppEmptyState(
        title: '汇报不存在',
        description: '该汇报可能已被删除，或您没有查看权限。',
        icon: AppIcon('file', size: 44, color: AppColors.textTertiary),
      );
    }
    final supervisor = resolveDirectSupervisor(
      members: _members,
      currentUserId: report.authorUserId,
      parentUserId: report.parentUserId,
    );
    final delivery = getReportDeliveryStatus(report);
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        ReportCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  ReportStatusChip(
                    label: report.statusLabel,
                    tone: statusTone(report.status),
                  ),
                  const Spacer(),
                  Flexible(
                    child: Text(
                      report.submittedAt == null
                          ? '提交时间：未提交'
                          : '提交时间：${formatReportFullDateTime(report.submittedAt)}',
                      textAlign: TextAlign.right,
                      style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.textTertiary,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              _metaLine(
                  '项目归属', ReportScope.projectName(context, widget.projectName)),
              _metaLine('直属接收', '${supervisor.name}（${delivery.leaderStatus}）'),
              _metaLine('不可变版本', '汇报编号 ${report.id}（系统严格归档）'),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        const ReportSectionTitle('汇报内容摘要'),
        const SizedBox(height: AppSpacing.sm),
        ReportCard(
          child: Text(
            report.summaryText.trim().isEmpty ? '暂无汇报内容' : report.summaryText,
            style: const TextStyle(fontSize: 14, height: 1.55),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        const ReportSectionTitle('引用材料与依据'),
        const SizedBox(height: AppSpacing.sm),
        ReportSourcesList(
          sources: report.sources,
          taskSnapshots: report.taskSnapshots,
          evidenceSnapshots: report.evidenceSnapshots,
        ),
        const SizedBox(height: AppSpacing.lg),
        ReportReviewCard(
            key: ValueKey('review-${report.id}'),
            report: report,
            api: _api!,
            onSaved: (saved) => setState(() => _selected = saved)),
        const SizedBox(height: AppSpacing.lg),
        if (widget.fromManager)
          AppButton(
            label: '返回下属收件箱',
            variant: AppButtonVariant.secondary,
            onPressed: () =>
                context.push('/reports/inbox?projectId=$projectId'),
          ),
      ],
    );
  }

  Widget _metaLine(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text.rich(
        TextSpan(
          children: [
            TextSpan(
              text: '$label：',
              style:
                  const TextStyle(fontSize: 12, color: AppColors.textTertiary),
            ),
            TextSpan(
              text: value,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }

  Widget _submittedView(BuildContext context, int projectId) {
    final report = _selected;
    final supervisor = resolveDirectSupervisor(
      members: _members,
      currentUserId: report?.authorUserId ?? _userId,
      parentUserId: report?.parentUserId,
    );
    final delivery = getReportDeliveryStatus(report);
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        const SizedBox(height: AppSpacing.lg),
        const Center(
          child: CircleAvatar(
            radius: 32,
            backgroundColor: Color(0xFFE8F5EC),
            child: AppIcon('check-circle', size: 34, color: AppColors.success),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        const Center(
          child: Text(
            '汇报已提交',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Center(
          child: Text(
            '${ReportScope.projectName(context, widget.projectName)}'
            ' · ${report?.submittedAt == null ? '刚刚' : formatReportMonthDayTime(report!.submittedAt)}',
            style:
                const TextStyle(fontSize: 11.5, color: AppColors.textTertiary),
          ),
        ),
        const SizedBox(height: AppSpacing.xl),
        ReportCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const ReportSectionTitle('流转与送达节点'),
              const SizedBox(height: AppSpacing.lg),
              _timelineNode(
                context,
                title: '提交成功',
                done: true,
                description: '已生成正式记录。当前报告不可被静默覆盖，完整保留历史版本依据。',
              ),
              _timelineNode(
                context,
                title: '已送达直属领导',
                done: true,
                chip: delivery.leaderStatus,
                chipTone: delivery.leaderRead
                    ? ReportBannerTone.success
                    : ReportBannerTone.warning,
                description: '${supervisor.name} · 人轴责任链实时路由确定'
                    '${delivery.readAt == null ? '' : ' · 已于 ${formatReportTime(delivery.readAt)} 阅读'}',
              ),
              _timelineNode(
                context,
                title: '送达领导智能体',
                done: false,
                chip: ReportDeliveryStatus.aiReceiptStatusText,
                description: ReportDeliveryStatus.aiReceiptDescription,
              ),
              _timelineNode(
                context,
                title: '项目汇报汇总',
                done: false,
                chip: delivery.rollupStatus,
                chipTone: ReportBannerTone.info,
                description: '管理者收件箱与项目对照页面将同步展示最新进展与冲突比对。',
                isLast: true,
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        const ReportInfoBanner(
          '个人提交的汇报不等于项目验收完成。项目验收状态请以责任链事项中的确认结果为准。',
        ),
        const SizedBox(height: AppSpacing.lg),
        AppButton(
          label: '查看汇报详情与来源',
          icon: const AppIcon('file', size: 17, color: Colors.white),
          onPressed: () => setState(() => _mode = ReportDetailMode.detail),
        ),
        const SizedBox(height: AppSpacing.sm),
        AppButton(
          label: '返回我的职责',
          variant: AppButtonVariant.secondary,
          icon: const AppIcon('axis', size: 17, color: AppColors.primary),
          onPressed: () => context.goNamed('axis-root'),
        ),
        const SizedBox(height: AppSpacing.xl),
      ],
    );
  }

  Widget _timelineNode(
    BuildContext context, {
    required String title,
    required bool done,
    required String description,
    String? chip,
    ReportBannerTone chipTone = ReportBannerTone.neutral,
    bool isLast = false,
  }) {
    final dark = isDarkMode(context);
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Column(
            children: [
              Container(
                width: 16,
                height: 16,
                decoration: BoxDecoration(
                  color: done
                      ? AppColors.success
                      : (dark
                          ? AppColors.darkSurfaceVariant
                          : AppColors.surfaceVariant),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(
                    done ? '✓' : '·',
                    style: TextStyle(
                      fontSize: 10,
                      height: 1,
                      color: done ? Colors.white : AppColors.textTertiary,
                    ),
                  ),
                ),
              ),
              if (!isLast)
                Expanded(
                  child: Container(
                    width: 2,
                    margin: const EdgeInsets.symmetric(vertical: 2),
                    color: dark ? AppColors.darkBorder : AppColors.border,
                  ),
                ),
            ],
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : AppSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: AppSpacing.sm,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                          color: done
                              ? (dark
                                  ? AppColors.darkTextPrimary
                                  : AppColors.textPrimary)
                              : (dark
                                  ? AppColors.darkTextSecondary
                                  : AppColors.textSecondary),
                        ),
                      ),
                      if (chip != null)
                        ReportStatusChip(label: chip, tone: chipTone),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text(
                    description,
                    style: const TextStyle(
                      fontSize: 11.5,
                      height: 1.45,
                      color: AppColors.textTertiary,
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
}
