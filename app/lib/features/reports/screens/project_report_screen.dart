import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_provider.dart';
import '../../../core/errors/app_error.dart';
import '../../../design/design.dart';
import '../data/reports_api.dart';
import '../models/report_capabilities.dart';
import '../models/report_models.dart';
import '../widgets/report_ui.dart';
import 'report_scope.dart';

enum ProjectReportMode { contrast, aggregate }

/// 项目资料对照与项目汇总（路由 `ai-project-contrast`、`ai-project-aggregate`）。
///
/// 对齐网页版 `ProjectReportScreen.tsx` 的两个视图，但差异项与统计全部来自
/// 服务端汇报数据；网页里的示例对照卡片不再硬编码，没有数据就展示空状态。
class ProjectReportScreen extends StatefulWidget {
  const ProjectReportScreen({
    super.key,
    this.api,
    this.userId,
    this.projectId,
    this.projectName,
    this.mode = ProjectReportMode.aggregate,
  });

  final ReportsApi? api;
  final int? userId;
  final int? projectId;
  final String? projectName;
  final ProjectReportMode mode;

  @override
  State<ProjectReportScreen> createState() => _ProjectReportScreenState();
}

class _ProjectReportScreenState extends State<ProjectReportScreen> {
  ReportsApi? _api;
  int _projectId = 0;
  int _version = 0;
  int _scopeVersion = 0;
  bool _disposed = false;
  bool _synced = false;
  late ProjectReportMode _mode;

  bool _loading = true;
  bool _aggregating = false;
  String? _error;
  bool _forbidden = false;
  bool _networkError = false;
  String? _actionError;
  String? _notice;
  List<AgentReport> _reports = const [];
  ProjectReportAggregate? _aggregate;
  ReportSummaryList _summaries = const ReportSummaryList();
  bool _publishing = false;
  PublishedReportSummary? get _pendingSummary {
    for (final summary in _summaries.items) {
      if (!summary.isPublished) return summary;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    _mode = widget.mode;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(covariant ProjectReportScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.projectId != widget.projectId ||
        oldWidget.api != widget.api ||
        oldWidget.mode != widget.mode) {
      _mode = widget.mode;
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
    if (_synced && api == _api && projectId == _projectId) return;
    _synced = true;
    _api = api;
    _projectId = projectId;
    _scopeVersion++;
    _aggregating = false;
    _aggregate = null;
    _summaries = const ReportSummaryList();
    _publishing = false;
    _notice = null;
    _actionError = null;
    _load();
  }

  Future<void> _load() async {
    final version = ++_version;
    final projectId = _projectId;
    if (projectId <= 0) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _forbidden = false;
      _networkError = false;
    });
    try {
      final summaries = await _api!.listSummaries(projectId);
      List<AgentReport> reports = const [];
      try {
        reports = await _api!.listProjectReports(projectId);
      } on ApiException catch (error) {
        // 企业上级可读已发布摘要，原始成员汇报仍按项目权限保护。
        if (summaries.canPublish || error.statusCode != 403) rethrow;
      }
      if (_disposed || version != _version) return;
      setState(() {
        _reports = reports;
        _summaries = summaries;
        _loading = false;
      });
    } catch (cause) {
      if (_disposed || version != _version) return;
      setState(() {
        _loading = false;
        _error = reportErrorMessage(cause, fallback: '加载项目汇报记录失败');
        _forbidden = cause is ApiException && cause.statusCode == 403;
        _networkError = cause is NetworkException;
      });
    }
  }

  Future<void> _aggregateReports() async {
    if (_aggregating ||
        _projectId <= 0 ||
        !_hasPendingSubmissions ||
        !_summaries.canPublish) {
      return;
    }
    final projectId = _projectId;
    final scopeVersion = _scopeVersion;
    setState(() {
      _aggregating = true;
      _actionError = null;
      _notice = null;
    });
    try {
      final result = await _api!.aggregateProject(projectId);
      if (!mounted || scopeVersion != _scopeVersion) return;
      setState(() {
        _aggregate = result;
        _notice = '已基于已提交的下属汇报生成最新项目汇总摘要';
      });
      await _load();
    } catch (cause) {
      if (!mounted || scopeVersion != _scopeVersion) return;
      setState(() {
        _actionError =
            reportErrorMessage(cause, fallback: '汇总项目汇报失败，请确认项目管理者权限');
      });
    } finally {
      if (mounted && scopeVersion == _scopeVersion) {
        setState(() => _aggregating = false);
      }
    }
  }

  Future<void> _publish() async {
    final summary = _pendingSummary;
    final projectId = _projectId;
    final scopeVersion = _scopeVersion;
    if (summary == null || !_summaries.canPublish || _publishing) return;
    final confirmed = await showAppConfirmDialog(
        context: context,
        title: '确认发布项目摘要？',
        message: '发布后项目成员与接收上级可查看这一版项目摘要。',
        confirmLabel: '确认发布');
    if (!confirmed || !mounted || scopeVersion != _scopeVersion) return;
    setState(() {
      _publishing = true;
      _actionError = null;
      _notice = null;
    });
    try {
      final published = await _api!.publishSummary(projectId, summary.id);
      if (!mounted || scopeVersion != _scopeVersion) return;
      setState(() {
        _summaries = ReportSummaryList(
            canPublish: _summaries.canPublish,
            items: _summaries.items
                .map((item) => item.id == published.id ? published : item)
                .toList());
        _notice = '项目摘要已发布';
      });
    } catch (error) {
      if (mounted && scopeVersion == _scopeVersion) {
        setState(() =>
            _actionError = reportErrorMessage(error, fallback: '发布失败，请重试'));
      }
    } finally {
      if (mounted && scopeVersion == _scopeVersion) {
        setState(() => _publishing = false);
      }
    }
  }

  void _viewSummary(PublishedReportSummary summary) {
    showAppBottomSheet<void>(
        context: context,
        title: '已发布版本 ${summary.id}',
        builder: (context) => SingleChildScrollView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                        '发布时间：${formatReportFullDateTime(summary.publishedAt)}'),
                    if (summary.publisherName != null)
                      Text('发布人：${summary.publisherName}'),
                    const SizedBox(height: AppSpacing.md),
                    SelectableText(summary.summaryText),
                  ]),
            ));
  }

  List<ReportConflict> get _conflicts {
    final fromEnvelope = extractReportConflicts(_aggregate?.payloadJson);
    if (fromEnvelope.isNotEmpty) return fromEnvelope;
    return detectReportConflicts(_reports);
  }

  int get _submittedCount =>
      _reports.where((report) => report.isSubmitted).length;

  bool get _hasPendingSubmissions =>
      _reports.any((report) => report.status == 'submitted');

  int get _missingSourceCount => _reports
      .where((report) => report.isSubmitted && report.sourceCount == 0)
      .length;

  @override
  Widget build(BuildContext context) {
    final projectId = ReportScope.projectId(context, widget.projectId);
    final title = _mode == ProjectReportMode.contrast ? '项目资料对照' : '项目汇总与发布';
    if (projectId <= 0) {
      return AppScaffold(
        title: title,
        body: const AppEmptyState(
          title: '请选择具体项目',
          description: '项目资料对照与汇报汇总按项目隔离，请先切换到具体项目。',
          icon: AppIcon('folder', size: 44, color: AppColors.primary),
        ),
      );
    }
    return AppScaffold(
      title: title,
      actions: [
        TextButton(
          onPressed: () => setState(() {
            _mode = _mode == ProjectReportMode.contrast
                ? ProjectReportMode.aggregate
                : ProjectReportMode.contrast;
          }),
          child: Text(
            _mode == ProjectReportMode.contrast ? '周报汇总' : '资料对照',
            style: const TextStyle(fontSize: 13, color: AppColors.primary),
          ),
        ),
      ],
      body: _buildBody(context, projectId),
    );
  }

  Widget _buildBody(BuildContext context, int projectId) {
    if (_loading) return const Center(child: AppLoading());
    if (_error != null) {
      return ReportErrorView(
        message: _error!,
        forbidden: _forbidden,
        network: _networkError,
        onRetry: _load,
      );
    }
    return _mode == ProjectReportMode.contrast
        ? _contrastView(context, projectId)
        : _aggregateView(context, projectId);
  }

  Widget _contrastView(BuildContext context, int projectId) {
    final conflicts = _conflicts;
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        const ReportInfoBanner(
          'AI 辅助核验汇报事实，差异由项目管理者确认。对照结果不自动覆盖任务实际状态。',
        ),
        const SizedBox(height: AppSpacing.lg),
        ReportCard(
          child: Row(
            children: [
              _stat('$_submittedCount', '已提交汇报', AppColors.success),
              _stat('${conflicts.length}', '差异项', AppColors.warning),
              _stat('$_missingSourceCount', '来源不足', AppColors.textSecondary),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        const ReportSectionTitle('对照结果'),
        const SizedBox(height: AppSpacing.sm),
        if (conflicts.isEmpty)
          const AppEmptyState(
            title: '暂未发现资料差异',
            description: '当前项目内已提交汇报的任务状态一致；新的差异会在下次汇总时出现。',
            icon: AppIcon('check-circle', size: 44, color: AppColors.success),
          )
        else
          for (final conflict in conflicts) ...[
            ReportCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          conflict.typeLabel,
                          style: const TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w600),
                        ),
                      ),
                      const ReportStatusChip(
                        label: '存在差异',
                        tone: ReportBannerTone.warning,
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    '${conflict.detail}'
                    '${conflict.taskId == null ? '' : '\n关联任务编号：${conflict.taskId}'}',
                    style: const TextStyle(
                      fontSize: 12,
                      height: 1.5,
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  AppButton(
                    label: '查看责任人与核验依据',
                    variant: AppButtonVariant.secondary,
                    size: AppButtonSize.sm,
                    onPressed: () => context.push(
                      '/reports/review/conflict?projectId=$projectId',
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
        const SizedBox(height: AppSpacing.lg),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.center,
          child: AppButton(
            label: '记录核验意见与差异裁决',
            icon: const AppIcon('edit', size: 17, color: Colors.white),
            onPressed: () =>
                context.push('/reports/review/conflict?projectId=$projectId'),
          ),
        ),
        const SizedBox(height: AppSpacing.xl),
      ],
    );
  }

  Widget _aggregateView(BuildContext context, int projectId) {
    final conflicts = _conflicts;
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Row(
          children: [
            ReportStatusChip(
              label: _pendingSummary != null
                  ? '待管理者确认'
                  : _summaries.items.any((item) => item.isPublished)
                      ? '已发布'
                      : '尚未生成',
              tone: _pendingSummary != null
                  ? ReportBannerTone.warning
                  : ReportBannerTone.info,
            ),
            const Spacer(),
            Flexible(
              child: Text(
                '已收录 $_submittedCount 份成员汇报',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.right,
                style: const TextStyle(
                    fontSize: 11, color: AppColors.textTertiary),
              ),
            ),
          ],
        ),
        if (_notice != null) ...[
          const SizedBox(height: AppSpacing.md),
          ReportInfoBanner(_notice!, tone: ReportBannerTone.info),
        ],
        if (_actionError != null) ...[
          const SizedBox(height: AppSpacing.md),
          ReportInfoBanner(_actionError!, tone: ReportBannerTone.error),
        ],
        const SizedBox(height: AppSpacing.lg),
        const Text(
          '项目周报',
          style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          ReportScope.projectName(context, widget.projectName),
          style: const TextStyle(fontSize: 11.5, color: AppColors.textTertiary),
        ),
        const SizedBox(height: AppSpacing.lg),
        const ReportSectionTitle('完成情况'),
        const SizedBox(height: AppSpacing.sm),
        ReportCard(
          child: Text(
            _aggregate?.summaryText.trim().isNotEmpty == true
                ? _aggregate!.summaryText
                : _pendingSummary?.summaryText ??
                    (_summaries.items
                            .where((item) => item.isPublished)
                            .firstOrNull
                            ?.summaryText ??
                        '尚未生成项目汇总。点击下方按钮，基于已提交的下属汇报生成摘要。'),
            style: const TextStyle(fontSize: 13, height: 1.55),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        const ReportSectionTitle('风险与待决策'),
        const SizedBox(height: AppSpacing.sm),
        ReportCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              _linkRow(
                context,
                title: '资料差异与待补材料',
                subtitle:
                    conflicts.isEmpty ? '暂无差异项' : '${conflicts.length} 项待确认',
                onTap: () => context.push(
                  '/reports/review/followup?projectId=$projectId',
                ),
              ),
              Divider(
                height: 1,
                color: isDarkMode(context)
                    ? AppColors.darkBorder
                    : AppColors.borderLight,
              ),
              _linkRow(
                context,
                title: '资料差异确认',
                subtitle: 'AI 辅助核验，管理者裁决',
                onTap: () => context.push(
                  '/reports/review/conflict?projectId=$projectId',
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        const ReportSectionTitle('汇总依据'),
        const SizedBox(height: AppSpacing.sm),
        ReportCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              _linkRow(
                context,
                title: '下属已提交汇报',
                subtitle: '$_submittedCount 份 · 查看明细',
                onTap: () =>
                    context.push('/reports/inbox?projectId=$projectId'),
              ),
              Divider(
                height: 1,
                color: isDarkMode(context)
                    ? AppColors.darkBorder
                    : AppColors.borderLight,
              ),
              _linkRow(
                context,
                title: '资料差异与冲突项',
                subtitle: '${conflicts.length} 项待确认',
                onTap: () => setState(() => _mode = ProjectReportMode.contrast),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        const ReportInfoBanner(
          '向上级提供项目级摘要封装；其他项目不能读取本项目原始对话与未归档材料。',
        ),
        const SizedBox(height: AppSpacing.lg),
        if (_summaries.canPublish)
          AppButton(
            label: _aggregating ? '正在汇总聚合…' : '生成 / 更新项目汇总',
            isLoading: _aggregating,
            icon: _aggregating
                ? null
                : const AppIcon('ai', size: 17, color: Colors.white),
            onPressed: (_aggregating || !_hasPendingSubmissions)
                ? null
                : _aggregateReports,
          ),
        if (_summaries.canPublish && !_hasPendingSubmissions) ...[
          const SizedBox(height: AppSpacing.xs),
          const Center(
            child: Text(
              '暂无新提交的汇报',
              style: TextStyle(fontSize: 12, color: AppColors.textTertiary),
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.sm),
        if (_summaries.canPublish && _pendingSummary != null)
          AppButton(
            label: '确认发布项目摘要',
            variant: AppButtonVariant.secondary,
            icon: const AppIcon('send', size: 17, color: AppColors.primary),
            onPressed: _publishing ? null : _publish,
          ),
        if (_summaries.items.any((item) => item.isPublished)) ...[
          const SizedBox(height: AppSpacing.lg),
          const ReportSectionTitle('已发布版本'),
          for (final summary
              in _summaries.items.where((item) => item.isPublished))
            ListTile(
                title: Text('查看已发布版本 ${summary.id}'),
                subtitle: Text(formatReportFullDateTime(summary.publishedAt)),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => _viewSummary(summary)),
        ],
        const SizedBox(height: AppSpacing.xl),
      ],
    );
  }

  Widget _linkRow(
    BuildContext context, {
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                        fontSize: 13.5, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: const TextStyle(
                        fontSize: 11.5, color: AppColors.textTertiary),
                  ),
                ],
              ),
            ),
            const AppIcon('chevron-right',
                size: 16, color: AppColors.textTertiary),
          ],
        ),
      ),
    );
  }

  Widget _stat(String value, String label, Color color) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
                fontSize: 20, fontWeight: FontWeight.w700, color: color),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(fontSize: 11, color: AppColors.textTertiary),
          ),
        ],
      ),
    );
  }
}
