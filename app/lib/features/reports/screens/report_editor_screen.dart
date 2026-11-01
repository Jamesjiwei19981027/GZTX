import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_provider.dart';
import '../../../design/design.dart';
import '../data/reports_api.dart';
import '../models/report_capabilities.dart';
import '../models/report_models.dart';
import '../services/report_draft_store.dart';
import '../widgets/report_ui.dart';
import 'report_scope.dart';

/// 写汇报（路由 `ai-report-create` / `/reports/create`）。
///
/// 对齐网页版 `MyReportEditor.tsx`：
/// - 两个自增高输入框（已完成 / 进行中·风险），输入越多框越高；
/// - 内容实时写入本地隔离草稿，断网也不丢；
/// - 提交前校验“直属领导不能是自己”；
/// - AI 生成期间显示进行中，离开页面后再次进入可从服务端草稿恢复结果。
class ReportEditorScreen extends StatefulWidget {
  const ReportEditorScreen({
    super.key,
    this.api,
    this.userId,
    this.companyId,
    this.projectId,
    this.projectName,
    this.projects,
    this.onSelectProject,
    this.draftStore,
    this.initialDraftReportId,
    this.periodLabel,
    this.now,
  });

  final ReportsApi? api;
  final int? userId;
  final int? companyId;
  final int? projectId;
  final String? projectName;
  final List<ProjectOption>? projects;
  final ValueChanged<ProjectOption>? onSelectProject;
  final ReportDraftStore? draftStore;
  final int? initialDraftReportId;
  final String? periodLabel;
  final DateTime? now;

  @override
  State<ReportEditorScreen> createState() => _ReportEditorScreenState();
}

class _ReportEditorScreenState extends State<ReportEditorScreen> {
  final TextEditingController _completed = TextEditingController();
  final TextEditingController _inProgress = TextEditingController();

  ReportsApi? _api;
  ReportDraftStore? _store;
  Timer? _saveTimer;
  int _projectId = 0;
  int _userId = 0;
  bool _hydrating = true;
  bool _initialising = true;
  bool _generating = false;
  bool _submitting = false;
  String? _error;
  String? _info;
  String? _loadWarning;
  int _version = 0;
  bool _disposed = false;
  bool _submitted = false;

  int? _draftReportId;
  int? _myBindingId;
  int? _parentUserId;
  List<ReportSource> _sources = const [];
  List<ReportTaskSnapshot> _taskSnapshots = const [];
  List<ReportEvidenceSnapshot> _evidenceSnapshots = const [];
  List<ReportMember> _members = const [];

  @override
  void initState() {
    super.initState();
    _completed.addListener(_onTextChanged);
    _inProgress.addListener(_onTextChanged);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(covariant ReportEditorScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.projectId != widget.projectId ||
        oldWidget.api != widget.api ||
        oldWidget.userId != widget.userId ||
        oldWidget.initialDraftReportId != widget.initialDraftReportId) {
      _sync();
    }
  }

  void _sync() {
    final projectId = ReportScope.projectId(context, widget.projectId);
    final userId = ReportScope.userId(context, widget.userId);
    final api = widget.api ?? ReportsApi(context.apiClient);
    final store = widget.draftStore ?? ReportDraftStore();
    if (projectId == _projectId &&
        userId == _userId &&
        api == _api &&
        store == _store &&
        !_initialising) {
      return;
    }

    // 切换前先用旧的用户/项目 ID 保存快照并取消待处理计时器
    final outgoingProjectId = _projectId;
    final outgoingUserId = _userId;
    final outgoingStore = _store;
    final outgoingDraftId = _draftReportId;
    final outgoingSummary = _combinedSummary;

    _saveTimer?.cancel();
    _saveTimer = null;

    if (!_submitted &&
        outgoingProjectId > 0 &&
        outgoingStore != null &&
        outgoingSummary.trim().isNotEmpty) {
      unawaited(outgoingStore.save(
        userId: outgoingUserId,
        projectId: outgoingProjectId,
        summary: outgoingSummary,
        draftReportId: outgoingDraftId,
      ));
    }

    // 先置 hydrating = true 避免清空输入框时触发新自动保存计时器
    _hydrating = true;
    _completed.clear();
    _inProgress.clear();

    _projectId = projectId;
    _userId = userId;
    _api = api;
    _store = store;
    _draftReportId = widget.initialDraftReportId;
    _parentUserId = null;
    _myBindingId = null;
    _sources = const [];
    _taskSnapshots = const [];
    _evidenceSnapshots = const [];
    _members = const [];
    _error = null;
    _info = null;
    _loadWarning = null;
    _initialising = true;
    _initialise();
  }

  Future<void> _initialise() async {
    final version = ++_version;
    final projectId = _projectId;
    final userId = _userId;
    if (projectId <= 0) {
      if (mounted) setState(() => _initialising = false);
      return;
    }

    String? warning;
    List<ReportMember> members = const [];
    List<ReportAgentBinding> bindings = const [];
    try {
      final results = await Future.wait<Object?>([
        _api!.listBindings(projectId),
        _api!.listProjectMembers(projectId),
      ]);
      bindings = results[0] as List<ReportAgentBinding>;
      members = results[1] as List<ReportMember>;
    } catch (cause) {
      if (_disposed || version != _version) return;
      warning = reportErrorMessage(cause, fallback: '未能加载汇报接收人信息');
    }

    ReportDraft? local;
    try {
      local = await _store!.load(userId: userId, projectId: projectId);
    } catch (cause) {
      warning ??= reportErrorMessage(cause, fallback: '未能读取本地草稿');
    }

    // 获取服务端汇报草稿以解析人轴真实直属上级
    AgentReport? serverDraft;
    int? resolvedParentUserId;
    try {
      final mine = await _api!.listMyReports(projectId: projectId);
      final drafts = mine
          .where((report) =>
              report.status == 'draft' && report.summaryText.trim().isNotEmpty)
          .toList()
        ..sort((a, b) => b.id.compareTo(a.id));
      if (drafts.isNotEmpty) {
        serverDraft = drafts.first;
        resolvedParentUserId = serverDraft.parentUserId;
      }
    } catch (cause) {
      if (local == null) {
        warning ??= reportErrorMessage(cause, fallback: '未能加载已生成的汇报草稿');
      }
    }

    if (_disposed || version != _version) return;

    int? myBindingId;
    int? projectLeaderId;
    for (final binding in bindings) {
      if (binding.role == 'member' && binding.userId == userId) {
        myBindingId = binding.id;
      }
      if (binding.isProjectAgent &&
          binding.userId != null &&
          binding.userId != userId) {
        projectLeaderId = binding.userId;
      }
    }

    if (projectLeaderId == null) {
      const pmRoles = {'pm', 'owner', 'admin', 'manager'};
      for (final member in members) {
        final role = (member.role ?? '').toLowerCase();
        if (pmRoles.contains(role) && member.userId != userId) {
          projectLeaderId = member.userId;
          break;
        }
      }
    }

    resolvedParentUserId ??= projectLeaderId;

    final text = local?.summary ?? serverDraft?.summaryText ?? '';
    final parts = text.split('\n\n');
    final completed = parts.isNotEmpty ? parts[0] : '';
    final inProgress = parts.length > 1 ? parts.sublist(1).join('\n\n') : '';

    setState(() {
      _members = members;
      _myBindingId = myBindingId;
      _parentUserId = resolvedParentUserId;
      _draftReportId = local?.draftReportId ?? serverDraft?.id ?? _draftReportId;
      _sources = serverDraft?.sources ?? const [];
      _taskSnapshots = serverDraft?.taskSnapshots ?? const [];
      _evidenceSnapshots = serverDraft?.evidenceSnapshots ?? const [];
      _loadWarning = warning;
      _completed.text = completed;
      _inProgress.text = inProgress;
      _initialising = false;
    });
    _hydrating = false;
  }

  void _onTextChanged() {
    if (_hydrating) return;
    _saveTimer?.cancel();
    _saveTimer = Timer(const Duration(milliseconds: 300), _persistDraft);
  }

  Future<void> _persistDraft() async {
    if (_projectId <= 0) return;
    final saved = await _store!.save(
      userId: _userId,
      projectId: _projectId,
      summary: _combinedSummary,
      draftReportId: _draftReportId,
    );
    if (!saved && mounted) {
      showAppToast(context, '草稿保存失败，请检查设备存储空间', type: ToastType.error);
    }
  }

  String get _combinedSummary {
    final completed = _completed.text.trim();
    final inProgress = _inProgress.text.trim();
    return [completed, inProgress].where((part) => part.isNotEmpty).join('\n\n');
  }

  SupervisorResolution get _supervisor => resolveDirectSupervisor(
        members: _members,
        currentUserId: _userId,
        parentUserId: _parentUserId,
      );

  String get _periodLabel =>
      widget.periodLabel ?? reportPeriodLabel(widget.now ?? DateTime.now());

  Future<void> _generate() async {
    if (_generating || _submitting) return;
    final projectId = _projectId;
    setState(() {
      _generating = true;
      _error = null;
      _info = null;
    });
    try {
      final draft = await _api!.generateDraft(projectId: projectId);
      if (!mounted || _projectId != projectId) return;
      final parts = draft.summaryText.split('\n\n');
      _hydrating = true;
      setState(() {
        _draftReportId = draft.id;
        _completed.text = parts.isNotEmpty ? parts[0] : '';
        _inProgress.text = parts.length > 1 ? parts.sublist(1).join('\n\n') : '';
        _sources = draft.sources;
        _taskSnapshots = draft.taskSnapshots;
        _evidenceSnapshots = draft.evidenceSnapshots;
        if (draft.parentUserId != null) _parentUserId = draft.parentUserId;
        _info = '已基于当前项目任务与资料生成最新事实汇报草稿';
      });
      _hydrating = false;
      await _persistDraft();
    } catch (cause) {
      if (!mounted || _projectId != projectId) return;
      setState(() {
        _error = reportErrorMessage(cause, fallback: '生成草稿失败，请稍后重试');
      });
    } finally {
      if (mounted && _projectId == projectId) {
        setState(() => _generating = false);
      }
    }
  }

  Future<void> _submit() async {
    if (_submitting || _generating) return;
    final projectId = _projectId;
    if (_supervisor.isSelf) {
      setState(() => _error = '直属领导不能是自己。人轴责任链要求汇报流向明确的上级管理者。');
      return;
    }
    final summary = _combinedSummary;
    if (summary.isEmpty) {
      setState(() => _error = '请填写已完成或进行中的工作事实内容后再提交');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      AgentReport result;
      final draftId = _draftReportId;
      if (draftId != null) {
        result = await _api!.submitDraft(
          draftId,
          summary: summary,
          sources: _sources,
        );
      } else if (_myBindingId != null) {
        result = await _api!.submitReport(
          projectId: projectId,
          bindingId: _myBindingId!,
          summary: summary,
          sources: _sources,
        );
      } else {
        final draft = await _api!.generateDraft(projectId: projectId);
        result = await _api!.submitDraft(
          draft.id,
          summary: summary,
          sources: _sources,
        );
      }
      if (!mounted || _projectId != projectId) return;
      _submitted = true;
      await _store!.clear(userId: _userId, projectId: projectId);
      if (!mounted) return;
      context.pushReplacement(
        '/reports/submitted/${result.id}?projectId=$projectId',
      );
    } catch (cause) {
      if (!mounted || _projectId != projectId) return;
      setState(() {
        _error = reportErrorMessage(cause, fallback: '提交汇报失败，请检查网络或权限');
      });
    } finally {
      if (mounted && _projectId == projectId) {
        setState(() => _submitting = false);
      }
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _saveTimer?.cancel();
    // 离开页面前把尚未落盘的编辑内容写入本地草稿（已提交时不得再次回写）
    if (!_submitted && !_hydrating && _projectId > 0 && _combinedSummary.isNotEmpty) {
      unawaited(_store!.save(
        userId: _userId,
        projectId: _projectId,
        summary: _combinedSummary,
        draftReportId: _draftReportId,
      ));
    }
    _completed.dispose();
    _inProgress.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final projectId = ReportScope.projectId(context, widget.projectId);
    final projectName = ReportScope.projectName(context, widget.projectName);
    final projects = ReportScope.projectOptions(context, widget.projects);

    if (projectId <= 0) {
      return AppScaffold(
        title: '编辑我的 AI 汇报',
        body: Column(
          children: [
            ReportProjectBar(
              projectName: '未选择项目',
              projects: projects,
              onSelect: widget.onSelectProject,
            ),
            const Expanded(
              child: AppEmptyState(
                title: '请先在具体项目中编辑汇报',
                description: '汇报按项目隔离，切换到具体项目后才能写汇报。',
                icon: AppIcon('folder', size: 44, color: AppColors.primary),
              ),
            ),
          ],
        ),
      );
    }

    final supervisor = _supervisor;

    return AppScaffold(
      title: '编辑我的 AI 汇报',
      body: ReportKeyboardPadding(
        child: Column(
          children: [
            ReportProjectBar(
              projectName: projectName,
              projects: projects,
              onSelect: widget.onSelectProject,
            ),
            Expanded(
              child: _initialising
                  ? const Center(child: AppLoading())
                  : SingleChildScrollView(
                      padding: const EdgeInsets.all(AppSpacing.lg),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _draftHeader(context, projectName),
                          if (_loadWarning != null) ...[
                            const SizedBox(height: AppSpacing.md),
                            ReportInfoBanner(
                              _loadWarning!,
                              tone: ReportBannerTone.warning,
                            ),
                          ],
                          if (_error != null) ...[
                            const SizedBox(height: AppSpacing.md),
                            ReportInfoBanner(_error!, tone: ReportBannerTone.error),
                          ],
                          if (_info != null) ...[
                            const SizedBox(height: AppSpacing.md),
                            ReportInfoBanner(_info!, tone: ReportBannerTone.success),
                          ],
                          const SizedBox(height: AppSpacing.lg),
                          _label(context, '汇报周期'),
                          const SizedBox(height: AppSpacing.xs),
                          ReportCard(
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    _periodLabel,
                                    style: const TextStyle(fontSize: 14),
                                  ),
                                ),
                                const AppIcon(
                                  'calendar',
                                  size: 17,
                                  color: AppColors.textTertiary,
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: AppSpacing.lg),
                          _label(context, '已完成'),
                          const SizedBox(height: AppSpacing.xs),
                          AppTextField(
                            key: const ValueKey('report-completed-field'),
                            controller: _completed,
                            minLines: 4,
                            maxLines: null,
                            keyboardType: TextInputType.multiline,
                            placeholder: '描述本周已落地的具体成果、任务完成情况及评审结果…',
                            clearButtonEnabled: false,
                          ),
                          const SizedBox(height: AppSpacing.lg),
                          _label(context, '进行中 / 风险'),
                          const SizedBox(height: AppSpacing.xs),
                          AppTextField(
                            key: const ValueKey('report-in-progress-field'),
                            controller: _inProgress,
                            minLines: 3,
                            maxLines: null,
                            keyboardType: TextInputType.multiline,
                            placeholder: '描述当前阻塞问题、待决策事项或依赖外部的事项…',
                            clearButtonEnabled: false,
                          ),
                          const SizedBox(height: AppSpacing.lg),
                          const ReportSectionTitle(
                            '来源依据',
                            trailing: Text(
                              '严格基于项目事实',
                              style: TextStyle(fontSize: 10.5, color: AppColors.textTertiary),
                            ),
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          ReportSourcesList(
                            sources: _sources,
                            taskSnapshots: _taskSnapshots,
                            evidenceSnapshots: _evidenceSnapshots,
                          ),
                          const SizedBox(height: AppSpacing.lg),
                          const ReportSectionTitle('提交接收人'),
                          const SizedBox(height: AppSpacing.sm),
                          _supervisorCard(context, supervisor),
                          if (supervisor.isSelf)
                            const Padding(
                              padding: EdgeInsets.only(top: AppSpacing.sm),
                              child: Text(
                                '直属领导不能是自己。请在人轴画布或设置中指定您的直属上级后再提交。',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: AppColors.danger,
                                ),
                              ),
                            ),
                          const SizedBox(height: AppSpacing.xl),
                        ],
                      ),
                    ),
            ),
            _bottomBar(context, supervisor),
          ],
        ),
      ),
    );
  }

  Widget _draftHeader(BuildContext context, String projectName) {
    return Row(
      children: [
        const ReportStatusChip(
          label: '草稿 · 仅自己可见',
          tone: ReportBannerTone.warning,
        ),
        const Spacer(),
        Flexible(
          child: Text(
            '项目：$projectName',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.right,
            style: const TextStyle(fontSize: 11.5, color: AppColors.textTertiary),
          ),
        ),
      ],
    );
  }

  Widget _label(BuildContext context, String text) {
    return Text(
      text,
      style: TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: isDarkMode(context)
            ? AppColors.darkTextPrimary
            : AppColors.textPrimary,
      ),
    );
  }

  Widget _supervisorCard(BuildContext context, SupervisorResolution supervisor) {
    final danger = supervisor.isSelf;
    final dark = isDarkMode(context);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: danger
            ? (dark ? const Color(0xFF3A1B1B) : const Color(0xFFFDF1F0))
            : (dark ? AppColors.darkSurface : AppColors.surface),
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        border: Border.all(
          color: danger
              ? (dark ? const Color(0xFF7A3B36) : const Color(0xFFF3C9C4))
              : (dark ? AppColors.darkBorder : AppColors.border),
        ),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: dark ? const Color(0xFF1E3355) : const Color(0xFFDCE8FB),
            child: Text(
              supervisor.name.characters.first,
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
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        supervisor.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (danger) ...[
                      const SizedBox(width: AppSpacing.xs),
                      const ReportStatusChip(
                        label: '非法上级',
                        tone: ReportBannerTone.error,
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  supervisor.isUnassigned
                      ? '提交时由系统确定接收人'
                      : '${supervisor.role ?? '人轴直属领导'} · 人轴实时判定',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 11.5, color: AppColors.textTertiary),
                ),
              ],
            ),
          ),
          AppIcon(
            'check-circle',
            size: 18,
            color: supervisor.isValid ? AppColors.success : AppColors.textDisabled,
          ),
        ],
      ),
    );
  }

  Widget _bottomBar(BuildContext context, SupervisorResolution supervisor) {
    final dark = isDarkMode(context);
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: dark ? AppColors.darkSurface : Colors.white,
        border: Border(
          top: BorderSide(color: dark ? AppColors.darkBorder : AppColors.border),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: AppButton(
                label: _generating ? '正在提取事实…' : '重新生成',
                variant: AppButtonVariant.secondary,
                isLoading: _generating,
                onPressed: _submitting ? null : _generate,
                icon: _generating
                    ? null
                    : const AppIcon('ai', size: 17, color: AppColors.primary),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: AppButton(
                label: _submitting ? '正在提交…' : '确认提交',
                isLoading: _submitting,
                onPressed: supervisor.isSelf || _generating ? null : _submit,
                icon: _submitting
                    ? null
                    : const AppIcon('send', size: 17, color: Colors.white),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
