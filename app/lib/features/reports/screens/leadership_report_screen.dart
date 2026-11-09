import 'package:flutter/material.dart';

import '../../../core/auth/auth_provider.dart';
import '../../../core/errors/app_error.dart';
import '../../../design/design.dart';
import '../data/reports_api.dart';
import '../models/report_capabilities.dart';
import '../models/report_models.dart';
import '../widgets/report_ui.dart';
import 'report_scope.dart';

/// 领导层项目总览（路由 `ai-leadership` / `/reports/leadership`）。
///
/// 对齐网页版 `LeadershipReportScreen.tsx`：只有组织总领导可读，服务端返回 403
/// 时展示无权限状态；总领导只接收项目摘要封装，不合并各项目原始上下文。
/// 网页里的项目进度百分比与“需关注/待决策”为静态示例，原生版改为真实项目列表，
/// 不再展示没有数据来源的百分比。
class LeadershipReportScreen extends StatefulWidget {
  const LeadershipReportScreen({
    super.key,
    this.api,
    this.companyId,
    this.projects,
    this.now,
  });

  final ReportsApi? api;
  final int? companyId;
  final List<ProjectOption>? projects;
  final DateTime? now;

  @override
  State<LeadershipReportScreen> createState() => _LeadershipReportScreenState();
}

class _LeadershipReportScreenState extends State<LeadershipReportScreen> {
  ReportsApi? _api;
  int _companyId = 0;
  int _version = 0;
  bool _disposed = false;
  bool _synced = false;

  bool _loading = true;
  bool _forbidden = false;
  bool _networkError = false;
  bool _aggregating = false;
  String? _error;
  String? _actionError;
  LeadershipReport? _report;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(covariant LeadershipReportScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.companyId != widget.companyId ||
        oldWidget.api != widget.api) {
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
    final companyId = ReportScope.companyId(context, widget.companyId);
    if (_synced && api == _api && companyId == _companyId) return;
    _synced = true;
    _api = api;
    _companyId = companyId;
    _load();
  }

  Future<void> _load() async {
    final version = ++_version;
    final companyId = _companyId;
    if (companyId <= 0) {
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
      final report = await _api!.latestLeadership(companyId);
      if (_disposed || version != _version) return;
      setState(() {
        _report = report;
        _loading = false;
      });
    } catch (cause) {
      if (_disposed || version != _version) return;
      final forbidden = cause is ApiException && cause.statusCode == 403;
      setState(() {
        _loading = false;
        _forbidden = forbidden;
        _networkError = cause is NetworkException;
        _error =
            forbidden ? null : reportErrorMessage(cause, fallback: '加载领导层总览失败');
      });
    }
  }

  Future<void> _aggregate() async {
    if (_aggregating || _companyId <= 0) return;
    final companyId = _companyId;
    setState(() {
      _aggregating = true;
      _actionError = null;
    });
    try {
      final report = await _api!.aggregateLeadership(companyId);
      if (!mounted || companyId != _companyId) return;
      setState(() => _report = report);
    } catch (cause) {
      if (!mounted || companyId != _companyId) return;
      setState(() {
        _actionError = reportErrorMessage(cause, fallback: '生成领导层汇总失败');
      });
    } finally {
      if (mounted && companyId == _companyId) {
        setState(() => _aggregating = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    const title = '领导层项目总览';
    if (_forbidden) {
      return const AppScaffold(
        title: title,
        body: AppEmptyState(
          title: '需要总领导权限',
          description: '跨项目总览仅对组织总领导开放。系统保证总领导仅接收允许的项目摘要封装，'
              '不合并各项目原始上下文',
          icon: AppIcon('lock', size: 18, color: AppColors.warning),
        ),
      );
    }
    if (_loading) {
      return const AppScaffold(title: title, body: Center(child: AppLoading()));
    }
    if (_error != null) {
      return AppScaffold(
        title: title,
        body: ReportErrorView(
          message: _error!,
          network: _networkError,
          onRetry: _load,
        ),
      );
    }

    final projects = ReportScope.projectOptions(context, widget.projects);
    final createdAt = _report?.createdAt;
    return AppScaffold(
      title: title,
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          if (_actionError != null) ...[
            ReportInfoBanner(_actionError!, tone: ReportBannerTone.error),
            const SizedBox(height: AppSpacing.md),
          ],
          if (_report == null)
            const ReportInfoBanner(
              '尚未生成组织总汇报。项目汇总完成后，可在这里汇总项目摘要封装。',
              tone: ReportBannerTone.warning,
            )
          else
            ReportInfoBanner(
              '最新组织总汇报更新于 ${formatReportFullDateTime(createdAt).isEmpty ? '未知时间' : formatReportFullDateTime(createdAt)}',
              tone: ReportBannerTone.info,
            ),
          const SizedBox(height: AppSpacing.lg),
          const ReportSectionTitle('组织总汇报摘要'),
          const SizedBox(height: AppSpacing.sm),
          ReportCard(
            child: Text(
              _report?.summaryText.trim().isNotEmpty == true
                  ? _report!.summaryText
                  : '暂无组织总汇报。总领导只能看到各项目的摘要封装，不读取项目原始对话。',
              style: const TextStyle(fontSize: 13, height: 1.55),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          const ReportSectionTitle('项目封装列表'),
          const SizedBox(height: AppSpacing.sm),
          if (projects.isEmpty)
            const ReportCard(
              child: Text(
                '当前企业暂无项目',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: AppColors.textTertiary),
              ),
            )
          else
            for (final project in projects) ...[
              ReportCard(
                child: Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: isDarkMode(context)
                            ? const Color(0xFF16233A)
                            : const Color(0xFFEAF1FD),
                        borderRadius:
                            BorderRadius.circular(AppSpacing.radiusMd),
                      ),
                      child: const Center(
                        child: AppIcon(
                          'folder',
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
                            project.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            '项目摘要封装由项目汇总页生成，按项目隔离',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 12,
                              color: AppColors.textTertiary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const ReportStatusChip(label: '按项目隔离'),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.md),
            ],
          const SizedBox(height: AppSpacing.sm),
          const ReportInfoBanner(
            '总领导 AI 接收项目摘要封装，不合并各项目原始上下文',
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: _aggregating ? '正在汇总项目摘要…' : '汇总项目摘要',
            isLoading: _aggregating,
            icon: _aggregating
                ? null
                : const AppIcon('ai', size: 18, color: Colors.white),
            onPressed: _aggregating ? null : _aggregate,
          ),
          const SizedBox(height: AppSpacing.xl),
        ],
      ),
    );
  }
}
