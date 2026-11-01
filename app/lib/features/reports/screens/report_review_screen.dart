import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/errors/app_error.dart';
import '../../../design/design.dart';
import '../data/reports_api.dart';
import '../models/report_capabilities.dart';
import '../models/report_models.dart';
import '../widgets/report_ui.dart';
import 'report_scope.dart';

enum ReportReviewMode { bindings, followup, conflict }

/// 汇报审核管理：智能体绑定、待补材料追问、资料差异确认。
///
/// 路由：`ai-agent-bindings`、`ai-review-followup`、`ai-review-conflict`。
/// 对齐网页版 `ReportReviewScreen.tsx`，但去掉网页里的示例人名与示例材料，
/// 只展示服务端真实数据；没有接口支撑的动作明确提示“未落库”。
class ReportReviewScreen extends StatefulWidget {
  const ReportReviewScreen({
    super.key,
    this.api,
    this.userId,
    this.projectId,
    this.projectName,
    this.mode = ReportReviewMode.bindings,
  });

  final ReportsApi? api;
  final int? userId;
  final int? projectId;
  final String? projectName;
  final ReportReviewMode mode;

  @override
  State<ReportReviewScreen> createState() => _ReportReviewScreenState();
}

class _ReportReviewScreenState extends State<ReportReviewScreen> {
  final TextEditingController _comment = TextEditingController();
  ReportsApi? _api;
  int _projectId = 0;
  int _version = 0;
  bool _disposed = false;
  bool _synced = false;

  bool _loading = true;
  bool _syncing = false;
  String? _error;
  bool _forbidden = false;
  bool _networkError = false;
  String? _notice;
  List<ReportAgentBinding> _bindings = const [];
  List<ReportMember> _members = const [];
  List<ReportConflict> _conflicts = const [];
  String _resolution = 'keep_ask';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(covariant ReportReviewScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.projectId != widget.projectId ||
        oldWidget.api != widget.api ||
        oldWidget.mode != widget.mode) {
      _sync();
    }
  }

  void _sync() {
    final api = widget.api ?? ReportsApi(context.apiClient);
    final projectId = ReportScope.projectId(context, widget.projectId);
    if (_synced &&
        api == _api &&
        projectId == _projectId &&
        widget.mode == _mode) {
      return;
    }
    _synced = true;
    _api = api;
    _projectId = projectId;
    _mode = widget.mode;
    _bindings = const [];
    _conflicts = const [];
    _error = null;
    _notice = null;
    _comment.text = widget.mode == ReportReviewMode.conflict
        ? '已完成员工端，管理者端仍待评审。'
        : '';
    _load();
  }

  ReportReviewMode _mode = ReportReviewMode.bindings;

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
      if (_mode == ReportReviewMode.bindings) {
        final results = await Future.wait<Object>([
          _api!.listBindings(projectId),
          _api!.listProjectMembers(projectId),
        ]);
        if (_disposed || version != _version) return;
        setState(() {
          _bindings = results[0] as List<ReportAgentBinding>;
          _members = results[1] as List<ReportMember>;
          _loading = false;
        });
      } else if (_mode == ReportReviewMode.conflict) {
        final reports = await _api!.listProjectReports(projectId);
        if (_disposed || version != _version) return;
        setState(() {
          _conflicts = detectReportConflicts(reports);
          _loading = false;
        });
      } else {
        if (_disposed || version != _version) return;
        setState(() => _loading = false);
      }
    } catch (cause) {
      if (_disposed || version != _version) return;
      setState(() {
        _loading = false;
        _error = reportErrorMessage(cause, fallback: '加载审核信息失败');
        _forbidden = cause is ApiException && cause.statusCode == 403;
        _networkError = cause is NetworkException;
      });
    }
  }

  Future<void> _syncBindings() async {
    if (_syncing || _projectId <= 0) return;
    setState(() {
      _syncing = true;
      _error = null;
      _notice = null;
    });
    try {
      final items = await _api!.ensureBindings(_projectId);
      if (!mounted) return;
      setState(() {
        _bindings = items;
        _notice = '同步成功，当前项目已绑定 ${items.length} 个汇报智能体';
      });
    } catch (cause) {
      if (!mounted) return;
      setState(() {
        _error = reportErrorMessage(cause, fallback: '同步智能体失败，需要项目管理者权限');
      });
    } finally {
      if (mounted) setState(() => _syncing = false);
    }
  }

  void _recordVerification() {
    setState(() {
      _notice =
          '核验意见已记录在当前页面，但核验裁决的持久化写入需要后端接口扩展。'
          '任务完成状态请在责任事项中单独确认，本页不会把未保存的操作显示为成功。';
    });
  }

  @override
  void dispose() {
    _disposed = true;
    _comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final projectId = ReportScope.projectId(context, widget.projectId);
    final title = switch (_mode) {
      ReportReviewMode.bindings => '项目智能体绑定管理',
      ReportReviewMode.followup => '待补材料与上级追问',
      ReportReviewMode.conflict => '资料差异确认',
    };
    if (projectId <= 0) {
      return AppScaffold(
        title: title,
        body: const AppEmptyState(
          title: '请选择具体项目',
          description: '汇报审核按项目隔离，请先切换到具体项目。',
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
    if (_loading) return const Center(child: AppLoading());
    if (_error != null) {
      return ReportErrorView(
        message: _error!,
        forbidden: _forbidden,
        network: _networkError,
        onRetry: _load,
      );
    }
    return switch (_mode) {
      ReportReviewMode.bindings => _bindingsView(projectId),
      ReportReviewMode.followup => _followupView(projectId),
      ReportReviewMode.conflict => _conflictView(projectId),
    };
  }

  Widget _bindingsView(int projectId) {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        const ReportInfoBanner(
          '智能体绑定从项目成员与人轴责任关系同步，不维护第二套上下级。',
        ),
        if (_notice != null) ...[
          const SizedBox(height: AppSpacing.md),
          ReportInfoBanner(_notice!, tone: ReportBannerTone.success),
        ],
        const SizedBox(height: AppSpacing.lg),
        if (_bindings.isEmpty)
          const ReportCard(
            child: Text(
              '当前项目尚未初始化智能体绑定，点击下方按钮从人轴同步。',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: AppColors.textTertiary),
            ),
          )
        else
          ReportCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (var index = 0; index < _bindings.length; index++) ...[
                  if (index > 0)
                    Divider(
                      height: 1,
                      color: isDarkMode(context)
                          ? AppColors.darkBorder
                          : AppColors.borderLight,
                    ),
                  _bindingRow(context, _bindings[index]),
                ],
              ],
            ),
          ),
        const SizedBox(height: AppSpacing.lg),
        AppButton(
          label: _syncing ? '正在同步人轴…' : '同步人轴智能体',
          isLoading: _syncing,
          icon: _syncing
              ? null
              : const AppIcon('refresh', size: 17, color: Colors.white),
          onPressed: _syncing ? null : _syncBindings,
        ),
        const SizedBox(height: AppSpacing.lg),
        const ReportSectionTitle('同步机制说明'),
        const SizedBox(height: AppSpacing.sm),
        const ReportCard(
          child: Text(
            '成员离开后停用对应项目绑定。变更管理者或调整人轴上下级后，'
            '下次汇报将自动按照最新责任关系路由送达。',
            style: TextStyle(fontSize: 12, height: 1.5, color: AppColors.textSecondary),
          ),
        ),
        const SizedBox(height: AppSpacing.xl),
      ],
    );
  }

  Widget _bindingRow(BuildContext context, ReportAgentBinding binding) {
    ReportMember? member;
    for (final item in _members) {
      if (item.userId == binding.userId) {
        member = item;
        break;
      }
    }
    final name = member?.displayName ??
        (binding.isProjectAgent ? '项目管理者' : '成员（编号 ${binding.userId ?? '-'}）');
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: isDarkMode(context)
                  ? const Color(0xFF16233A)
                  : const Color(0xFFEAF1FD),
              borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
            ),
            child: const Center(
              child: AppIcon('ai', size: 17, color: AppColors.primary),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$name · ${binding.isProjectAgent ? '管理者' : '成员'}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 2),
                Text(
                  binding.roleLabel,
                  style: const TextStyle(fontSize: 11.5, color: AppColors.textTertiary),
                ),
              ],
            ),
          ),
          const ReportStatusChip(
            label: '正常',
            tone: ReportBannerTone.success,
          ),
        ],
      ),
    );
  }

  Widget _followupView(int projectId) {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Row(
          children: [
            const ReportStatusChip(
              label: '待补材料',
              tone: ReportBannerTone.warning,
            ),
            const Spacer(),
            Flexible(
              child: Text(
                ReportScope.projectName(context, widget.projectName),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.right,
                style: const TextStyle(fontSize: 11, color: AppColors.textTertiary),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        const Text(
          '请补充验收材料与最终清单',
          style: TextStyle(fontSize: 19, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: AppSpacing.xs),
        const Text(
          '追问由直属领导在项目内发起，经站内消息沟通，不跨项目读取资料。',
          style: TextStyle(fontSize: 11.5, color: AppColors.textTertiary),
        ),
        const SizedBox(height: AppSpacing.lg),
        const ReportInfoBanner(
          '你的汇报描述与现有材料可能不一致。请补充验收清单，或把未完成的表述改为“进行中”。',
        ),
        if (_notice != null) ...[
          const SizedBox(height: AppSpacing.md),
          ReportInfoBanner(_notice!, tone: ReportBannerTone.info),
        ],
        const SizedBox(height: AppSpacing.lg),
        const ReportSectionTitle('补充说明'),
        const SizedBox(height: AppSpacing.sm),
        AppTextField(
          controller: _comment,
          minLines: 3,
          maxLines: 6,
          keyboardType: TextInputType.multiline,
          placeholder: '说明当前进度与尚未完成的事项…',
          clearButtonEnabled: false,
        ),
        const SizedBox(height: AppSpacing.lg),
        const ReportInfoBanner(
          '补充后沿原项目与人轴链路递交，不跨项目读取其他资料。追问建议通过站内消息闭环沟通。',
        ),
        const SizedBox(height: AppSpacing.lg),
        Row(
          children: [
            Expanded(
              child: AppButton(
                label: '上传材料',
                variant: AppButtonVariant.secondary,
                icon: const AppIcon('file', size: 17, color: AppColors.primary),
                onPressed: () => context.go('/work'),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: AppButton(
                label: '更新汇报草稿',
                icon: const AppIcon('edit', size: 17, color: Colors.white),
                onPressed: () => context.push('/reports/create?projectId=$projectId'),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.xl),
      ],
    );
  }

  Widget _conflictView(int projectId) {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Row(
          children: [
            const ReportStatusChip(
              label: '差异待确认',
              tone: ReportBannerTone.warning,
            ),
            const Spacer(),
            Flexible(
              child: Text(
                ReportScope.projectName(context, widget.projectName),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.right,
                style: const TextStyle(fontSize: 11, color: AppColors.textTertiary),
              ),
            ),
          ],
        ),
        if (_notice != null) ...[
          const SizedBox(height: AppSpacing.md),
          ReportInfoBanner(_notice!, tone: ReportBannerTone.info),
        ],
        const SizedBox(height: AppSpacing.lg),
        if (_conflicts.isEmpty)
          const AppEmptyState(
            title: '暂无资料差异',
            description: '当前项目内已提交汇报的任务状态一致，没有需要核验的冲突项。',
            icon: AppIcon('check-circle', size: 44, color: AppColors.success),
          )
        else
          for (final conflict in _conflicts) ...[
            ReportCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          conflict.typeLabel,
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                        ),
                      ),
                      const ReportStatusChip(
                        label: '存在差异',
                        tone: ReportBannerTone.warning,
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(AppSpacing.md),
                    decoration: BoxDecoration(
                      color: isDarkMode(context)
                          ? AppColors.darkSurfaceVariant
                          : AppColors.surfaceVariant,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                    ),
                    child: Text(
                      '${conflict.detail}'
                      '${conflict.taskId == null ? '' : '\n关联任务编号：${conflict.taskId}'}',
                      style: const TextStyle(fontSize: 12, height: 1.5),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
        const SizedBox(height: AppSpacing.sm),
        const ReportSectionTitle('管理者核验意见'),
        const SizedBox(height: AppSpacing.sm),
        AppTextField(
          controller: _comment,
          minLines: 3,
          maxLines: 6,
          keyboardType: TextInputType.multiline,
          clearButtonEnabled: false,
        ),
        const SizedBox(height: AppSpacing.lg),
        const ReportSectionTitle('本次处理方式'),
        const SizedBox(height: AppSpacing.sm),
        AppSegmentedControl<String>(
          segments: const {
            'keep_ask': '要求补材料',
            'pass': '核验通过',
            'reject': '退回修改',
          },
          selectedValue: _resolution,
          onValueChanged: (value) => setState(() => _resolution = value),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppButton(
          label: '记录核验意见',
          icon: const AppIcon('check', size: 17, color: Colors.white),
          onPressed: _recordVerification,
        ),
        const SizedBox(height: AppSpacing.lg),
        const ReportInfoBanner(
          '核验意见会保留在当前页面。核验裁决的持久化写入需要后端接口扩展，'
          '任务状态请在责任事项中单独确认。',
        ),
        const SizedBox(height: AppSpacing.lg),
        AppButton(
          label: '查看项目资料对照',
          variant: AppButtonVariant.secondary,
          onPressed: () => context.push('/reports/project/contrast?projectId=$projectId'),
        ),
        const SizedBox(height: AppSpacing.xl),
      ],
    );
  }
}
