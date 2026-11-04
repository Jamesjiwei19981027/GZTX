import 'package:flutter/material.dart';

import '../../../design/design.dart';
import '../data/axis_api.dart';
import '../data/axis_models.dart';
import '../data/axis_rules.dart';
import '../data/axis_tree_mapper.dart';
import 'axis_common.dart';

/// 新增 / 编辑人员职责表单（对应网页 `EditPersonForm`，axis-edit-responsibility）。
class AxisPersonForm extends StatefulWidget {
  const AxisPersonForm({
    super.key,
    required this.api,
    required this.projectId,
    required this.allNodes,
    required this.members,
    this.node,
    this.suggestedParentId,
    this.suggestedUserId,
    this.canChangeSupervisor = true,
    this.canManageAssignees = true,
    this.onSaved,
    this.onCancel,
    this.onDirty,
  });

  final AxisApi api;
  final int projectId;
  final List<AxisPersonNode> allNodes;
  final List<AxisMember> members;
  final AxisPersonNode? node;
  final int? suggestedParentId;

  /// 新增时预选的关联成员（例如首次添加终责人时预填项目负责人）。
  final int? suggestedUserId;
  final bool canChangeSupervisor;
  final bool canManageAssignees;
  final Future<void> Function()? onSaved;
  final VoidCallback? onCancel;
  final VoidCallback? onDirty;

  @override
  State<AxisPersonForm> createState() => _AxisPersonFormState();
}

class _AxisPersonFormState extends State<AxisPersonForm> {
  late final TextEditingController _name;
  late final TextEditingController _role;
  late final TextEditingController _department;

  int? _selectedUserId;
  int? _parentId;
  bool _submitting = false;
  String? _error;

  bool get isEdit => widget.node != null;

  @override
  void initState() {
    super.initState();
    final node = widget.node;
    _name = TextEditingController(text: node?.name ?? '');
    _role = TextEditingController(text: node?.roleTitle ?? '');
    _department = TextEditingController(text: node?.department ?? '');
    _selectedUserId = node?.primaryAssignee?.userId ??
        (node?.ownerUserIds.isNotEmpty == true
            ? node!.ownerUserIds.first
            : null);
    _parentId = isEdit ? node!.parentId : widget.suggestedParentId;
    if (!isEdit && _selectedUserId == null && widget.suggestedUserId != null) {
      for (final member in widget.members) {
        if (member.userId == widget.suggestedUserId) {
          _selectedUserId = member.userId;
          if (_name.text.trim().isEmpty) _name.text = member.displayName;
          break;
        }
      }
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _role.dispose();
    _department.dispose();
    super.dispose();
  }

  List<AxisMember> get _memberChoices {
    final parentOwnerIds = <int>[];
    for (final node in widget.allNodes) {
      if (node.id == _parentId) parentOwnerIds.addAll(node.ownerUserIds);
    }
    return widget.members
        .where((member) => !parentOwnerIds.contains(member.userId))
        .toList();
  }

  List<AxisPersonNode> get _supervisorChoices {
    return AxisRules.supervisorCandidates(
      current: widget.node,
      nodes: widget.allNodes,
    ).where((candidate) {
      if (_selectedUserId != null &&
          candidate.ownerUserIds.contains(_selectedUserId)) {
        return false;
      }
      return true;
    }).toList();
  }

  Future<void> _pickMember() async {
    final member = await showAxisPickerSheet<AxisMember>(
      context: context,
      title: '关联项目成员',
      items: _memberChoices,
      selected: _firstWhere<AxisMember>(
        _memberChoices,
        (item) => item.userId == _selectedUserId,
      ),
      labelOf: (item) => '${item.displayName} (${item.username})',
      emptyLabel: '项目暂无其他成员',
    );
    if (member == null) return;
    setState(() {
      _selectedUserId = member.userId;
      if (_name.text.trim().isEmpty) _name.text = member.displayName;
    });
    widget.onDirty?.call();
  }

  Future<void> _pickSupervisor() async {
    if (!widget.canChangeSupervisor) return;
    final choice = await showAppBottomSheet<_SupervisorChoice>(
      context: context,
      title: '直属上级',
      builder: (ctx) {
        final items = <_SupervisorChoice>[
          const _SupervisorChoice(null, '无（设为顶层负责人）'),
          ..._supervisorChoices.map(
            (node) => _SupervisorChoice(
              node.id,
              '${node.name}（${node.roleTitle.isEmpty ? '无岗位' : node.roleTitle}）',
            ),
          ),
        ];
        return SafeArea(
          top: false,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 420),
            child: ListView(
              shrinkWrap: true,
              children: [
                for (final item in items)
                  ListTile(
                    title: Text(item.label),
                    trailing: item.id == _parentId
                        ? const Icon(Icons.check, color: AppColors.primary)
                        : null,
                    onTap: () => Navigator.of(ctx).pop(item),
                  ),
              ],
            ),
          ),
        );
      },
    );
    if (choice == null) return;
    setState(() => _parentId = choice.id);
    widget.onDirty?.call();
  }

  Future<void> _submit() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _error = '请输入人员姓名');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });

    final metadata = <String, String>{
      'name': name,
      'roleTitle': _role.text.trim(),
      'department': _department.text.trim(),
    };
    final description =
        withAxisPersonMetadata(widget.node?.description, metadata);

    try {
      if (!isEdit) {
        await widget.api.createPerson(
          projectId: widget.projectId,
          name: name,
          roleTitle: _role.text.trim(),
          department: _department.text.trim(),
          description: description,
          parentId: _parentId,
          nodeOrigin: _parentId == null ? 'project' : 'subordinate',
          assigneeUserId: _selectedUserId,
        );
      } else {
        final node = widget.node!;
        final assignees =
            widget.canManageAssignees ? _assigneesForSave(node) : null;
        await widget.api.updateNode(
          node.id,
          title: name,
          description: description,
          assignees: assignees,
        );
        if (widget.canChangeSupervisor && _parentId != node.parentId) {
          await widget.api.moveNode(node.id, newParentId: _parentId);
        }
      }
      if (!mounted) return;
      await widget.onSaved?.call();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = axisErrorMessage(e);
        _submitting = false;
      });
      return;
    }
    if (mounted) setState(() => _submitting = false);
  }

  /// 组装保存用的指派列表。
  ///
  /// 后端 PATCH 只要带 `assignees` 就整份替换（`TreeService.set_assignees`
  /// 先删后插），所以必须把原有指派连同角色一起回传：只改姓名/岗位时原样保留，
  /// 只有改选主负责人时才替换主负责人那一条，协作者和观察者不动
  /// （包括新主负责人原有的协作者/观察者指派：后端允许同一人兼多个角色）。
  List<Map<String, dynamic>> _assigneesForSave(AxisPersonNode node) {
    final primary = node.primaryAssignee;
    final selected = _selectedUserId;
    if (selected == null) return const [];
    if (primary != null && primary.userId == selected) {
      return node.assignees.map((assignee) => assignee.toJson()).toList();
    }
    return [
      {'user_id': selected, 'role_key': 'primary'},
      for (final assignee in node.assignees)
        if (assignee.roleKey != 'primary') assignee.toJson(),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final primary = _firstWhere<AxisMember>(
      _memberChoices,
      (item) => item.userId == _selectedUserId,
    );
    final parentName = () {
      for (final node in widget.allNodes) {
        if (node.id == _parentId) return node.name;
      }
      return '无（设为顶层负责人）';
    }();

    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        if (_error != null) ...[
          AxisErrorBanner(message: _error!),
          const SizedBox(height: AppSpacing.md),
        ],
        const _FieldLabel('关联项目成员'),
        _SelectTile(
          key: const Key('axis-form-member'),
          text: primary == null
              ? '-- 选择项目成员（可选）--'
              : '${primary.displayName} (${primary.username})',
          enabled: widget.canManageAssignees,
          onTap: _pickMember,
        ),
        const SizedBox(height: AppSpacing.lg),
        AppTextField(
          key: const Key('axis-form-name'),
          controller: _name,
          label: '姓名',
          placeholder: '例如：林悦',
          onChanged: (_) => widget.onDirty?.call(),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppTextField(
          key: const Key('axis-form-role'),
          controller: _role,
          label: '岗位',
          placeholder: '例如：产品设计',
          onChanged: (_) => widget.onDirty?.call(),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppTextField(
          key: const Key('axis-form-department'),
          controller: _department,
          label: '部门',
          placeholder: '例如：产品部',
          onChanged: (_) => widget.onDirty?.call(),
        ),
        const SizedBox(height: AppSpacing.lg),
        const _FieldLabel('直属上级'),
        if (!widget.canChangeSupervisor)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: Text(
              '直属上级由主管项目的项目经理设置。',
              style: TextStyle(
                fontSize: 12,
                color: isDark
                    ? AppColors.darkTextTertiary
                    : AppColors.textTertiary,
              ),
            ),
          ),
        _SelectTile(
          key: const Key('axis-form-supervisor'),
          text: parentName,
          enabled: widget.canChangeSupervisor,
          onTap: _pickSupervisor,
        ),
        const SizedBox(height: AppSpacing.lg),
        const AxisInfoBanner(
          text: '新增人员会建立人轴关系，并同步其项目内汇报智能体绑定。人员最多四层。',
        ),
        const SizedBox(height: AppSpacing.xl),
        AppButton(
          label: '保存人员',
          isFullWidth: true,
          isLoading: _submitting,
          onPressed: _submitting ? null : _submit,
        ),
        if (widget.onCancel != null) ...[
          const SizedBox(height: AppSpacing.md),
          AppButton(
            label: '取消',
            variant: AppButtonVariant.secondary,
            isFullWidth: true,
            onPressed: _submitting ? null : widget.onCancel,
          ),
        ],
      ],
    );
  }
}

T? _firstWhere<T>(Iterable<T> items, bool Function(T item) test) {
  for (final item in items) {
    if (test(item)) return item;
  }
  return null;
}

class _SupervisorChoice {
  const _SupervisorChoice(this.id, this.label);

  final int? id;
  final String label;
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: isDarkMode(context)
              ? AppColors.darkTextSecondary
              : AppColors.textSecondary,
        ),
      ),
    );
  }
}

class _SelectTile extends StatelessWidget {
  const _SelectTile({
    super.key,
    required this.text,
    required this.onTap,
    this.enabled = true,
  });

  final String text;
  final VoidCallback onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return InkWell(
      onTap: enabled ? onTap : null,
      borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
      child: Container(
        constraints: const BoxConstraints(minHeight: 46),
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
        decoration: BoxDecoration(
          color: enabled
              ? (isDark ? AppColors.darkSurface : AppColors.surface)
              : (isDark
                  ? AppColors.darkSurfaceVariant
                  : AppColors.surfaceVariant),
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.border,
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                text,
                style: TextStyle(
                  fontSize: 14,
                  color: enabled
                      ? (isDark
                          ? AppColors.darkTextPrimary
                          : AppColors.textPrimary)
                      : (isDark
                          ? AppColors.darkTextTertiary
                          : AppColors.textTertiary),
                ),
              ),
            ),
            Icon(
              Icons.keyboard_arrow_down,
              size: 18,
              color:
                  isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
            ),
          ],
        ),
      ),
    );
  }
}
