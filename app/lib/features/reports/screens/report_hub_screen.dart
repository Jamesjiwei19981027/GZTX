import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/app_error.dart';
import '../../../design/design.dart';
import '../data/reports_api.dart';
import '../models/report_capabilities.dart';
import '../models/report_models.dart';
import '../services/report_draft_store.dart';
import '../widgets/report_ui.dart';
import 'report_scope.dart';

/// 项目内 AI 汇报入口（路由 `ai-root` / `/reports`）。
///
/// 对齐网页版 `MyAgentScreen.tsx` 的入口视图：项目隔离提示、我的项目 AI、
/// 汇报工作入口；管理者能力区仅在服务端绑定确认是项目管理者时展示。
class ReportHubScreen extends StatefulWidget {
  const ReportHubScreen({
    super.key,
    this.api,
    this.userId,
    this.companyId,
    this.projectId,
    this.projectName,
    this.projects,
    this.onSelectProject,
    this.draftStore,
  });

  final ReportsApi? api;
  final int? userId;
  final int? companyId;
  final int? projectId;
  final String? projectName;
  final List<ProjectOption>? projects;
  final ValueChanged<ProjectOption>? onSelectProject;
  final ReportDraftStore? draftStore;

  @override
  State<ReportHubScreen> createState() => _ReportHubScreenState();
}

class _ReportHubScreenState extends State<ReportHubScreen> {
  ReportsApi? _api;
  ReportDraftStore? _draftStore;
  int? _resolvedProjectId;
  int? _resolvedUserId;

  bool _loading = true;
  String? _error;
  bool _networkError = false;
  bool _forbidden = false;

  List<ReportAgentBinding> _bindings = const [];
  List<AgentReport> _myReports = const [];
  List<AgentReport> _inboxReports = const [];
  bool _hasDraft = false;

  int _version = 0;
  bool _disposed = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync(context);
  }

  @override
  void didUpdateWidget(covariant ReportHubScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.api != widget.api ||
        oldWidget.projectId != widget.projectId ||
        oldWidget.userId != widget.userId) {
      _sync(context);
    }
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }

  void _sync(BuildContext context) {
    final api = widget.api ?? ReportsApi(context.apiClient);
    final projectId = ReportScope.projectId(context, widget.projectId);
    final userId = ReportScope.userId(context, widget.userId);
    final store = widget.draftStore ?? ReportDraftStore();
    final changed = api != _api ||
        projectId != _resolvedProjectId ||
        userId != _resolvedUserId ||
        store != _draftStore;
    _api = api;
    _resolvedProjectId = projectId;
    _resolvedUserId = userId;
    _draftStore = store;
    if (!changed && !_loading) return;
    _load();
  }

  Future<void> _load() async {
    final version = ++_version;
    final projectId = _resolvedProjectId ?? 0;
    final userId = _resolvedUserId ?? 0;
    if (projectId <= 0) {
      if (!_disposed) {
        setState(() {
          _loading = false;
          _error = null;
          _bindings = const [];
          _myReports = const [];
          _inboxReports = const [];
          _hasDraft = false;
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
      final store = _draftStore!;
      final results = await Future.wait<Object>([
        _api!.listBindings(projectId),
        _api!.listMyReports(projectId: projectId),
        _api!.listInbox(),
        store.load(userId: userId, projectId: projectId),
      ]);
      if (_disposed || version != _version) return;
      final bindings = results[0] as List<ReportAgentBinding>;
      final myReports = results[1] as List<AgentReport>;
      final inbox = results[2] as List<AgentReport>;
      final draft = results[3] as ReportDraft?;
      setState(() {
        _bindings = bindings;
        _myReports = myReports;
        // 与网页版一致：入口页仅统计当前项目内的收件箱汇报
        _inboxReports = inbox
            .where((report) =>
                report.projectId == null || report.projectId == projectId)
            .toList(growable: false);
        _hasDraft = draft != null;
        _loading = false;
      });
    } catch (cause) {
      if (_disposed || version != _version) return;
      setState(() {
        _loading = false;
        _error = reportErrorMessage(cause, fallback: '加载项目汇报状态失败');
        _networkError = cause is NetworkException;
        _forbidden = cause is ApiException && cause.statusCode == 403;
      });
    }
  }

  bool get _isManager {
    final userId = _resolvedUserId ?? 0;
    final hasProjectBinding = _bindings.any(
      (binding) => binding.isProjectAgent && binding.userId == userId,
    );
    return hasProjectBinding || _inboxReports.isNotEmpty;
  }

  int get _historyCount =>
      _myReports.where((report) => report.isSubmitted).length;

  int get _unreadCount =>
      _inboxReports.where((report) => report.isUnread).length;

  @override
  Widget build(BuildContext context) {
    final projectId = ReportScope.projectId(context, widget.projectId);
    final projectName = ReportScope.projectName(context, widget.projectName);
    final projects = ReportScope.projectOptions(context, widget.projects);

    if (projectId <= 0) {
      return AppScaffold(
        title: 'AI 汇报与助手',
        body: Column(
          children: [
            ReportProjectBar(
              projectName: '未选择项目',
              projects: projects,
              onSelect: widget.onSelectProject,
            ),
            const Expanded(
              child: AppEmptyState(
                title: '请选择具体项目',
                description: '根据安全规范，智能体会话、汇报材料与上下文在项目间严格隔离。'
                    '“全部项目”下无法确定汇报归属。',
                icon: AppIcon('folder', size: 44, color: AppColors.primary),
              ),
            ),
          ],
        ),
      );
    }

    return AppScaffold(
      title: 'AI 汇报与助手',
      body: Column(
        children: [
          ReportProjectBar(
            projectName: projectName,
            projects: projects,
            onSelect: widget.onSelectProject,
          ),
          Expanded(child: _body(context, projectId, projectName)),
        ],
      ),
    );
  }

  Widget _body(BuildContext context, int projectId, String projectName) {
    if (_loading) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppLoading(),
            SizedBox(height: AppSpacing.md),
            Text(
              '加载项目汇报配置…',
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
          ],
        ),
      );
    }
    if (_error != null) {
      return ReportErrorView(
        message: _error!,
        forbidden: _forbidden,
        network: _networkError,
        onRetry: _load,
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          ReportInfoBanner(
            '当前项目：$projectName。其他项目的对话、材料与草稿不会进入这里。',
          ),
          const SizedBox(height: AppSpacing.lg),
          ReportCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: const [
                    AppIcon('ai', size: 20, color: AppColors.primary),
                    SizedBox(width: AppSpacing.sm),
                    Text(
                      '我的项目 AI',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  '${ReportScope.userName(context, null)}的汇报助手',
                  style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
                ),
                const SizedBox(height: AppSpacing.lg),
                SizedBox(
                  width: double.infinity,
                  child: AppButton(
                    label: '告诉 AI 最新进展',
                    icon: const AppIcon('messages', size: 17, color: Colors.white),
                    onPressed: () => context.push('/reports/chat?projectId=$projectId'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          const ReportSectionTitle('汇报工作'),
          const SizedBox(height: AppSpacing.sm),
          ReportCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                _HubRow(
                  icon: 'file',
                  iconColor: AppColors.primary,
                  title: '整理本周汇报',
                  subtitle: _hasDraft ? '已有 1 份草稿待提交' : '基于任务与进展生成',
                  onTap: () => context.push('/reports/create?projectId=$projectId'),
                ),
                _divider(context),
                _HubRow(
                  icon: 'check-circle',
                  iconColor: AppColors.success,
                  title: '补充材料与任务',
                  subtitle: '完善任务进度、成果材料与证据',
                  onTap: () => context.go('/work'),
                ),
                _divider(context),
                _HubRow(
                  icon: 'clock',
                  iconColor: const Color(0xFF7C5CBF),
                  title: '汇报历史与版本',
                  subtitle: '已提交 $_historyCount 份不可变记录',
                  onTap: () => context.push('/reports/detail?projectId=$projectId'),
                ),
              ],
            ),
          ),
          if (_isManager) ...[
            const SizedBox(height: AppSpacing.lg),
            ReportSectionTitle(
              '管理者能力',
              trailing: const ReportStatusChip(
                label: '已授权',
                tone: ReportBannerTone.success,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            ReportCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  _HubRow(
                    icon: 'bell',
                    iconColor: AppColors.warning,
                    title: '下属汇报收件箱',
                    subtitle:
                        _unreadCount > 0 ? '$_unreadCount 条未读汇报' : '查看下属提交的汇报',
                    badge: _unreadCount > 0 ? _unreadCount : null,
                    onTap: () => context.push('/reports/inbox?projectId=$projectId'),
                  ),
                  _divider(context),
                  _HubRow(
                    icon: 'filter',
                    iconColor: const Color(0xFF2D7FA8),
                    title: '项目资料对照',
                    subtitle: '对比任务快照与资料冲突',
                    onTap: () => context.push(
                      '/reports/project/contrast?projectId=$projectId',
                    ),
                  ),
                  _divider(context),
                  _HubRow(
                    icon: 'ai',
                    iconColor: const Color(0xFF4B57B8),
                    title: '项目汇总与发布',
                    subtitle: '生成项目级汇报封装',
                    onTap: () => context.push(
                      '/reports/project/aggregate?projectId=$projectId',
                    ),
                  ),
                  _divider(context),
                  _HubRow(
                    icon: 'team',
                    iconColor: AppColors.textSecondary,
                    title: '智能体绑定管理',
                    subtitle: '同步并管理项目内汇报智能体',
                    onTap: () => context.push('/reports/bindings?projectId=$projectId'),
                  ),
                  _divider(context),
                  _HubRow(
                    icon: 'reports',
                    iconColor: const Color(0xFF9A6B1F),
                    title: '领导层项目总览',
                    subtitle: '查看各项目摘要封装（需总领导权限）',
                    onTap: () => context.push('/reports/leadership'),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.xl),
        ],
      ),
    );
  }

  Widget _divider(BuildContext context) => Divider(
        height: 1,
        color: isDarkMode(context) ? AppColors.darkBorder : AppColors.borderLight,
      );
}

class _HubRow extends StatelessWidget {
  const _HubRow({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.badge,
  });

  final String icon;
  final Color iconColor;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final int? badge;

  @override
  Widget build(BuildContext context) {
    final dark = isDarkMode(context);
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: dark ? 0.24 : 0.10),
                borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              ),
              child: Center(child: AppIcon(icon, size: 18, color: iconColor)),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: dark ? AppColors.darkTextPrimary : AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
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
            if (badge != null) ...[
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.danger,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
                ),
                child: Text(
                  '$badge',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
            ],
            AppIcon(
              'chevron-right',
              size: 18,
              color: dark ? AppColors.darkTextTertiary : AppColors.textTertiary,
            ),
          ],
        ),
      ),
    );
  }
}
