import 'package:flutter/material.dart';

import 'package:provider/provider.dart';

import '../../../core/auth/auth_provider.dart';
import '../../../core/auth/auth_state.dart';
import '../../../design/design.dart';
import '../data/axis_api.dart';
import '../data/axis_models.dart';
import '../data/axis_rules.dart';
import '../widgets/axis_common.dart';

/// 委托授权（axis-delegations）。
///
/// 说明文案、动作清单、有效期换算都与网页
/// `api/delegations.ts` 保持一致：所选本地日期当天 23:59:59 换成 UTC 提交。
class AxisDelegationsScreen extends StatefulWidget {
  const AxisDelegationsScreen({
    super.key,
    this.api,
    this.authState,
    this.companyId,
    this.projectId,
    this.currentUserId,
  });

  final AxisApi? api;
  final AuthState? authState;
  final int? companyId;
  final int? projectId;
  final int? currentUserId;

  @override
  State<AxisDelegationsScreen> createState() => _AxisDelegationsScreenState();
}

class _AxisDelegationsScreenState extends State<AxisDelegationsScreen> {
  AxisApi? _api;
  AuthState? _auth;

  bool _loading = true;
  Object? _error;
  List<AxisDelegation> _delegations = const [];
  List<AxisMember> _members = const [];
  AxisPermissions _permissions = AxisPermissions.empty;

  int _tab = 0;
  int? _granteeUserId;
  final Map<String, bool> _actions = {'progress.read': true};
  DateTime? _validTo;
  final TextEditingController _reason = TextEditingController();
  bool _submitting = false;
  String? _formError;

  int? get _companyId =>
      widget.companyId ?? _auth?.currentCompany?.id;
  int? get _projectId =>
      widget.projectId ?? _auth?.currentProject?.id;
  int? get _currentUserId =>
      widget.currentUserId ?? _auth?.currentUser?.id;

  bool get _canManage =>
      _permissions.isPm || _permissions.isSuperAdmin;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_api != null) return;
    _auth = widget.authState ?? _readAuth();
    _api = widget.api ?? AxisApi(context.read<AuthState>().api);
    _load();
  }

  AuthState? _readAuth() {
    try {
      return context.read<AuthState>();
    } catch (_) {
      return null;
    }
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final companyId = _companyId;
    final projectId = _projectId;
    if (companyId == null || projectId == null) {
      setState(() {
        _loading = false;
        _error = '缺少企业或项目上下文，请重新进入项目';
      });
      return;
    }
    try {
      final api = _api!;
      final results = await Future.wait<dynamic>([
        api.fetchDelegations(companyId: companyId, projectId: projectId),
        api.fetchMembers(projectId),
        api.fetchPermissions(projectId),
      ]);
      if (!mounted) return;
      setState(() {
        _delegations = results[0] as List<AxisDelegation>;
        _members = results[1] as List<AxisMember>;
        _permissions = results[2] as AxisPermissions;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  String _granteeName(int userId) {
    for (final member in _members) {
      if (member.userId == userId) return member.displayName;
    }
    return '用户 #$userId';
  }

  String _actionsLabel(List<String> actions) {
    return actions
        .map((key) {
          for (final action in axisDelegationActions) {
            if (action.key == key) return action.label;
          }
          return key;
        })
        .join('、');
  }

  Future<void> _pickGrantee() async {
    final member = await showAxisPickerSheet<AxisMember>(
      context: context,
      title: '被授权人',
      items: _members,
      selected: _members
          .where((item) => item.userId == _granteeUserId)
          .fold<AxisMember?>(null, (prev, item) => prev ?? item),
      labelOf: (item) => item.displayName,
      emptyLabel: '项目暂无成员',
    );
    if (member == null) return;
    setState(() => _granteeUserId = member.userId);
  }

  Future<void> _pickValidTo() async {
    final picked = await showAppDatePicker(
      context: context,
      initialDate: _validTo ?? DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 3)),
    );
    if (picked == null) return;
    setState(() => _validTo = picked);
  }

  Future<void> _submit() async {
    final companyId = _companyId;
    final projectId = _projectId;
    if (companyId == null || projectId == null) return;
    final selectedActions = _actions.entries
        .where((entry) => entry.value)
        .map((entry) => entry.key)
        .toList();
    if (_granteeUserId == null) {
      setState(() => _formError = '请选择被授权人');
      return;
    }
    if (selectedActions.isEmpty) {
      setState(() => _formError = '请至少选择一项授权动作');
      return;
    }
    setState(() {
      _submitting = true;
      _formError = null;
    });
    try {
      await _api!.createDelegation(
        companyId: companyId,
        projectId: projectId,
        granteeUserId: _granteeUserId!,
        actions: selectedActions,
        validTo: AxisRules.delegationValidTo(_validTo),
        reason: _reason.text,
      );
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _tab = 0;
        _granteeUserId = null;
        _validTo = null;
        _reason.clear();
        _actions
          ..clear()
          ..['progress.read'] = true;
      });
      showAppToast(context, '授权创建成功', type: ToastType.success);
      await _load();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _formError = axisErrorMessage(e);
      });
    }
  }

  Future<void> _revoke(AxisDelegation delegation) async {
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: '撤销委托授权',
      message: '撤销后该成员将立即失去代为操作的权限。历史已记录的操作不变。确认撤销？',
      confirmLabel: '确认撤销',
      isDestructive: true,
    );
    if (confirmed != true) return;
    try {
      await _api!.revokeDelegation(delegation.id);
      if (!mounted) return;
      showAppToast(context, '委托已成功撤销', type: ToastType.success);
      await _load();
    } catch (e) {
      if (!mounted) return;
      showAppToast(context, axisErrorMessage(e), type: ToastType.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: '委托授权',
      body: _loading
          ? const Center(child: AppLoading())
          : _error != null
              ? AppErrorState(
                  title: '无法加载委托授权',
                  message: axisErrorMessage(_error!),
                  onRetry: _load,
                )
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.lg,
                        AppSpacing.md,
                        AppSpacing.lg,
                        AppSpacing.sm,
                      ),
                      child: Text(
                        axisDelegationScopeDescription,
                        style: TextStyle(
                          fontSize: 12,
                          height: 1.5,
                          color: isDarkMode(context)
                              ? AppColors.darkTextSecondary
                              : AppColors.textSecondary,
                        ),
                      ),
                    ),
                    Padding(
                      padding:
                          const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                      child: AppSegmentedControl<int>(
                        segments: {
                          0: '我的授权',
                          if (_canManage) 1: '创建授权',
                        },
                        selectedValue: _tab,
                        onValueChanged: (value) => setState(() {
                          _tab = value;
                          _formError = null;
                        }),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Expanded(
                      child: _tab == 0 ? _buildList() : _buildCreate(),
                    ),
                  ],
                ),
    );
  }

  Widget _buildList() {
    if (_delegations.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          AxisCard(
            child: Column(
              children: [
                const Icon(Icons.lock_outline,
                    size: 34, color: AppColors.primary),
                const SizedBox(height: AppSpacing.sm),
                const Text(
                  '暂无生效的委托授权记录',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                ),
                if (_canManage) ...[
                  const SizedBox(height: AppSpacing.md),
                  AppButton(
                    label: '创建授权',
                    size: AppButtonSize.sm,
                    onPressed: () => setState(() => _tab = 1),
                  ),
                ],
              ],
            ),
          ),
        ],
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        children: [
          AxisCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (var i = 0; i < _delegations.length; i++) ...[
                  _DelegationRow(
                    delegation: _delegations[i],
                    granteeName: _granteeName(_delegations[i].granteeUserId),
                    actionsLabel: _actionsLabel(_delegations[i].actions),
                    canRevoke: _delegations[i].isActive &&
                        (_canManage ||
                            _delegations[i].grantorUserId == _currentUserId),
                    onRevoke: () => _revoke(_delegations[i]),
                  ),
                  if (i != _delegations.length - 1)
                    const Divider(height: 1, indent: AppSpacing.lg),
                ],
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          const AxisInfoBanner(
            text: '撤销立即生效；历史操作与审计记录保留。',
            isWarning: true,
          ),
        ],
      ),
    );
  }

  Widget _buildCreate() {
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        if (_formError != null) ...[
          AxisErrorBanner(message: _formError!),
          const SizedBox(height: AppSpacing.md),
        ],
        const Text('被授权人', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: AppSpacing.xs),
        InkWell(
          key: const Key('axis-delegation-grantee'),
          onTap: _pickGrantee,
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          child: AxisCard(
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    _granteeUserId == null
                        ? '请选择人员'
                        : _granteeName(_granteeUserId!),
                    style: const TextStyle(fontSize: 14),
                  ),
                ),
                const Icon(Icons.keyboard_arrow_down, size: 18),
              ],
            ),
          ),
        ),
        const AxisSectionTitle('授权范围'),
        AxisCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              for (final action in axisDelegationActions)
                SwitchListTile(
                  value: _actions[action.key] == true,
                  title: Text(
                    action.label,
                    style: const TextStyle(fontSize: 13),
                  ),
                  onChanged: (value) =>
                      setState(() => _actions[action.key] = value),
                ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        const Text('有效期至（不填为长期）',
            style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: AppSpacing.xs),
        AxisCard(
          padding: EdgeInsets.zero,
          child: ListTile(
            key: const Key('axis-delegation-valid-to'),
            title: Text(
              _validTo == null
                  ? '长期有效'
                  : AxisRules.formatDateOnly(_validTo),
            ),
            subtitle: _validTo == null
                ? null
                : const Text(
                    '所选日期当天 23:59:59 到期（本地时区）',
                    style: TextStyle(fontSize: 11),
                  ),
            trailing: _validTo == null
                ? const Icon(Icons.calendar_today_outlined, size: 18)
                : IconButton(
                    tooltip: '清除有效期',
                    onPressed: () => setState(() => _validTo = null),
                    icon: const Icon(Icons.close, size: 18),
                  ),
            onTap: _pickValidTo,
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        const Text('授权原因', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: AppSpacing.xs),
        AppTextField(
          controller: _reason,
          placeholder: '说明委托范围与交接事项…',
          maxLines: 3,
          minLines: 2,
        ),
        const SizedBox(height: AppSpacing.xl),
        AppButton(
          label: '创建授权',
          isFullWidth: true,
          isLoading: _submitting,
          onPressed: _submitting ? null : _submit,
        ),
      ],
    );
  }
}

class _DelegationRow extends StatelessWidget {
  const _DelegationRow({
    required this.delegation,
    required this.granteeName,
    required this.actionsLabel,
    required this.canRevoke,
    required this.onRevoke,
  });

  final AxisDelegation delegation;
  final String granteeName;
  final String actionsLabel;
  final bool canRevoke;
  final VoidCallback onRevoke;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '$granteeName · 代为执行',
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              AxisStatusChip(
                label: delegation.isActive ? '生效中' : '已撤销',
                color: delegation.isActive
                    ? AppColors.success
                    : AppColors.textTertiary,
              ),
            ],
          ),
          const SizedBox(height: 3),
          Text(
            '$actionsLabel · 有效至 '
            '${delegation.validTo == null ? '长期' : AxisRules.formatDateOnly(delegation.validTo)}',
            style: const TextStyle(
              fontSize: 11,
              height: 1.4,
              color: AppColors.textSecondary,
            ),
          ),
          if (delegation.reason != null &&
              delegation.reason!.trim().isNotEmpty) ...[
            const SizedBox(height: 3),
            Text(
              '原因：${delegation.reason}',
              style: const TextStyle(
                fontSize: 11,
                color: AppColors.textTertiary,
              ),
            ),
          ],
          if (canRevoke) ...[
            const SizedBox(height: AppSpacing.sm),
            Align(
              alignment: Alignment.centerRight,
              child: AppButton(
                label: '撤销',
                variant: AppButtonVariant.danger,
                size: AppButtonSize.sm,
                onPressed: onRevoke,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
