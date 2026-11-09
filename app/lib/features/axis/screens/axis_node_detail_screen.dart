import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:provider/provider.dart';

import '../../../core/errors/app_error.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../design/design.dart';
import '../data/axis_api.dart';
import '../data/axis_models.dart';
import '../data/axis_rules.dart';
import '../data/axis_tree_mapper.dart';
import '../widgets/axis_common.dart';
import '../widgets/axis_matter_form.dart';
import '../data/axis_matter_patch.dart';

/// 人员 / 事项详情（axis-person-detail、axis-node-detail）。
///
/// 数据都从后端现拉：`GET /nodes/{id}` 决定节点类型，`GET /projects/{id}/tree`
/// 提供上下级与责任事项，`GET /projects/{id}/my-permissions` 决定按钮显隐。
/// 客户端权限只做体验优化，删除、移动、改权限最终以后端返回为准。
class AxisNodeDetailScreen extends StatefulWidget {
  const AxisNodeDetailScreen({
    super.key,
    required this.nodeId,
    this.projectId,
    this.api,
  });

  final int nodeId;
  final int? projectId;
  final AxisApi? api;

  @override
  State<AxisNodeDetailScreen> createState() => _AxisNodeDetailScreenState();
}

class _AxisNodeDetailScreenState extends State<AxisNodeDetailScreen> {
  AxisApi? _api;
  bool _loading = true;
  Object? _error;
  int _epoch = 0;

  Map<String, dynamic>? _nodeJson;
  List<AxisPersonNode> _tree = const [];
  AxisPermissions _permissions = AxisPermissions.empty;
  int? _projectId;
  bool _matterDeleted = false;
  bool _canUndoMatter = false;
  bool _matterBusy = false;
  Timer? _undoTimer;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_api != null) return;
    _api = widget.api ?? AxisApi(context.read<AuthState>().api);
    _load();
  }

  @override
  void didUpdateWidget(covariant AxisNodeDetailScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.nodeId == widget.nodeId &&
        oldWidget.projectId == widget.projectId) {
      return;
    }
    // GoRouter 复用同一个页面状态（如 /axis/node/102 → /axis/node/201）：
    // 必须作废进行中的请求、清掉旧节点数据，再按新参数重新加载，
    // 否则会“旧数据配新 ID”，进度与材料入口指向另一个节点。
    _epoch++;
    _undoTimer?.cancel();
    setState(() {
      _nodeJson = null;
      _tree = const [];
      _permissions = AxisPermissions.empty;
      _projectId = null;
      _error = null;
      _loading = true;
      _matterDeleted = false;
      _canUndoMatter = false;
      _matterBusy = false;
    });
    _load();
  }

  @override
  void dispose() {
    _epoch++;
    _undoTimer?.cancel();
    super.dispose();
  }

  bool get _isPerson => _nodeJson?['node_type_key'] == 'person';

  AxisPersonNode? get _person {
    for (final node in _tree) {
      if (node.id == widget.nodeId) return node;
    }
    return null;
  }

  Future<void> _load() async {
    final epoch = ++_epoch;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = _api!;
      final nodeJson = await api.fetchNode(widget.nodeId);
      if (!mounted || epoch != _epoch) return;
      final projectId = widget.projectId ??
          (nodeJson['project_id'] as num?)?.toInt() ??
          await api.findProjectIdForNode(widget.nodeId);
      if (projectId == null) {
        throw ApiException('无法确定该节点所属项目', code: 422);
      }
      final results = await Future.wait<dynamic>([
        api.fetchProjectTree(projectId),
        api.fetchPermissions(projectId),
        api.fetchProject(projectId),
      ]);
      if (!mounted || epoch != _epoch) return;
      setState(() {
        _nodeJson = nodeJson;
        _tree = AxisTreeMapper.mapTree(
          results[0] as List<Map<String, dynamic>>,
          finalOwnerUserId: (results[2] as AxisProjectInfo).pmUserId,
        );
        _permissions = results[1] as AxisPermissions;
        _projectId = projectId;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || epoch != _epoch) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  void _toast(String message, {ToastType type = ToastType.info}) {
    if (!mounted) return;
    showAppToast(context, message, type: type);
  }

  Future<void> _openProgress() async {
    final projectId = _projectId;
    await context.push(
      '/axis/node/${widget.nodeId}/progress'
      '${projectId == null ? '' : '?projectId=$projectId'}',
    );
  }

  Future<void> _openEdit(AxisPersonNode person) async {
    await context
        .push('/axis/person/${person.id}/edit?projectId=${_projectId ?? ''}');
    if (!mounted) return;
    await _load();
  }

  /// 带着解析出的项目 ID 打开材料提交。
  ///
  /// 深链进来时全局选中的项目可能不是本节点所属项目，材料路由会退回全局项目，
  /// 造成草稿和上传落到别的项目（项目隔离）。
  String get _evidenceSubmitLocation {
    final projectId = _projectId;
    return '/evidence/submit?nodeId=${widget.nodeId}'
        '${projectId == null ? '' : '&projectId=$projectId'}';
  }

  String get _wikiLocation {
    final projectId = _projectId;
    return '/evidence/wiki${projectId == null ? '' : '?projectId=$projectId'}';
  }

  Future<void> _openEvidence() async {
    await context.push(_evidenceSubmitLocation);
  }

  Future<void> _editMatter() async {
    final epoch = _epoch;
    final projectId = _projectId;
    if (projectId == null || _nodeJson == null) return;
    final original = _nodeJson!;
    try {
      final members = await _api!.fetchMembers(projectId);
      if (!mounted || epoch != _epoch) return;
      final saved = await showAppBottomSheet<bool>(
          context: context,
          title: '编辑事项',
          builder: (ctx) => AxisMatterForm(
                api: _api!,
                original: original,
                members: members,
                canChangeAssignee:
                    _permissions.nodePermissions[widget.nodeId.toString()]
                            ?['can_manage_assignees'] ??
                        (_permissions.isPm || _permissions.isSuperAdmin),
                onSaved: () => Navigator.of(ctx).pop(true),
              ));
      if (saved == true && mounted && epoch == _epoch) {
        await _load();
        _toast('事项已更新');
      }
    } catch (error) {
      _toast(axisErrorMessage(error), type: ToastType.error);
    }
  }

  Future<void> _deleteMatter() async {
    final epoch = _epoch;
    final confirmed = await showAppConfirmDialog(
        context: context,
        title: '删除事项',
        message: '即将删除「${_nodeJson?['title'] ?? ''}」。删除后可在15秒内撤销恢复。',
        confirmLabel: '确认删除');
    if (confirmed != true || !mounted || epoch != _epoch) return;
    setState(() => _matterBusy = true);
    try {
      await _api!.deleteMatter(widget.nodeId);
      if (!mounted || epoch != _epoch) return;
      setState(() {
        _matterDeleted = true;
        _canUndoMatter = true;
        _matterBusy = false;
      });
      _undoTimer?.cancel();
      _undoTimer = Timer(const Duration(seconds: 15), () {
        if (mounted) setState(() => _canUndoMatter = false);
      });
    } catch (error) {
      if (mounted && epoch == _epoch) {
        setState(() => _matterBusy = false);
        _toast(axisErrorMessage(error), type: ToastType.error);
      }
    }
  }

  Future<void> _restoreMatter() async {
    final epoch = _epoch;
    setState(() => _matterBusy = true);
    try {
      await _api!.restoreMatter(widget.nodeId);
      if (!mounted || epoch != _epoch) return;
      _undoTimer?.cancel();
      setState(() {
        _matterDeleted = false;
        _canUndoMatter = false;
        _matterBusy = false;
      });
      await _load();
      _toast('已撤销删除');
    } catch (error) {
      if (mounted && epoch == _epoch) {
        setState(() => _matterBusy = false);
        _toast(axisErrorMessage(error), type: ToastType.error);
      }
    }
  }

  Future<void> _showPermissions(AxisPersonNode person) async {
    var allowAddSubordinates =
        person.responsibilityPermissions['allow_add_subordinates'] != false;
    var allowAddWorkItems =
        person.responsibilityPermissions['allow_add_work_items'] != false;
    var evidenceSubmit =
        (person.responsibilityPermissions['evidence_submit'] ?? 'inherit')
            .toString();
    var submitting = false;
    String? error;

    await showAppBottomSheet<void>(
      context: context,
      title: '节点权限',
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          Future<void> save() async {
            setSheetState(() {
              submitting = true;
              error = null;
            });
            try {
              await _api!.updateNode(
                person.id,
                responsibilityPermissions: {
                  ...person.responsibilityPermissions,
                  'allow_add_subordinates': allowAddSubordinates,
                  'allow_add_work_items': allowAddWorkItems,
                  'evidence_submit': evidenceSubmit,
                },
              );
              if (!ctx.mounted) return;
              Navigator.of(ctx).pop();
              _toast('节点权限已更新');
              await _load();
            } catch (e) {
              if (!ctx.mounted) return;
              setSheetState(() {
                submitting = false;
                error = axisErrorMessage(e);
              });
            }
          }

          final isDark = isDarkMode(ctx);
          return ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: [
              AxisCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      person.roleTitle.trim().isEmpty ||
                              person.roleTitle.trim() == person.name.trim()
                          ? person.name
                          : '${person.name} · ${person.roleTitle.trim()}',
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '权限作用于当前项目的人轴节点',
                      style: TextStyle(
                        fontSize: 11,
                        color: AppColors.textTertiaryOf(isDark),
                      ),
                    ),
                  ],
                ),
              ),
              if (error != null) ...[
                const SizedBox(height: AppSpacing.md),
                AxisErrorBanner(message: error!),
              ],
              const SizedBox(height: AppSpacing.md),
              AxisCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    SwitchListTile(
                      value: allowAddSubordinates,
                      title: const Text('可新增直属下属'),
                      subtitle: const Text('允许在本节点下新增人员'),
                      onChanged: (v) =>
                          setSheetState(() => allowAddSubordinates = v),
                    ),
                    SwitchListTile(
                      value: allowAddWorkItems,
                      title: const Text('可新增责任事项'),
                      subtitle: const Text('允许创建绑定本节点的事项'),
                      onChanged: (v) =>
                          setSheetState(() => allowAddWorkItems = v),
                    ),
                    ListTile(
                      title: const Text('可提交证据材料'),
                      subtitle: const Text('仅限授权范围内的材料'),
                      trailing: DropdownButton<String>(
                        value: evidenceSubmit,
                        underline: const SizedBox.shrink(),
                        items: const [
                          DropdownMenuItem(
                              value: 'inherit', child: Text('继承上级')),
                          DropdownMenuItem(
                              value: 'members', child: Text('项目成员')),
                          DropdownMenuItem(
                              value: 'responsible', child: Text('责任人')),
                          DropdownMenuItem(
                              value: 'disabled', child: Text('已禁用')),
                        ],
                        onChanged: (v) {
                          if (v != null) {
                            setSheetState(() => evidenceSubmit = v);
                          }
                        },
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              const AxisInfoBanner(text: '保存后按最新权限生效，其他设备同步更新。'),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: '保存权限',
                isFullWidth: true,
                isLoading: submitting,
                onPressed: submitting ? null : save,
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _showMoveSupervisor(AxisPersonNode person) async {
    final candidates = AxisRules.supervisorCandidates(
      current: person,
      nodes: _tree,
    );
    int? selected = person.parentId;
    var submitting = false;
    String? error;

    await showAppBottomSheet<void>(
      context: context,
      title: '调整直属上级',
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          Future<void> save() async {
            setSheetState(() {
              submitting = true;
              error = null;
            });
            try {
              await _api!.moveNode(person.id, newParentId: selected);
              if (!ctx.mounted) return;
              Navigator.of(ctx).pop();
              _toast('直属上级调整成功');
              await _load();
            } catch (e) {
              if (!ctx.mounted) return;
              setSheetState(() {
                submitting = false;
                error = axisErrorMessage(e);
              });
            }
          }

          return ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: [
              const AxisInfoBanner(
                text: '调整后，新提交汇报走新链路；历史报告保留原接收关系。',
                isWarning: true,
              ),
              if (error != null) ...[
                const SizedBox(height: AppSpacing.md),
                AxisErrorBanner(message: error!),
              ],
              const SizedBox(height: AppSpacing.md),
              AxisCard(
                padding: EdgeInsets.zero,
                child: Column(
                  children: [
                    ListTile(
                      leading: const Icon(Icons.vertical_align_top),
                      title: const Text('设为顶层负责人（无上级）'),
                      trailing: selected == null
                          ? const Icon(Icons.check, color: AppColors.primary)
                          : null,
                      onTap: () => setSheetState(() => selected = null),
                    ),
                    for (final candidate in candidates)
                      ListTile(
                        leading:
                            AxisPersonAvatar(name: candidate.name, size: 30),
                        title: Text(candidate.name),
                        subtitle: Text(
                          candidate.roleTitle.isEmpty
                              ? '岗位未指定'
                              : candidate.roleTitle,
                        ),
                        trailing: selected == candidate.id
                            ? const Icon(Icons.check, color: AppColors.primary)
                            : null,
                        onTap: () =>
                            setSheetState(() => selected = candidate.id),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: '确认调整上级',
                isFullWidth: true,
                isLoading: submitting,
                onPressed: submitting ? null : save,
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _toggleChannelAccess(AxisPersonNode person, bool value) async {
    try {
      await _api!.updateNode(
        person.id,
        responsibilityPermissions: {
          ...person.responsibilityPermissions,
          'channel_access': value,
        },
      );
      _toast(value ? '已允许进入项目频道' : '已关闭项目频道访问');
      await _load();
    } catch (e) {
      _toast(axisErrorMessage(e), type: ToastType.error);
    }
  }

  Future<void> _showDeletion(AxisPersonNode person) async {
    AxisDeletionPreview? preview;
    int? handoverId;
    var cascade = false;
    var busy = false;
    String? error;

    // 产品规则：删除前必须先调用删除预览接口，展示连锁影响。
    try {
      preview = await _api!.previewDeletion(person.id);
    } catch (e) {
      error = axisErrorMessage(e);
    }
    if (!mounted) return;

    await showAppBottomSheet<void>(
      context: context,
      title: '移除人员',
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          Future<void> loadPreview() async {
            setSheetState(() {
              busy = true;
              error = null;
            });
            try {
              final result = await _api!.previewDeletion(person.id);
              if (!ctx.mounted) return;
              setSheetState(() {
                preview = result;
                busy = false;
              });
            } catch (e) {
              if (!ctx.mounted) return;
              setSheetState(() {
                busy = false;
                error = axisErrorMessage(e);
              });
            }
          }

          Future<void> confirm() async {
            final current = preview;
            if (current == null) return;
            if (handoverId == null && !cascade) {
              setSheetState(() => error = '请选择交接负责人，或勾选级联移除');
              return;
            }
            setSheetState(() {
              busy = true;
              error = null;
            });
            try {
              await _api!.deletePerson(
                person.id,
                previewToken: current.previewToken,
                cascade: handoverId == null && cascade,
                handoverToNodeId: handoverId,
              );
              if (!ctx.mounted) return;
              Navigator.of(ctx).pop();
              _toast('已移除人员并完成交接');
              if (mounted) Navigator.of(context).maybePop();
            } catch (e) {
              if (!ctx.mounted) return;
              setSheetState(() {
                busy = false;
                error = axisErrorMessage(e);
              });
            }
          }

          final data = preview;
          return ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.all(AppSpacing.lg),
            children: [
              if (error != null) ...[
                AxisErrorBanner(message: error!),
                const SizedBox(height: AppSpacing.md),
              ],
              if (busy && data == null)
                const Padding(
                  padding: EdgeInsets.all(AppSpacing.xxl),
                  child: Center(child: AppLoading()),
                )
              else if (data == null)
                AppButton(
                  label: '重新获取移除影响',
                  isFullWidth: true,
                  onPressed: loadPreview,
                )
              else ...[
                AxisInfoBanner(text: data.warning, isWarning: true),
                const SizedBox(height: AppSpacing.md),
                AxisCard(
                  child: Text(
                    '涉及 ${data.affectedUserIds.length} 位成员、'
                    '${data.descendantCount} 个下级节点、'
                    '${data.affectedTaskCount} 项任务、'
                    '${data.affectedEvidenceCount} 份材料。',
                    style: const TextStyle(fontSize: 13, height: 1.5),
                  ),
                ),
                if (data.descendants.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.md),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 180),
                    child: AxisCard(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.md,
                        vertical: AppSpacing.sm,
                      ),
                      child: ListView(
                        shrinkWrap: true,
                        children: [
                          for (final item in data.descendants)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 4),
                              child: Text(
                                '${item.title} · ${item.isPerson ? '人员' : '事项'}',
                                style: const TextStyle(fontSize: 12),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: AppSpacing.md),
                const Text(
                  '交接给',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: AppSpacing.xs),
                AxisCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      ListTile(
                        title: const Text('不交接（级联移除）'),
                        trailing: handoverId == null && cascade
                            ? const Icon(Icons.check, color: AppColors.primary)
                            : null,
                        onTap: () => setSheetState(() {
                          handoverId = null;
                          cascade = true;
                        }),
                      ),
                      for (final candidate in data.handoverCandidates)
                        ListTile(
                          title: Text(candidate.title),
                          trailing: handoverId == candidate.id
                              ? const Icon(Icons.check,
                                  color: AppColors.primary)
                              : null,
                          onTap: () => setSheetState(() {
                            handoverId = candidate.id;
                            cascade = false;
                          }),
                        ),
                      if (data.handoverCandidates.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(AppSpacing.md),
                          child: Text(
                            '暂无可交接人员，只能级联移除。',
                            style: TextStyle(fontSize: 12),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                CheckboxListTile(
                  value: cascade && handoverId == null,
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  title: const Text(
                    '我已知悉：一并移除下级，关联任务移入回收站，'
                    '并撤销被移除成员的项目沟通权限。',
                    style: TextStyle(fontSize: 12, color: AppColors.danger),
                  ),
                  onChanged: (v) => setSheetState(() {
                    cascade = v == true;
                    if (cascade) handoverId = null;
                  }),
                ),
                const SizedBox(height: AppSpacing.md),
                AppButton(
                  label: handoverId == null ? '确认级联移除' : '确认交接并移除',
                  variant: AppButtonVariant.danger,
                  isFullWidth: true,
                  isLoading: busy,
                  onPressed: busy ? null : confirm,
                ),
                const SizedBox(height: AppSpacing.sm),
                AppButton(
                  label: '取消移除',
                  variant: AppButtonVariant.secondary,
                  isFullWidth: true,
                  onPressed: busy ? null : () => Navigator.of(ctx).pop(),
                ),
              ],
            ],
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const AppScaffold(
        title: '责任详情',
        body: Center(child: AppLoading()),
      );
    }
    if (_error != null) {
      return AppScaffold(
        title: '责任详情',
        body: AppErrorState(
          title: '无法加载节点',
          message: axisErrorMessage(_error!),
          onRetry: _load,
        ),
      );
    }

    if (_isPerson) {
      final person = _person;
      if (person == null) {
        return AppScaffold(
          title: '责任详情',
          body: AppErrorState(
            title: '节点已不在人轴上',
            message: '该人员可能已被移除，请返回人轴刷新。',
            onRetry: _load,
          ),
        );
      }
      return _buildPerson(context, person);
    }
    return _buildMatter(context);
  }

  Widget _buildPerson(BuildContext context, AxisPersonNode person) {
    final isDark = isDarkMode(context);
    final supervisor =
        _tree.where((node) => node.id == person.parentId).toList();
    final subordinates =
        _tree.where((node) => node.parentId == person.id).toList();
    final canEdit = _permissions.nodeCan(person, 'can_edit_person');
    final canManagePermissions =
        _permissions.nodeCan(person, 'can_manage_permissions');
    final canMove = _permissions.nodeCan(person, 'can_move_person') &&
        (_permissions.isPm || _permissions.isSuperAdmin);
    final canDelete = _permissions.nodeCan(person, 'can_delete_person');
    final canChannel =
        _permissions.nodeCan(person, 'can_manage_channel_access') &&
            !person.isPrimary;

    return AppScaffold(
      title: '${person.name} · 责任详情',
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          AxisCard(
            child: Column(
              children: [
                Row(
                  children: [
                    AxisPersonAvatar(
                        name: person.name, size: 52, highlight: true),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Wrap(
                            spacing: AppSpacing.xs,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              Text(
                                person.name,
                                style: const TextStyle(
                                  fontSize: 17,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              if (person.isTerminalPm)
                                const AxisStatusChip(
                                  label: '终责人',
                                  color: AppColors.warning,
                                ),
                              AxisStatusChip(
                                label: person.isPrimary ? '项目成员' : '下级自建',
                                color: person.isPrimary
                                    ? AppColors.primary
                                    : AppColors.textTertiaryOf(isDark),
                              ),
                            ],
                          ),
                          const SizedBox(height: 3),
                          Text(
                            '${person.roleTitle.isEmpty ? '岗位未指定' : person.roleTitle}'
                            ' · ${person.department.isEmpty ? '项目部门' : person.department}',
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
                const Divider(height: 22),
                Row(
                  children: [
                    SizedBox(
                      width: 64,
                      child: Text('直属领导',
                          style: TextStyle(
                              fontSize: 12,
                              color: AppColors.textTertiaryOf(isDark))),
                    ),
                    Expanded(
                      child: Text(
                        supervisor.isEmpty ? '无（顶层负责人）' : supervisor.first.name,
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 64,
                      child: Text('直属下属',
                          style: TextStyle(
                              fontSize: 12,
                              color: AppColors.textTertiaryOf(isDark))),
                    ),
                    Expanded(
                      child: Text(
                        subordinates.isEmpty
                            ? '无'
                            : subordinates.map((s) => s.name).join('、'),
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          AxisWideAction(
            label: '查看 AI 汇报与材料对照',
            icon: const Icon(Icons.auto_awesome),
            onPressed: () => context.pushNamed('ai-root'),
          ),
          if (canEdit) ...[
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                AppButton(
                  label: '编辑人员',
                  variant: AppButtonVariant.secondary,
                  size: AppButtonSize.sm,
                  onPressed: () => _openEdit(person),
                ),
                if (canManagePermissions)
                  AppButton(
                    label: '节点权限',
                    variant: AppButtonVariant.secondary,
                    size: AppButtonSize.sm,
                    onPressed: () => _showPermissions(person),
                  ),
                if (canMove)
                  AppButton(
                    label: '调整上级',
                    variant: AppButtonVariant.secondary,
                    size: AppButtonSize.sm,
                    onPressed: () => _showMoveSupervisor(person),
                  ),
              ],
            ),
          ],
          const SizedBox(height: AppSpacing.lg),
          _PersonTabs(
            person: person,
            projectId: _projectId,
            onOpenProgress: _openProgress,
            onMatterChanged: () async {
              if (mounted) await _load();
            },
          ),
          const SizedBox(height: AppSpacing.lg),
          const AxisSectionTitle('人员权限与交接'),
          AxisCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  person.isPrimary
                      ? '主轴人员：由项目经理管理。'
                      : '次级人员：仅所属主轴负责人可以移除。默认不开放项目频道。',
                  style: const TextStyle(fontSize: 12, height: 1.5),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  '人轴最多四级。',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.textTertiaryOf(isDark),
                  ),
                ),
                if (canChannel) ...[
                  const Divider(height: 20),
                  Row(
                    children: [
                      const Expanded(
                        child: Text('允许进入项目频道', style: TextStyle(fontSize: 13)),
                      ),
                      AppSwitch(
                        key: const Key('axis-channel-switch'),
                        value: person.allowChannelAccess,
                        onChanged: (v) => _toggleChannelAccess(person, v),
                      ),
                    ],
                  ),
                ],
                const Divider(height: 20),
                if (canDelete)
                  AppButton(
                    label: '查看移除影响与交接',
                    variant: AppButtonVariant.danger,
                    isFullWidth: true,
                    onPressed: () => _showDeletion(person),
                  )
                else
                  Text(
                    '你没有移除该人员的权限。次级人员只能由其主轴负责人移除；'
                    '项目经理可移除所有主轴人员。',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.textTertiaryOf(isDark),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          const AxisInfoBanner(
            text: '材料提交与项目 AI 知识库由「材料」模块负责，本页只提供入口。',
          ),
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            label: '提交材料',
            variant: AppButtonVariant.secondary,
            isFullWidth: true,
            onPressed: _openEvidence,
          ),
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            label: '打开项目知识库',
            variant: AppButtonVariant.secondary,
            isFullWidth: true,
            onPressed: () => context.push(_wikiLocation),
          ),
        ],
      ),
    );
  }

  Widget _buildMatter(BuildContext context) {
    if (_matterDeleted) {
      return AppScaffold(
          title: '事项详情',
          body: Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Center(
                        child: Text('事项已删除',
                            style: TextStyle(
                                fontSize: 18, fontWeight: FontWeight.w600))),
                    const SizedBox(height: AppSpacing.lg),
                    if (_canUndoMatter)
                      AppButton(
                          key: const Key('axis-matter-undo'),
                          label: '撤销删除',
                          isFullWidth: true,
                          isLoading: _matterBusy,
                          onPressed: _matterBusy ? null : _restoreMatter)
                    else
                      const Text('撤销时间已结束，可返回人轴查看。'),
                  ])));
    }
    final isDark = isDarkMode(context);
    final json = _nodeJson ?? const <String, dynamic>{};
    final workItem = AxisWorkItem.fromJson(json);
    // percent 已在模型里按后端状态归一（里程碑 reached 按 100% 展示）。
    final percent = workItem.percent;
    final parentId = (json['parent_id'] as num?)?.toInt();
    AxisPersonNode? owner;
    for (final node in _tree) {
      if (node.id == parentId) owner = node;
    }
    final canEdit = _permissions.nodePermissions[widget.nodeId.toString()]
            ?['can_edit_person'] ??
        (_permissions.canEditAll ||
            _permissions.ownedNodeIds.contains(widget.nodeId) ||
            _permissions.nodeCan(owner, 'can_edit_person'));

    return AppScaffold(
      title: '事项详情',
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          AxisCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        workItem.title.isEmpty ? '未命名事项' : workItem.title,
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    AxisStatusChip(
                      label: workItem.typeLabel,
                      color: AppColors.primary,
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  '${workItem.statusLabel} · 进度 $percent%',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondaryOf(isDark),
                  ),
                ),
                if (owner != null) ...[
                  const Divider(height: 22),
                  Row(
                    children: [
                      SizedBox(
                        width: 64,
                        child: Text('责任人',
                            style: TextStyle(
                                fontSize: 12,
                                color: AppColors.textTertiaryOf(isDark))),
                      ),
                      Expanded(
                        child: Text(
                          owner.roleTitle.trim().isEmpty ||
                                  owner.roleTitle.trim() == owner.name.trim()
                              ? owner.name
                              : '${owner.name} · ${owner.roleTitle.trim()}',
                          style: const TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          Text(
              '截止日期：${workItem.dueAt == null ? '未设置' : axisDateLabel(workItem.dueAt)}'),
          if (canEdit) ...[
            const SizedBox(height: AppSpacing.md),
            AppButton(
                key: const Key('axis-matter-edit'),
                label: '编辑事项',
                isFullWidth: true,
                onPressed: _matterBusy ? null : _editMatter),
          ],
          if (_permissions.canDelete) ...[
            const SizedBox(height: AppSpacing.sm),
            AppButton(
                key: const Key('axis-matter-delete'),
                label: '删除事项',
                variant: AppButtonVariant.danger,
                isLoading: _matterBusy,
                isFullWidth: true,
                onPressed: _matterBusy ? null : _deleteMatter),
          ],
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            label: '查看进度与记录',
            isFullWidth: true,
            onPressed: _openProgress,
          ),
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            label: '提交材料',
            variant: AppButtonVariant.secondary,
            isFullWidth: true,
            onPressed: _openEvidence,
          ),
          const SizedBox(height: AppSpacing.lg),
          const AxisInfoBanner(
            text: '事项归属人员的责任链；有权限时可编辑事项名称、截止日期与负责人。',
          ),
        ],
      ),
    );
  }
}

class _PersonTabs extends StatefulWidget {
  const _PersonTabs({
    required this.person,
    required this.onOpenProgress,
    required this.onMatterChanged,
    this.projectId,
  });

  final AxisPersonNode person;

  /// 详情页解析出的项目 ID；材料提交链接必须带上，不能落回全局选中项目。
  final int? projectId;
  final Future<void> Function() onOpenProgress;
  final Future<void> Function() onMatterChanged;

  @override
  State<_PersonTabs> createState() => _PersonTabsState();
}

class _PersonTabsState extends State<_PersonTabs> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        AppSegmentedControl<int>(
          segments: const {0: '责任事项', 1: '材料', 2: '进度'},
          selectedValue: _index,
          onValueChanged: (value) => setState(() => _index = value),
        ),
        const SizedBox(height: AppSpacing.sm),
        if (_index == 0)
          AxisCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                if (widget.person.workItems.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(AppSpacing.lg),
                    child: Text('暂无挂载的责任事项'),
                  )
                else
                  ...widget.person.workItems.map(
                    (item) => ListTile(
                      title: Text(item.title),
                      subtitle: Text(
                        '${item.statusLabel} · ${item.percent}%',
                      ),
                      trailing: const Icon(Icons.chevron_right, size: 18),
                      onTap: () {
                        final projectId = widget.projectId;
                        context
                            .push(
                              '/axis/node/${item.id}'
                              '${projectId == null ? '' : '?projectId=$projectId'}',
                            )
                            .then((_) => widget.onMatterChanged());
                      },
                    ),
                  ),
              ],
            ),
          )
        else if (_index == 1)
          AxisCard(
            child: Column(
              children: [
                const Icon(Icons.folder_outlined,
                    size: 30, color: AppColors.primary),
                const SizedBox(height: AppSpacing.sm),
                const Text(
                  '材料由「材料提交」模块统一管理',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: AppSpacing.md),
                AppButton(
                  label: '提交新证据材料',
                  size: AppButtonSize.sm,
                  onPressed: () {
                    final projectId = widget.projectId;
                    context.push(
                      '/evidence/submit?nodeId=${widget.person.id}'
                      '${projectId == null ? '' : '&projectId=$projectId'}',
                    );
                  },
                ),
              ],
            ),
          )
        else
          AxisCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '综合进展',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: AppSpacing.sm),
                Builder(
                  builder: (context) {
                    final isDark = isDarkMode(context);
                    final items = widget.person.workItems;
                    final avg = items.isEmpty
                        ? 0
                        : (items.map((e) => e.percent).reduce((a, b) => a + b) /
                                items.length)
                            .round();
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        LinearProgressIndicator(value: avg / 100),
                        const SizedBox(height: AppSpacing.xs),
                        Text(
                          '$avg% · ${items.length} 项责任事项',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.textSecondaryOf(isDark),
                          ),
                        ),
                      ],
                    );
                  },
                ),
                const SizedBox(height: AppSpacing.md),
                AppButton(
                  label: '查看进度与记录',
                  size: AppButtonSize.sm,
                  onPressed: () => widget.onOpenProgress(),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
