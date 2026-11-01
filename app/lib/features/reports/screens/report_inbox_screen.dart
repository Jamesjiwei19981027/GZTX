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

/// 直属领导汇报收件箱（路由 `ai-inbox` / `/reports/inbox`）。
///
/// 对齐网页版 `ManagerReportInbox.tsx`：直属下属 / 全部下属切换、
/// 未读 / 全部 / 待补资料筛选、打开即标记已读、覆盖统计与汇总入口。
class ReportInboxScreen extends StatefulWidget {
  const ReportInboxScreen({
    super.key,
    this.api,
    this.userId,
    this.projectId,
    this.projectName,
    this.projects,
    this.onSelectProject,
  });

  final ReportsApi? api;
  final int? userId;
  final int? projectId;
  final String? projectName;
  final List<ProjectOption>? projects;
  final ValueChanged<ProjectOption>? onSelectProject;

  @override
  State<ReportInboxScreen> createState() => _ReportInboxScreenState();
}

class _ReportInboxScreenState extends State<ReportInboxScreen> {
  ReportsApi? _api;
  int _projectId = 0;
  int _userId = 0;
  int _version = 0;
  bool _disposed = false;
  bool _synced = false;

  bool _loading = true;
  String? _error;
  bool _networkError = false;
  bool _forbidden = false;
  List<AgentReport> _reports = const [];
  List<ReportMember> _members = const [];
  List<ReportAgentBinding> _bindings = const [];
  String _scope = 'direct'; // direct | all
  String _filter = 'unread'; // unread | all | need_evidence

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(covariant ReportInboxScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.projectId != widget.projectId ||
        oldWidget.api != widget.api ||
        oldWidget.userId != widget.userId) {
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
    if (_synced &&
        api == _api &&
        projectId == _projectId &&
        userId == _userId) {
      return;
    }
    _synced = true;
    _api = api;
    _projectId = projectId;
    _userId = userId;
    _load();
  }

  Future<void> _load() async {
    final version = ++_version;
    final projectId = _projectId;
    if (projectId <= 0) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = null;
          _reports = const [];
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
      final results = await Future.wait<Object>([
        _api!.listInbox(),
        _api!.listBindings(projectId),
        _api!.listProjectMembers(projectId),
      ]);
      if (_disposed || version != _version) return;
      setState(() {
        _reports = (results[0] as List<AgentReport>)
            .where((report) =>
                report.projectId == null || report.projectId == projectId)
            .toList(growable: false);
        _bindings = results[1] as List<ReportAgentBinding>;
        _members = results[2] as List<ReportMember>;
        _loading = false;
      });
    } catch (cause) {
      if (_disposed || version != _version) return;
      setState(() {
        _loading = false;
        _error = reportErrorMessage(cause, fallback: '加载收件箱失败');
        _networkError = cause is NetworkException;
        _forbidden = cause is ApiException && cause.statusCode == 403;
      });
    }
  }

  bool get _isManager {
    final hasProjectBinding = _bindings.any(
      (binding) => binding.isProjectAgent && binding.userId == _userId,
    );
    return hasProjectBinding || _reports.isNotEmpty;
  }

  int get _unreadCount => _reports.where((report) => report.isUnread).length;

  ReportMember? _memberOf(int? userId) {
    for (final member in _members) {
      if (member.userId == userId) return member;
    }
    return null;
  }

  List<AgentReport> get _visibleReports {
    final scoped = _scope == 'direct'
        ? _reports
            .where((report) =>
                report.parentUserId == null || report.parentUserId == _userId)
            .toList(growable: false)
        : _reports;
    switch (_filter) {
      case 'unread':
        return scoped.where((report) => report.isUnread).toList(growable: false);
      case 'need_evidence':
        return scoped
            .where((report) => report.sourceCount == 0)
            .toList(growable: false);
      default:
        return scoped;
    }
  }

  Future<void> _open(AgentReport report) async {
    if (report.isUnread) {
      try {
        await _api!.markRead(report.id);
        if (!mounted) return;
        setState(() {
          _reports = [
            for (final item in _reports)
              if (item.id == report.id)
                item.copyWith(
                  read: true,
                  readAt: DateTime.now().toUtc().toIso8601String(),
                )
              else
                item,
          ];
        });
      } catch (cause) {
        if (!mounted) return;
        showAppToast(
          context,
          reportErrorMessage(cause, fallback: '标记已读失败，已打开汇报'),
          type: ToastType.warning,
        );
      }
    }
    if (!mounted) return;
    context.push(
      '/reports/detail?reportId=${report.id}&fromManager=1&projectId=$_projectId',
    );
  }

  @override
  Widget build(BuildContext context) {
    final projectId = ReportScope.projectId(context, widget.projectId);
    if (projectId <= 0) {
      return const AppScaffold(
        title: '下属汇报收件箱',
        body: AppEmptyState(
          title: '请选择具体项目',
          description: '汇报按项目隔离，请先切换到具体项目。',
          icon: AppIcon('folder', size: 44, color: AppColors.primary),
        ),
      );
    }

    return AppScaffold(
      title: '下属汇报收件箱',
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
    if (!_isManager) {
      return const AppEmptyState(
        title: '无权访问管理者收件箱',
        description: '根据人轴责任原则，下属汇报仅限项目管理者或直属领导查阅。普通项目成员不可越权查看。',
        icon: AppIcon('lock', size: 44, color: AppColors.warning),
      );
    }

    final visible = _visibleReports;
    final expected = _members.isEmpty ? 1 : _members.length;
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        AppSegmentedControl<String>(
          segments: const {'direct': '直属下属', 'all': '全部下属'},
          selectedValue: _scope,
          onValueChanged: (value) => setState(() => _scope = value),
        ),
        const SizedBox(height: AppSpacing.md),
        AppSegmentedControl<String>(
          segments: {
            'unread': '未读 $_unreadCount',
            'all': '全部（${_reports.length}）',
            'need_evidence': '待补资料',
          },
          selectedValue: _filter,
          onValueChanged: (value) => setState(() => _filter = value),
        ),
        const SizedBox(height: AppSpacing.lg),
        if (visible.isEmpty)
          AppEmptyState(
            title: _filter == 'unread' ? '暂无待阅汇报' : '当前筛选下暂无汇报',
            description: _filter == 'unread'
                ? '所有下属提交的汇报均已阅读完成'
                : '下属提交汇报后会出现在这里，可按未读或待补资料筛选。',
            icon: const AppIcon('bell', size: 44, color: AppColors.textTertiary),
          )
        else
          ReportCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (var index = 0; index < visible.length; index++) ...[
                  if (index > 0)
                    Divider(
                      height: 1,
                      color: isDarkMode(context)
                          ? AppColors.darkBorder
                          : AppColors.borderLight,
                    ),
                  _reportRow(context, visible[index]),
                ],
              ],
            ),
          ),
        const SizedBox(height: AppSpacing.lg),
        const ReportSectionTitle('当前汇报覆盖'),
        const SizedBox(height: AppSpacing.sm),
        ReportCard(
          child: Row(
            children: [
              _stat('$expected', '应汇报'),
              _stat('${_reports.length}', '已提交'),
              _stat('${(expected - _reports.length).clamp(0, expected)}', '待补充',
                  warning: true),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        const ReportInfoBanner(
          '你与项目智能体会同时收到汇报提醒，已读状态会通过服务端同步到其他设备。',
        ),
        const SizedBox(height: AppSpacing.lg),
        AppButton(
          label: '汇总项目汇报',
          icon: const AppIcon('ai', size: 17, color: Colors.white),
          onPressed: () => context.push(
            '/reports/project/aggregate?projectId=$projectId',
          ),
        ),
        const SizedBox(height: AppSpacing.xl),
      ],
    );
  }

  Widget _reportRow(BuildContext context, AgentReport report) {
    final author = _memberOf(report.authorUserId);
    final name = author?.displayName ?? '成员（编号 ${report.authorUserId ?? '-' }）';
    return InkWell(
      onTap: () => _open(report),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Row(
          children: [
            CircleAvatar(
              radius: 20,
              backgroundColor: isDarkMode(context)
                  ? const Color(0xFF1E3355)
                  : const Color(0xFFDCE8FB),
              child: Text(
                name.characters.first,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: AppColors.primary,
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$name · ${author?.roleLabel ?? '项目成员'}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    report.summaryPreview,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    report.submittedAt == null
                        ? '提交时间未知'
                        : formatReportMonthDayTime(report.submittedAt),
                    style: const TextStyle(fontSize: 10.5, color: AppColors.textTertiary),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            ReportStatusChip(
              label: report.isUnread ? '未读' : '已读',
              tone: report.isUnread ? ReportBannerTone.info : ReportBannerTone.neutral,
            ),
            const SizedBox(width: AppSpacing.xs),
            const AppIcon('chevron-right', size: 16, color: AppColors.textTertiary),
          ],
        ),
      ),
    );
  }

  Widget _stat(String value, String label, {bool warning = false}) {
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: warning ? AppColors.warning : AppColors.primary,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(fontSize: 11.5, color: AppColors.textTertiary),
          ),
        ],
      ),
    );
  }
}
