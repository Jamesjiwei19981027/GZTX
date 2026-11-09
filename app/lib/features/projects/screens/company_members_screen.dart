import 'package:flutter/material.dart';
import 'package:worktodo_app/core/auth/auth_provider.dart';
import 'package:worktodo_app/design/design.dart';

import '../data/projects_repository.dart';
import '../models/project_management_models.dart';
import '../widgets/project_error_view.dart';
import '../widgets/project_widgets.dart';

class CompanyMembersScreen extends StatefulWidget {
  const CompanyMembersScreen({super.key, required this.companyId});
  final int companyId;

  @override
  State<CompanyMembersScreen> createState() => _CompanyMembersScreenState();
}

class _CompanyMembersScreenState extends State<CompanyMembersScreen> {
  bool _loading = true;
  bool _busy = false;
  Object? _error;
  String? _actionError;
  String? _message;
  List<CompanyMember> _members = const [];
  int _seq = 0;

  ProjectsRepository get _repo => ProjectsRepository(context.authStateRead.api);
  bool get _allowed => context.authStateRead.companies
      .any((c) => c.id == widget.companyId && c.isSuperAdmin);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void didUpdateWidget(CompanyMembersScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.companyId != widget.companyId) _load();
  }

  Future<void> _load() async {
    final seq = ++_seq;
    if (!_allowed) {
      setState(() => _loading = false);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _members = const [];
      _actionError = null;
    });
    try {
      final members = await _repo.fetchCompanyMembers(widget.companyId);
      if (!mounted || seq != _seq) return;
      setState(() {
        _members = members;
        _loading = false;
        _busy = false;
      });
    } catch (error) {
      if (!mounted || seq != _seq) return;
      setState(() {
        _error = error;
        _loading = false;
        _busy = false;
      });
    }
  }

  Future<void> _manage(CompanyMember member) async {
    if (_busy || !_allowed) return;
    final seq = _seq;
    final self = member.userId == context.authStateRead.currentUser?.id;
    final action = await showModalBottomSheet<String>(
        context: context,
        builder: (sheetContext) => SafeArea(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                ListTile(
                    title: Text(member.isOrgLeader ? '取消组织负责人' : '设为组织负责人'),
                    onTap: () => Navigator.pop(sheetContext, 'leader')),
                if (!self || !member.isSuperAdmin)
                  ListTile(
                      title: Text(member.isSuperAdmin ? '取消超级管理员' : '设为超级管理员'),
                      onTap: () => Navigator.pop(sheetContext, 'admin')),
                if (!self)
                  ListTile(
                      title:
                          Text(member.status == 'disabled' ? '启用成员' : '停用成员'),
                      onTap: () => Navigator.pop(sheetContext, 'status')),
                if (!self)
                  ListTile(
                      title: const Text('移出企业',
                          style: TextStyle(color: AppColors.danger)),
                      onTap: () => Navigator.pop(sheetContext, 'remove')),
                ListTile(
                    title: const Text('取消'),
                    onTap: () => Navigator.pop(sheetContext)),
              ]),
            ));
    if (!mounted || seq != _seq || action == null || !_allowed) return;
    if (action == 'remove' ||
        (action == 'status' && member.status != 'disabled') ||
        (action == 'admin' && !member.isSuperAdmin)) {
      final remove = action == 'remove';
      final grant = action == 'admin';
      final confirmed = await showAppConfirmDialog(
          context: context,
          title: remove
              ? '确认移出企业？'
              : grant
                  ? '确认授予超级管理员？'
                  : '确认停用成员？',
          message: remove
              ? '移出后将撤回该成员的企业与项目访问权限，历史记录仍保留。'
              : grant
                  ? '超级管理员可管理企业成员与全部项目，请确认授权对象。'
                  : '停用后将撤回该成员的项目访问权限；重新启用后可再次邀请加入项目。',
          confirmLabel: remove
              ? '确认移出'
              : grant
                  ? '确认授权'
                  : '确认停用',
          isDestructive: !grant);
      if (!mounted || seq != _seq || !confirmed || !_allowed) return;
    }
    setState(() {
      _busy = true;
      _actionError = null;
      _message = null;
    });
    try {
      if (action == 'remove') {
        await _repo.removeCompanyMember(widget.companyId, member.userId);
        if (!mounted || seq != _seq) return;
        setState(() => _members =
            _members.where((m) => m.userId != member.userId).toList());
      } else {
        final changes = switch (action) {
          'leader' => <String, dynamic>{'is_org_leader': !member.isOrgLeader},
          'admin' => <String, dynamic>{'is_super_admin': !member.isSuperAdmin},
          _ => <String, dynamic>{
              'status': member.status == 'disabled' ? 'active' : 'disabled'
            },
        };
        final updated = await _repo.updateCompanyMember(
            widget.companyId, member.userId, changes);
        if (!mounted || seq != _seq) return;
        setState(() => _members = [
              for (final m in _members)
                if (m.userId == updated.userId) updated else m
            ]);
      }
      if (!mounted || seq != _seq) return;
      setState(() {
        _busy = false;
        _message = action == 'remove' ? '成员已移出企业' : '成员设置已更新';
      });
    } catch (error) {
      if (!mounted || seq != _seq) return;
      setState(() {
        _busy = false;
        _actionError = projectErrorMessage(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    // 跟随会话权限变化；不能仅凭入口隐藏保护管理页。
    context.authState;
    return AppScaffold(
        title: '企业成员管理',
        body: !_allowed
            ? const AppErrorState(
                isForbidden: true, title: '暂无管理权限', message: '仅企业超级管理员可管理成员')
            : _loading
                ? const Center(child: AppLoading())
                : _error != null
                    ? ProjectErrorView(error: _error!, onRetry: _load)
                    : ListView(
                        padding: const EdgeInsets.all(AppSpacing.lg),
                        children: [
                            const InfoBanner(
                                message: '企业角色与状态影响全部项目。停用成员仍会保留在此列表，便于重新启用。'),
                            const SizedBox(height: AppSpacing.md),
                            if (_actionError != null)
                              InfoBanner(
                                  message: _actionError!,
                                  tone: InfoBannerTone.danger),
                            if (_message != null)
                              InfoBanner(
                                  message: _message!,
                                  tone: InfoBannerTone.success),
                            if (_members.isEmpty)
                              const AppEmptyState(title: '暂无企业成员'),
                            for (final member in _members)
                              Card(
                                  child: Padding(
                                      padding:
                                          const EdgeInsets.all(AppSpacing.md),
                                      child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(member.name,
                                                style: const TextStyle(
                                                    fontSize: 16,
                                                    fontWeight:
                                                        FontWeight.w600)),
                                            const SizedBox(
                                                height: AppSpacing.sm),
                                            Wrap(
                                                spacing: AppSpacing.sm,
                                                children: [
                                                  ProjectChip(
                                                      label: member.roleLabel),
                                                  ProjectChip(
                                                      label: member.statusLabel)
                                                ]),
                                            Align(
                                                alignment:
                                                    Alignment.centerRight,
                                                child: TextButton(
                                                    onPressed: _busy
                                                        ? null
                                                        : () => _manage(member),
                                                    child: Text(
                                                        '管理${member.name}'))),
                                          ]))),
                            if (_busy) const Center(child: AppLoading()),
                          ]));
  }
}
