import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/auth/auth_provider.dart';
import '../../../core/auth/auth_state.dart';
import '../../../core/models/project.dart';
import '../../../design/design.dart';
import '../../reports/models/report_models.dart';
import '../data/axis_api.dart';
import '../data/axis_models.dart';
import '../data/axis_report_helpers.dart';
import '../data/axis_rules.dart';
import '../data/axis_tree_mapper.dart';
import '../data/axis_view_models.dart';
import '../state/axis_controller.dart';
import '../widgets/axis_canvas.dart';
import '../widgets/axis_common.dart';
import '../widgets/axis_person_form.dart';

/// 人轴根页（对应网页 `MobileAxisScreens`，axis-root）。
///
/// 没有加入任何项目时显示空状态并引导新建 / 加入项目，
/// 不沿用网页版“无项目一直转圈、挡住底部 Tab”的缺陷。
class AxisRootScreen extends StatefulWidget {
  const AxisRootScreen({
    super.key,
    this.api,
    this.authState,
    this.initialProjectId,
    this.initialTab = AxisViewTab.mine,
  });

  final AxisApi? api;
  final AuthState? authState;
  final int? initialProjectId;
  final AxisViewTab initialTab;

  @override
  State<AxisRootScreen> createState() => _AxisRootScreenState();
}

class _AxisRootScreenState extends State<AxisRootScreen> {
  final AxisViewportController _viewport = AxisViewportController();
  AxisController? _controller;
  AuthState? _auth;
  int? _projectId;
  bool _bootstrapped = false;

  AxisApi get _api => widget.api ?? AxisApi(context.read<AuthState>().api);

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_bootstrapped) return;
    _bootstrapped = true;
    _auth = widget.authState ?? _tryReadAuth();
    _syncProject(_auth);
  }

  AuthState? _tryReadAuth() {
    try {
      return context.read<AuthState>();
    } catch (_) {
      return null;
    }
  }

  void _syncProject(AuthState? auth, {bool force = false}) {
    if (auth == null) return;
    final projects = auth.projects;
    final candidate = widget.initialProjectId ??
        auth.currentProject?.id ??
        (projects.isNotEmpty ? projects.first.id : null);
    if (candidate == null) {
      if (_controller != null) {
        _controller!.dispose();
        _controller = null;
        _projectId = null;
      }
      return;
    }
    if (!force && _projectId == candidate && _controller != null) return;
    final existing = _controller;
    _projectId = candidate;
    if (existing == null) {
      final controller = AxisController(
        api: _api,
        projectId: candidate,
        currentUserId: auth.currentUser?.id,
        companyId: auth.currentCompany?.id,
      );
      controller.addListener(_onControllerChanged);
      _controller = controller;
      if (widget.initialTab == AxisViewTab.overview) {
        controller.setTab(AxisViewTab.overview);
      }
      controller.load();
    } else if (existing.projectId != candidate) {
      existing.switchProject(candidate);
    }
  }

  void _onControllerChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _controller?.removeListener(_onControllerChanged);
    _controller?.dispose();
    _viewport.dispose();
    super.dispose();
  }

  void _notice(String message) {
    if (!mounted) return;
    showAppToast(context, message, type: ToastType.info);
  }

  void _errorNotice(Object error) => _notice(axisErrorMessage(error));

  Future<void> _pickProject(AuthState auth) async {
    final project = await showAxisPickerSheet<Project>(
      context: context,
      title: '选择项目',
      items: auth.projects,
      selected: _projectById(
        auth.projects,
        _projectId ?? auth.currentProject?.id,
      ),
      labelOf: (p) => p.name,
    );
    if (project == null) return;
    auth.selectProject(project);
    setState(() => _syncProject(auth, force: true));
  }

  bool get _canAddPerson =>
      _controller?.permissions.isPm == true ||
      _controller?.permissions.isSuperAdmin == true;

  Future<void> _openAddPerson({bool asRoot = false}) async {
    final controller = _controller;
    if (controller == null) return;
    await showAppBottomSheet<void>(
      context: context,
      title: '新增人员',
      builder: (ctx) => AxisPersonForm(
        api: controller.api,
        projectId: controller.projectId,
        allNodes: controller.nodes,
        members: controller.members,
        suggestedUserId: asRoot ? controller.project?.pmUserId : null,
        canChangeSupervisor: controller.permissions.canManageStructure ||
            controller.permissions.canEditAll,
        canManageAssignees:
            controller.permissions.isPm || controller.permissions.isSuperAdmin,
        onSaved: () async {
          if (!mounted) return;
          Navigator.of(ctx).pop();
          await controller.load();
          _notice('人员信息保存成功');
        },
        onCancel: () => Navigator.of(ctx).pop(),
      ),
    );
  }

  Future<void> _openSettings() async {
    final controller = _controller;
    if (controller == null) return;
    await showAppBottomSheet<void>(
      context: context,
      title: '画布设置',
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          void update(VoidCallback action) {
            setSheetState(action);
            setState(action);
          }

          return ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: [
              AxisCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    SwitchListTile(
                      value: controller.showAiStatus,
                      title: const Text('显示 AI 汇报状态'),
                      subtitle: const Text('节点上展示草稿、已提交与未读'),
                      onChanged: (v) =>
                          update(() => controller.setShowAiStatus(v)),
                    ),
                    SwitchListTile(
                      value: controller.expandSubordinates,
                      title: const Text('展开直属下属'),
                      subtitle: const Text('关闭后只显示项目主轴人员'),
                      onChanged: (v) =>
                          update(() => controller.setExpandSubordinates(v)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              const Text('默认方向', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: AppSpacing.sm),
              Row(
                children: [
                  for (final value in AxisOrientation.values)
                    Expanded(
                      child: _ChoiceButton(
                        label: value.label,
                        selected: controller.orientation == value,
                        onTap: () =>
                            update(() => controller.setOrientation(value)),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              const Text('节点间距', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: AppSpacing.sm),
              Row(
                children: [
                  for (final value in AxisSpacing.values)
                    Expanded(
                      child: _ChoiceButton(
                        label: value.label,
                        selected: controller.spacing == value,
                        onTap: () => update(() => controller.setSpacing(value)),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              AxisCard(
                padding: EdgeInsets.zero,
                child: ListTile(
                  leading: const Icon(Icons.refresh, color: AppColors.warning),
                  title: const Text('重置卡片布局'),
                  subtitle: const Text('仅恢复自动对齐位置，不删除人员与事项'),
                  onTap: () async {
                    final confirmed = await showAppConfirmDialog(
                      context: context,
                      title: '重置卡片布局',
                      message: '重置布局仅将所有卡片恢复到自动对齐位置，'
                          '不会删除任何人员和责任事项。确认重置？',
                      confirmLabel: '确认重置',
                    );
                    if (confirmed != true) return;
                    if (ctx.mounted) Navigator.of(ctx).pop();
                    try {
                      await controller.resetLayout();
                      _notice('卡片布局已重置');
                    } catch (e) {
                      _errorNotice(e);
                    }
                  },
                ),
              ),
              const SizedBox(height: AppSpacing.xl),
              AppButton(
                label: '保存布局偏好',
                isFullWidth: true,
                onPressed: () {
                  Navigator.of(ctx).pop();
                  _notice('偏好设置已保存');
                },
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _switchTab(AxisViewTab tab) async {
    final controller = _controller;
    if (controller == null) return;
    controller.setTab(tab);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final auth = widget.authState ??
        (() {
          try {
            return context.watch<AuthState>();
          } catch (_) {
            return null;
          }
        })();
    _auth = auth ?? _auth;

    if (auth != null) {
      final expected = widget.initialProjectId ??
          auth.currentProject?.id ??
          (auth.projects.isNotEmpty ? auth.projects.first.id : null);
      if (expected != null && expected != _projectId) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _syncProject(auth);
        });
      }
    }

    final projects = auth?.projects ?? const <Project>[];
    if (projects.isEmpty) {
      return AppScaffold(
        title: '人轴',
        body: _NoProjectState(
          onReload: () async {
            await auth?.bootstrap();
            if (mounted) setState(() {});
          },
          onCreate: () => context.pushNamed('project-create'),
        ),
      );
    }

    final controller = _controller;
    if (controller == null || controller.loading) {
      return AppScaffold(
        title: '人轴',
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AppLoading(),
              const SizedBox(height: AppSpacing.md),
              Text(
                '正在加载责任链数据…',
                style: TextStyle(
                  fontSize: 13,
                  color: AppColors.textSecondaryOf(isDark),
                ),
              ),
            ],
          ),
        ),
      );
    }

    if (controller.error != null) {
      return AppScaffold(
        title: '人轴',
        body: AppErrorState(
          title: '无法加载人轴',
          message: axisErrorMessage(controller.error!),
          onRetry: controller.load,
        ),
      );
    }

    return AppScaffold(
      title: controller.tab == AxisViewTab.mine ? '我的责任链' : '项目全貌',
      actions: [
        if (_canAddPerson)
          IconButton(
            key: const Key('axis-add-person'),
            tooltip: '新增主轴人员',
            onPressed: _openAddPerson,
            icon: const AppIcon('plus', size: 22),
          ),
        IconButton(
          key: const Key('axis-settings'),
          tooltip: '画布设置',
          onPressed: _openSettings,
          icon: const AppIcon('more-horizontal', size: 22),
        ),
      ],
      body: Column(
        children: [
          _ProjectBar(
            projectName: controller.project?.name ??
                _projectById(projects, controller.projectId)?.name ??
                '当前项目',
            onTap: auth == null ? null : () => _pickProject(auth),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              0,
              AppSpacing.lg,
              AppSpacing.sm,
            ),
            child: Row(
              children: [
                Expanded(
                  child: _QuickEntry(
                    icon: Icons.lock_outline,
                    label: '委托授权',
                    onTap: () => context.push('/axis/delegations'),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: _QuickEntry(
                    icon: Icons.auto_awesome,
                    label: 'AI 责任链审计',
                    onTap: () => context.push('/axis/audit'),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: AppSegmentedControl<AxisViewTab>(
              segments: {
                AxisViewTab.mine: AxisViewTab.mine.label,
                AxisViewTab.overview: AxisViewTab.overview.label,
              },
              selectedValue: controller.tab,
              onValueChanged: _switchTab,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Expanded(
            child: controller.tab == AxisViewTab.mine
                ? _MineView(
                    controller: controller,
                    onOpenPerson: (node) => context
                        .push(
                          '/axis/person/${node.id}?projectId=${controller.projectId}',
                        )
                        .then((_) => controller.load()),
                    onOpenMatter: (item) => context.push(
                      '/axis/node/${item.id}?projectId=${controller.projectId}',
                    ),
                    onAddSubordinate: () async {
                      await showAppBottomSheet<void>(
                        context: context,
                        title: '新增下级人员',
                        builder: (ctx) => AxisPersonForm(
                          api: controller.api,
                          projectId: controller.projectId,
                          allNodes: controller.nodes,
                          members: controller.members,
                          suggestedParentId: controller.selfNode?.id,
                          canChangeSupervisor:
                              controller.permissions.canManageStructure ||
                                  controller.permissions.canEditAll,
                          canManageAssignees: true,
                          onSaved: () async {
                            if (!mounted) return;
                            Navigator.of(ctx).pop();
                            await controller.load();
                            _notice('人员信息保存成功');
                          },
                          onCancel: () => Navigator.of(ctx).pop(),
                        ),
                      );
                    },
                    onSwitchOverview: () =>
                        controller.setTab(AxisViewTab.overview),
                  )
                : _OverviewView(
                    controller: controller,
                    viewport: _viewport,
                    onAddRoot: _canAddPerson
                        ? () => _openAddPerson(asRoot: true)
                        : null,
                    onOpenPerson: (node) => context
                        .push(
                          '/axis/person/${node.id}?projectId=${controller.projectId}',
                        )
                        .then((_) => controller.load()),
                    onOpenMatter: (item, ownerId) => context.push(
                      '/axis/node/${item.id}?projectId=${controller.projectId}',
                    ),
                    onError: _errorNotice,
                    onNotice: _notice,
                  ),
          ),
        ],
      ),
    );
  }
}

Project? _projectById(List<Project> projects, int? id) {
  for (final project in projects) {
    if (project.id == id) return project;
  }
  return null;
}

class _NoProjectState extends StatelessWidget {
  const _NoProjectState({required this.onReload, required this.onCreate});

  final Future<void> Function() onReload;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.xxl),
      children: [
        const SizedBox(height: AppSpacing.xxxl),
        const Icon(
          Icons.account_tree_outlined,
          size: 56,
          color: AppColors.primary,
        ),
        const SizedBox(height: AppSpacing.lg),
        const Text(
          '还没有加入任何项目',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          '人轴按项目组织人员与责任。请先新建项目，或通过项目经理发出的邀请加入已有项目。',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 13,
            height: 1.5,
            color: AppColors.textSecondaryOf(isDark),
          ),
        ),
        const SizedBox(height: AppSpacing.xl),
        AppButton(label: '新建项目', isFullWidth: true, onPressed: onCreate),
        const SizedBox(height: AppSpacing.sm),
        AppButton(
          label: '刷新项目列表',
          variant: AppButtonVariant.secondary,
          isFullWidth: true,
          onPressed: () => onReload(),
        ),
        const SizedBox(height: AppSpacing.lg),
        const AxisInfoBanner(text: '加入项目需要项目经理在「项目与团队」中发出邀请，邀请链接在消息中心领取。'),
      ],
    );
  }
}

class _ProjectBar extends StatelessWidget {
  const _ProjectBar({required this.projectName, this.onTap});

  final String projectName;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: InkWell(
        key: const Key('axis-project-picker'),
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        child: Container(
          constraints: const BoxConstraints(minHeight: 44),
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
          decoration: BoxDecoration(
            color: isDark ? AppColors.darkSurface : AppColors.surface,
            borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
            border: Border.all(
              color: isDark ? AppColors.darkBorder : AppColors.border,
            ),
          ),
          child: Row(
            children: [
              Text(
                '当前项目',
                style: TextStyle(
                  fontSize: 12,
                  color: isDark
                      ? AppColors.darkTextTertiary
                      : AppColors.textTertiary,
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
                    fontWeight: FontWeight.w600,
                    color: isDark
                        ? AppColors.darkTextPrimary
                        : AppColors.textPrimary,
                  ),
                ),
              ),
              Icon(
                Icons.unfold_more,
                size: 18,
                color: isDark
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

class _QuickEntry extends StatelessWidget {
  const _QuickEntry({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
      child: Container(
        constraints: const BoxConstraints(minHeight: 44),
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.sm,
        ),
        decoration: BoxDecoration(
          color: AppColors.primary.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 17, color: AppColors.primary),
            const SizedBox(width: AppSpacing.xs),
            Flexible(
              child: Text(
                label,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppColors.primary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MineView extends StatelessWidget {
  const _MineView({
    required this.controller,
    required this.onOpenPerson,
    required this.onOpenMatter,
    required this.onAddSubordinate,
    required this.onSwitchOverview,
  });

  final AxisController controller;
  final ValueChanged<AxisPersonNode> onOpenPerson;
  final ValueChanged<AxisWorkItem> onOpenMatter;
  final Future<void> Function() onAddSubordinate;
  final VoidCallback onSwitchOverview;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final self = controller.selfNode;
    final supervisor = controller.supervisorNode;
    final subordinates = controller.subordinateNodes;

    if (self == null) {
      return ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          const AxisInfoBanner(
            text: '你尚未关联本项目的人员节点。可以查看项目全貌，或联系项目经理把你的账号挂到人轴上。',
          ),
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: '查看项目全貌',
            variant: AppButtonVariant.secondary,
            isFullWidth: true,
            onPressed: onSwitchOverview,
          ),
        ],
      );
    }

    return RefreshIndicator(
      onRefresh: controller.load,
      child: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          const AxisInfoBanner(text: '汇报路径由人轴决定，AI 辅助整理与递交。'),
          const SizedBox(height: AppSpacing.md),
          if (supervisor != null)
            _MiniPersonCard(
              key: const Key('axis-supervisor-card'),
              title: supervisor.name,
              subtitle: '直属领导 · '
                  '${supervisor.roleTitle.isEmpty ? '管理者' : supervisor.roleTitle}',
              onTap: () => onOpenPerson(supervisor),
              showAiStatus: controller.showAiStatus,
            )
          else
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
              child: Text(
                '当前为项目顶层负责人，无直属上级',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 12,
                  color: isDarkMode(context)
                      ? AppColors.darkTextTertiary
                      : AppColors.textTertiary,
                ),
              ),
            ),
          const _VerticalConnector(),
          _SelfCard(
            node: self,
            showAiStatus: controller.showAiStatus && !controller.reportsError,
            report: (controller.currentUserId != null
                ? controller.latestReports[controller.currentUserId]
                : (self.primaryAssignee != null
                    ? controller.latestReports[self.primaryAssignee!.userId]
                    : null)),
            onTap: () => onOpenPerson(self),
          ),
          const _VerticalConnector(),
          Row(
            children: [
              Expanded(
                child: Text(
                  '直属下属（${subordinates.length}）',
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (controller.permissions.nodeCan(self, 'can_add_subordinate'))
                TextButton.icon(
                  key: const Key('axis-add-subordinate'),
                  onPressed: () => onAddSubordinate(),
                  icon: const Icon(Icons.add, size: 16),
                  label: const Text('新增下属'),
                ),
            ],
          ),
          if (subordinates.isEmpty)
            AxisCard(
              child: Column(
                children: [
                  Text(
                    '暂无直属下属',
                    style: TextStyle(
                      fontSize: 12,
                      color: isDarkMode(context)
                          ? AppColors.darkTextTertiary
                          : AppColors.textTertiary,
                    ),
                  ),
                  if (controller.permissions.nodeCan(
                    self,
                    'can_add_subordinate',
                  )) ...[
                    const SizedBox(height: AppSpacing.sm),
                    AppButton(
                      label: '添加下级人员',
                      size: AppButtonSize.sm,
                      onPressed: () => onAddSubordinate(),
                    ),
                  ],
                ],
              ),
            )
          else
            ...subordinates.map(
              (sub) {
                final role = sub.roleTitle.trim().isNotEmpty &&
                        sub.roleTitle.trim() != sub.name.trim()
                    ? sub.roleTitle.trim()
                    : (sub.title.trim().isNotEmpty &&
                            sub.title.trim() != sub.name.trim()
                        ? sub.title.trim()
                        : '团队成员');
                final subUserId = sub.primaryAssignee?.userId ??
                    (sub.ownerUserIds.isNotEmpty
                        ? sub.ownerUserIds.first
                        : null);
                final subReport = subUserId != null
                    ? controller.latestReports[subUserId]
                    : null;
                return Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: _MiniPersonCard(
                    key: Key('axis-subordinate-${sub.id}'),
                    title: sub.name,
                    subtitle: '$role · 我的直属下属',
                    onTap: () => onOpenPerson(sub),
                    showAiStatus:
                        controller.showAiStatus && !controller.reportsError,
                    report: subReport,
                  ),
                );
              },
            ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              const Expanded(
                child: Text(
                  '我的责任事项',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                ),
              ),
              TextButton(
                onPressed: () => onOpenPerson(self),
                child: const Text('查看全部'),
              ),
            ],
          ),
          AxisCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                if (self.workItems.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(AppSpacing.lg),
                    child: Text('暂无待办责任事项'),
                  )
                else
                  ...self.workItems.map(
                    (item) => ListTile(
                      leading: Icon(
                        item.isDone
                            ? Icons.check_circle
                            : Icons.radio_button_unchecked,
                        color: item.isDone
                            ? AppColors.primary
                            : AppColors.textTertiaryOf(isDark),
                      ),
                      title: Text(item.title),
                      subtitle: Text('${item.statusLabel} · ${item.percent}%'),
                      trailing: const Icon(Icons.chevron_right, size: 18),
                      onTap: () => onOpenMatter(item),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SelfCard extends StatelessWidget {
  const _SelfCard({
    required this.node,
    required this.onTap,
    required this.showAiStatus,
    this.report,
  });

  final AxisPersonNode node;
  final VoidCallback onTap;
  final bool showAiStatus;
  final AgentReport? report;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final pres = formatReportPresentation(report, isDark: isDark);
    return InkWell(
      key: const Key('axis-self-card'),
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.lg),
        decoration: BoxDecoration(
          color: AppColors.primary.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
          border: Border.all(color: AppColors.primary, width: 2),
        ),
        child: Column(
          children: [
            Row(
              children: [
                AxisPersonAvatar(name: node.name, size: 44, highlight: true),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              '${node.name} · 我',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.xs),
                          const AxisStatusChip(label: '当前责任人'),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${node.roleTitle.isEmpty ? '岗位未指定' : node.roleTitle}'
                        ' · ${node.department.isEmpty ? '项目团队' : node.department}',
                        maxLines: 2,
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondaryOf(isDark),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (showAiStatus) ...[
              const Divider(height: 20),
              Row(
                children: [
                  if (pres.icon != null) ...[
                    Icon(
                      pres.icon,
                      size: 14,
                      color: pres.iconColor ?? pres.textColor,
                    ),
                    const SizedBox(width: 5),
                  ],
                  Expanded(
                    child: Text(
                      pres.text,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: pres.textColor,
                      ),
                    ),
                  ),
                  Icon(Icons.chevron_right, size: 16, color: pres.textColor),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _MiniPersonCard extends StatelessWidget {
  const _MiniPersonCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.onTap,
    required this.showAiStatus,
    this.report,
  });

  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool showAiStatus;
  final AgentReport? report;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final pres = formatReportPresentation(report, isDark: isDark);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
      child: AxisCard(
        child: Row(
          children: [
            AxisPersonAvatar(name: title, size: 38),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    maxLines: 2,
                    style: TextStyle(
                      fontSize: 11,
                      color: AppColors.textSecondaryOf(isDark),
                    ),
                  ),
                  if (showAiStatus) ...[
                    const SizedBox(height: 4),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (pres.icon != null) ...[
                          Icon(
                            pres.icon,
                            size: 14,
                            color: pres.iconColor ?? pres.textColor,
                          ),
                          const SizedBox(width: 4),
                        ],
                        Text(
                          pres.text,
                          style: TextStyle(
                            fontSize: 11,
                            color: pres.textColor,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const Icon(Icons.chevron_right, size: 18),
          ],
        ),
      ),
    );
  }
}

class _VerticalConnector extends StatelessWidget {
  const _VerticalConnector();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 2,
      height: 18,
      margin: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      color: AppColors.primary.withValues(alpha: 0.35),
    );
  }
}

class _OverviewView extends StatelessWidget {
  const _OverviewView({
    required this.controller,
    required this.viewport,
    required this.onOpenPerson,
    required this.onOpenMatter,
    required this.onError,
    required this.onNotice,
    this.onAddRoot,
  });

  final AxisController controller;
  final AxisViewportController viewport;
  final VoidCallback? onAddRoot;
  final ValueChanged<AxisPersonNode> onOpenPerson;
  final void Function(AxisWorkItem item, int ownerId) onOpenMatter;
  final ValueChanged<Object> onError;
  final ValueChanged<String> onNotice;

  Future<void> _confirmReparent(
    BuildContext context,
    AxisPersonNode dragged,
    AxisPersonNode target,
  ) async {
    final check = AxisRules.validateDrop(
      dragged: AxisDragSubject(
        id: dragged.id,
        isPerson: true,
        parentId: dragged.parentId,
        nodeOrigin: dragged.nodeOrigin,
      ),
      target: AxisDragSubject(
        id: target.id,
        isPerson: true,
        parentId: target.parentId,
        nodeOrigin: target.nodeOrigin,
      ),
      nodes: controller.nodes,
      canAddUnderTarget: controller.permissions.nodeCan(
        target,
        'can_add_subordinate',
      ),
      hasPermission: controller.permissions.nodeCan(
            dragged,
            'can_change_supervisor',
          ) ||
          controller.permissions.canManageStructure ||
          controller.permissions.canEditAll,
    );
    if (!check.allowed) {
      onNotice(check.reason ?? '该位置不可放置');
      return;
    }
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: '调整上级',
      message: '把「${dragged.name}」（连同他的下属和任务）调到「${target.name}」下面？',
      confirmLabel: '确定',
    );
    if (confirmed != true) return;
    try {
      await controller.moveNode(dragged.id, target.id);
    } catch (e) {
      onError(e);
    }
  }

  Future<void> _openAddChild(
    BuildContext context,
    AxisPersonNode parent,
  ) async {
    await showAppBottomSheet<void>(
      context: context,
      title: '新增下级人员',
      builder: (ctx) => AxisPersonForm(
        api: controller.api,
        projectId: controller.projectId,
        allNodes: controller.nodes,
        members: controller.members,
        suggestedParentId: parent.id,
        canChangeSupervisor: controller.permissions.canManageStructure ||
            controller.permissions.canEditAll,
        canManageAssignees: true,
        onSaved: () async {
          if (!ctx.mounted) return;
          Navigator.of(ctx).pop();
          await controller.load();
          onNotice('人员信息保存成功');
        },
        onCancel: () => Navigator.of(ctx).pop(),
      ),
    );
  }

  Future<void> _openRelinkPerson(
    BuildContext context,
    AxisPersonNode person,
  ) async {
    final candidates = AxisRules.supervisorCandidates(
      current: person,
      nodes: controller.nodes,
    );
    final chosen = await showAxisPickerSheet<AxisPersonNode>(
      context: context,
      title: '调整上级',
      items: candidates,
      labelOf: (p) =>
          '${p.name}（${p.roleTitle.isEmpty ? '无岗位' : p.roleTitle}）',
      emptyLabel: '无可用的上级候选人',
    );
    if (chosen == null || !context.mounted) return;
    await _confirmReparent(context, person, chosen);
  }

  @override
  Widget build(BuildContext context) {
    if (controller.visibleNodes.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          AxisCard(
            child: Column(
              children: [
                const Icon(
                  Icons.account_tree_outlined,
                  size: 42,
                  color: AppColors.primary,
                ),
                const SizedBox(height: AppSpacing.md),
                const Text(
                  '人轴还没有人员',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  '终责人是人轴的根，下属和任务都挂在人员下面。',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12,
                    color: isDarkMode(context)
                        ? AppColors.darkTextTertiary
                        : AppColors.textTertiary,
                  ),
                ),
                if (onAddRoot != null) ...[
                  const SizedBox(height: AppSpacing.md),
                  AppButton(
                    key: const Key('axis-add-root'),
                    label: '先添加终责人',
                    onPressed: onAddRoot,
                  ),
                ],
              ],
            ),
          ),
        ],
      );
    }

    final media = MediaQuery.of(context);
    return Column(
      children: [
        MediaQuery(
          data: media.copyWith(
            textScaler: media.textScaler.clamp(maxScaleFactor: 1.0),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
            child: SizedBox(
              height: 34,
              child: Row(
                children: [
                  _OrientationSegment(
                    orientation: controller.orientation,
                    onChanged: controller.setOrientation,
                  ),
                  const SizedBox(width: 4),
                  TextButton.icon(
                    key: const Key('axis-locate-me'),
                    style: TextButton.styleFrom(
                      padding:
                          const EdgeInsets.symmetric(horizontal: 6, vertical: 0),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    onPressed: controller.selfNode == null
                        ? null
                        : () => viewport.focusNode(controller.selfNode!.id),
                    icon: const Icon(Icons.my_location, size: 14),
                    label: const Text('定位我', style: TextStyle(fontSize: 12)),
                  ),
                  const SizedBox(width: 4),
                  TextButton.icon(
                    key: const Key('axis-fit-screen'),
                    style: TextButton.styleFrom(
                      padding:
                          const EdgeInsets.symmetric(horizontal: 6, vertical: 0),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    onPressed: viewport.fitToScreen,
                    icon: const Icon(Icons.aspect_ratio, size: 14),
                    label: const Text('适应屏幕', style: TextStyle(fontSize: 12)),
                  ),
                  const Spacer(),
                  _AxisMoreMenu(
                    controller: controller,
                    viewport: viewport,
                    onResetLayout: () async {
                      final confirmed = await showAppConfirmDialog(
                        context: context,
                        title: '重置卡片布局',
                        message: '重置布局仅将所有卡片恢复到自动对齐位置，'
                            '不会删除任何人员和责任事项。确认重置？',
                        confirmLabel: '确认重置',
                      );
                      if (confirmed != true) return;
                      viewport.fitToScreen();
                      try {
                        await controller.resetLayout();
                        onNotice('卡片布局已重置');
                      } catch (e) {
                        onError(e);
                      }
                    },
                  ),
                ],
              ),
            ),
          ),
        ),
        Expanded(
          child: Stack(
            children: [
              Positioned.fill(
                child: Container(
                  color: isDarkMode(context)
                      ? const Color(0xFF151C24)
                      : const Color(0xFFEEF2F7),
                  child: AxisCanvas(
                    nodes: controller.visibleNodes,
                    orientation: controller.orientation,
                    spacing: controller.spacing,
                    sort: controller.sort,
                    edgeStyle: controller.edgeStyle,
                    offsets: {
                      for (final node in controller.visibleNodes)
                        node.id: controller.offsetFor(node.id),
                    },
                    permissions: controller.permissions,
                    selfNodeId: controller.selfNode?.id,
                    selectedNodeId: controller.selectedNodeId,
                    showAiStatus: controller.showAiStatus,
                    viewportController: viewport,
                    onOpenPerson: onOpenPerson,
                    onSelectPerson: controller.select,
                    onOpenMatter: onOpenMatter,
                    onReparentPerson: (dragged, target) =>
                        _confirmReparent(context, dragged, target),
                    onLayoutChanged: (node, offset) async {
                      try {
                        await controller.saveLayout(node.id, offset);
                      } catch (e) {
                        onError(e);
                      }
                    },
                    onNotice: onNotice,
                    onAddChild: (parent) => _openAddChild(context, parent),
                    onEditPerson: onOpenPerson,
                    onRelinkPerson: (person) =>
                        _openRelinkPerson(context, person),
                  ),
                ),
              ),
              if (AxisTreeMapper.extraRootIds(controller.visibleNodes)
                  .isNotEmpty)
                const Positioned(
                  top: AppSpacing.sm,
                  left: AppSpacing.lg,
                  right: AppSpacing.lg,
                  child: DecoratedBox(
                    key: Key('axis-multi-root-banner'),
                    decoration: BoxDecoration(
                      color: AppColors.warningLight,
                      borderRadius: BorderRadius.all(
                        Radius.circular(AppSpacing.radiusMd),
                      ),
                      border: Border.fromBorderSide(
                        BorderSide(color: AppColors.warning),
                      ),
                    ),
                    child: Padding(
                      padding: EdgeInsets.all(AppSpacing.sm),
                      child: Text(
                        '该项目存在多个根节点，请联系管理员整理',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ),
                  ),
                ),
              const Positioned(
                left: AppSpacing.lg,
                bottom: AppSpacing.lg + 52,
                child: _AxisCanvasHint(),
              ),
              Positioned(
                left: AppSpacing.lg,
                right: AppSpacing.lg,
                bottom: AppSpacing.lg,
                child: Row(
                  children: [
                    Container(
                      decoration: BoxDecoration(
                        color: Theme.of(
                          context,
                        ).colorScheme.surface.withValues(alpha: 0.95),
                        borderRadius: BorderRadius.circular(
                          AppSpacing.radiusLg,
                        ),
                        border: Border.all(color: AppColors.border),
                      ),
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: Row(
                        children: [
                          IconButton(
                            tooltip: '缩小画布',
                            onPressed: viewport.zoomOut,
                            icon: const Icon(Icons.remove, size: 18),
                          ),
                          ValueListenableBuilder<double>(
                            valueListenable: viewport.scale,
                            builder: (context, scale, _) => TextButton(
                              onPressed: viewport.reset,
                              child: Text(
                                '${(scale * 100).round()}%',
                                style: const TextStyle(fontSize: 12),
                              ),
                            ),
                          ),
                          IconButton(
                            tooltip: '放大画布',
                            onPressed: viewport.zoomIn,
                            icon: const Icon(Icons.add, size: 18),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ChoiceButton extends StatelessWidget {
  const _ChoiceButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.xs + 2,
        ),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.primary.withValues(alpha: 0.12)
              : AppColors.surfaceVariant,
          borderRadius: BorderRadius.circular(AppSpacing.radiusFull),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            color: selected
                ? AppColors.primary
                : AppColors.textSecondaryOf(isDark),
          ),
        ),
      ),
    );
  }
}

class _OrientationSegment extends StatelessWidget {
  const _OrientationSegment({
    required this.orientation,
    required this.onChanged,
  });

  final AxisOrientation orientation;
  final ValueChanged<AxisOrientation> onChanged;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return Container(
      height: 28,
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurfaceVariant : const Color(0xFFF1F3F6),
        borderRadius: BorderRadius.circular(14),
      ),
      padding: const EdgeInsets.all(2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildItem(
            context: context,
            label: '纵向',
            selected: orientation == AxisOrientation.vertical,
            onTap: () => onChanged(AxisOrientation.vertical),
          ),
          _buildItem(
            context: context,
            label: '横向',
            selected: orientation == AxisOrientation.horizontal,
            onTap: () => onChanged(AxisOrientation.horizontal),
          ),
        ],
      ),
    );
  }

  Widget _buildItem({
    required BuildContext context,
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    final isDark = isDarkMode(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: selected
              ? (isDark ? AppColors.darkSurface : Colors.white)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
          boxShadow: selected
              ? const [
                  BoxShadow(
                    color: Color(0x14000000),
                    blurRadius: 2,
                    offset: Offset(0, 1),
                  )
                ]
              : null,
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
            color: selected
                ? AppColors.primary
                : (isDark
                    ? AppColors.darkTextSecondary
                    : AppColors.textSecondary),
          ),
        ),
      ),
    );
  }
}

class _AxisMoreMenu extends StatelessWidget {
  const _AxisMoreMenu({
    required this.controller,
    required this.viewport,
    required this.onResetLayout,
  });

  final AxisController controller;
  final AxisViewportController viewport;
  final VoidCallback onResetLayout;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      key: const Key('axis-more-menu'),
      icon: const Icon(Icons.more_horiz, size: 20),
      tooltip: '更多设置',
      padding: EdgeInsets.zero,
      itemBuilder: (ctx) => [
        PopupMenuItem<String>(
          enabled: false,
          height: 24,
          child: Text(
            '连线线型',
            style: TextStyle(
              fontSize: 11,
              color: Theme.of(ctx).colorScheme.outline,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        PopupMenuItem<String>(
          value: 'edge_curve',
          height: 36,
          child: Row(
            children: [
              Icon(
                controller.edgeStyle == AxisEdgeStyle.curve ? Icons.check : null,
                size: 16,
                color: AppColors.primary,
              ),
              const SizedBox(width: 8),
              const Text('曲线连线', style: TextStyle(fontSize: 13)),
            ],
          ),
        ),
        PopupMenuItem<String>(
          value: 'edge_straight',
          height: 36,
          child: Row(
            children: [
              Icon(
                controller.edgeStyle == AxisEdgeStyle.straight
                    ? Icons.check
                    : null,
                size: 16,
                color: AppColors.primary,
              ),
              const SizedBox(width: 8),
              const Text('直线连线', style: TextStyle(fontSize: 13)),
            ],
          ),
        ),
        const PopupMenuDivider(height: 8),
        PopupMenuItem<String>(
          enabled: false,
          height: 24,
          child: Text(
            '排序规则',
            style: TextStyle(
              fontSize: 11,
              color: Theme.of(ctx).colorScheme.outline,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        PopupMenuItem<String>(
          value: 'sort_tree',
          height: 36,
          child: Row(
            children: [
              Icon(
                controller.sort == AxisSort.tree ? Icons.check : null,
                size: 16,
                color: AppColors.primary,
              ),
              const SizedBox(width: 8),
              const Text('树状序', style: TextStyle(fontSize: 13)),
            ],
          ),
        ),
        PopupMenuItem<String>(
          value: 'sort_time',
          height: 36,
          child: Row(
            children: [
              Icon(
                controller.sort == AxisSort.time ? Icons.check : null,
                size: 16,
                color: AppColors.primary,
              ),
              const SizedBox(width: 8),
              const Text('时间序', style: TextStyle(fontSize: 13)),
            ],
          ),
        ),
        const PopupMenuDivider(height: 8),
        PopupMenuItem<String>(
          enabled: false,
          height: 24,
          child: Text(
            '节点间距',
            style: TextStyle(
              fontSize: 11,
              color: Theme.of(ctx).colorScheme.outline,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        for (final sp in AxisSpacing.values)
          PopupMenuItem<String>(
            value: 'spacing_${sp.name}',
            height: 36,
            child: Row(
              children: [
                Icon(
                  controller.spacing == sp ? Icons.check : null,
                  size: 16,
                  color: AppColors.primary,
                ),
                const SizedBox(width: 8),
                Text(sp.label, style: const TextStyle(fontSize: 13)),
              ],
            ),
          ),
        const PopupMenuDivider(height: 8),
        const PopupMenuItem<String>(
          value: 'reset_layout',
          height: 36,
          child: Row(
            children: [
              Icon(Icons.refresh, size: 16),
              SizedBox(width: 8),
              Text('重置卡片布局', style: TextStyle(fontSize: 13)),
            ],
          ),
        ),
      ],
      onSelected: (val) {
        switch (val) {
          case 'edge_curve':
            controller.setEdgeStyle(AxisEdgeStyle.curve);
            break;
          case 'edge_straight':
            controller.setEdgeStyle(AxisEdgeStyle.straight);
            break;
          case 'sort_tree':
            controller.setSort(AxisSort.tree);
            break;
          case 'sort_time':
            controller.setSort(AxisSort.time);
            break;
          case 'spacing_compact':
            controller.setSpacing(AxisSpacing.compact);
            break;
          case 'spacing_standard':
            controller.setSpacing(AxisSpacing.standard);
            break;
          case 'spacing_loose':
            controller.setSpacing(AxisSpacing.loose);
            break;
          case 'reset_layout':
            onResetLayout();
            break;
        }
      },
    );
  }
}

class _AxisCanvasHint extends StatefulWidget {
  const _AxisCanvasHint();

  @override
  State<_AxisCanvasHint> createState() => _AxisCanvasHintState();
}

class _AxisCanvasHintState extends State<_AxisCanvasHint> {
  bool _visible = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _checkHint();
  }

  Future<void> _checkHint() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final seen = prefs.getBool('axis_canvas_hint_seen') ?? false;
      if (!seen && mounted) {
        setState(() => _visible = true);
        _timer = Timer(const Duration(seconds: 5), _dismiss);
      }
    } catch (_) {
      if (mounted) setState(() => _visible = false);
    }
  }

  void _dismiss() {
    _timer?.cancel();
    _timer = null;
    if (_visible && mounted) {
      setState(() => _visible = false);
    }
    _markSeen();
  }

  Future<void> _markSeen() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool('axis_canvas_hint_seen', true);
    } catch (_) {
      // 忽略
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_visible) return const SizedBox.shrink();
    return GestureDetector(
      onTap: _dismiss,
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.xs,
        ),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.75),
          borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        ),
        child: const Text(
          '拖到别人卡片上停一下＝换上级\n拖到空白处＝挪位置',
          key: Key('axis-drag-hint'),
          style: TextStyle(fontSize: 11, color: Colors.white),
        ),
      ),
    );
  }
}
