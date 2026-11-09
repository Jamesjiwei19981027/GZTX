/// 项目团队与成员（`me-team`）
///
/// 网页真源：`frontend/src/mobile/features/projects/MobileTeamScreens.tsx`
/// 中的 `MobileTeamScreen`（51）与 `frontend/src/components/views/TeamView.tsx`。
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:worktodo_app/core/auth/auth_provider.dart';
import 'package:worktodo_app/design/design.dart';

import '../data/projects_repository.dart';
import '../models/project_models.dart';
import '../widgets/project_error_view.dart';
import '../widgets/project_widgets.dart';
import 'company_members_screen.dart';

enum TeamRoleFilter { all, manager, member }

class TeamScreen extends StatefulWidget {
  const TeamScreen({super.key, required this.projectId});

  final int projectId;

  @override
  State<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends State<TeamScreen> {
  bool _loading = true;
  Object? _error;
  Object? _presenceError;
  List<ProjectMember> _members = const [];
  Map<int, String> _presence = const {};
  TeamRoleFilter _filter = TeamRoleFilter.all;
  String _search = '';

  int _loadSeq = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void didUpdateWidget(TeamScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.projectId == widget.projectId) return;
    // /projects/11/team → /projects/12/team 会复用同一页面状态，必须清掉
    // 上一个项目的成员与在线状态，否则会看到 11 的成员却进 12 的名片。
    setState(() {
      _members = const [];
      _presence = const {};
      _error = null;
      _presenceError = null;
      _loading = true;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _load();
    });
  }

  ProjectsRepository get _repo => ProjectsRepository(context.authStateRead.api);

  Future<void> _load() async {
    // 序号用于丢弃旧参数请求的迟到结果
    final seq = ++_loadSeq;
    final projectId = widget.projectId;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final members = await _repo.fetchMembers(projectId);
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _members = members;
        _loading = false;
      });
      await _loadPresence(seq);
    } catch (error) {
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _loading = false;
        _error = error;
      });
    }
  }

  /// 在线状态是辅助信息：失败时保留成员列表，并在页面上明确提示，不静默吞掉
  Future<void> _loadPresence(int seq) async {
    final companyId = context.authStateRead.currentCompany?.id;
    if (companyId == null) {
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _presence = const {};
        _presenceError = null;
      });
      return;
    }
    try {
      final presence = await _repo.fetchPresence(companyId);
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _presence = presence;
        _presenceError = null;
      });
    } catch (error) {
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _presence = const {};
        _presenceError = error;
      });
    }
  }

  /// 现任成员（`left_at` 为空）；已退出成员单列，不计入角色统计
  List<ProjectMember> get _activeMembers =>
      _members.where((member) => member.isActive).toList(growable: false);

  List<ProjectMember> get _departedMembers =>
      _members.where((member) => member.hasLeft).toList(growable: false);

  List<ProjectMember> get _filtered {
    final keyword = _search.trim().toLowerCase();
    return _activeMembers.where((member) {
      final matchSearch = keyword.isEmpty ||
          member.name.toLowerCase().contains(keyword) ||
          (member.username ?? '').toLowerCase().contains(keyword);
      final matchRole = switch (_filter) {
        TeamRoleFilter.all => true,
        TeamRoleFilter.manager => member.isManager,
        TeamRoleFilter.member => !member.isManager,
      };
      return matchSearch && matchRole;
    }).toList(growable: false);
  }

  /// 已退出成员只按关键字过滤；角色筛选针对现任成员，退出后不再参与角色统计
  List<ProjectMember> get _filteredDeparted {
    if (_filter != TeamRoleFilter.all) return const [];
    final keyword = _search.trim().toLowerCase();
    return _departedMembers
        .where((member) =>
            keyword.isEmpty ||
            member.name.toLowerCase().contains(keyword) ||
            (member.username ?? '').toLowerCase().contains(keyword))
        .toList(growable: false);
  }

  int get _managerCount =>
      _activeMembers.where((member) => member.isManager).length;

  int? get _manageableCompanyId {
    final auth = context.authStateRead;
    for (final project in auth.projects) {
      if (project.id != widget.projectId) continue;
      for (final company in auth.companies) {
        if (company.id == project.companyId && company.isSuperAdmin) {
          return company.id;
        }
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    context.authState;
    return AppScaffold(
      title: '项目团队与成员',
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppLoading(size: 26),
            SizedBox(height: AppSpacing.md),
            Text(
              '加载团队成员…',
              style: TextStyle(fontSize: 14, color: AppColors.textSecondary),
            ),
          ],
        ),
      );
    }

    if (_error != null) {
      return ProjectErrorView(
        error: _error!,
        onRetry: _load,
        onBack: () => Navigator.of(context).maybePop(),
      );
    }

    return Column(
      children: [
        if (_manageableCompanyId != null)
          AppListTile(
              title: '企业成员管理',
              subtitle: '角色、启用停用与移出企业',
              onTap: () async {
                final companyId = _manageableCompanyId;
                if (companyId == null) return;
                await Navigator.of(context).push(MaterialPageRoute<void>(
                    builder: (_) =>
                        CompanyMembersScreen(companyId: companyId)));
                if (mounted) _load();
              }),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.md,
            AppSpacing.lg,
            AppSpacing.md,
          ),
          child: Column(
            children: [
              AppTextField(
                placeholder: '搜索成员姓名或用户名…',
                prefix: const AppIcon('search', size: 18),
                onChanged: (value) => setState(() => _search = value),
              ),
              const SizedBox(height: AppSpacing.md),
              Align(
                alignment: Alignment.centerLeft,
                child: Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    _FilterChip(
                      label: '全部 (${_activeMembers.length})',
                      selected: _filter == TeamRoleFilter.all,
                      onTap: () => setState(() => _filter = TeamRoleFilter.all),
                    ),
                    _FilterChip(
                      label: '管理员 / PM ($_managerCount)',
                      selected: _filter == TeamRoleFilter.manager,
                      onTap: () =>
                          setState(() => _filter = TeamRoleFilter.manager),
                    ),
                    _FilterChip(
                      label: '业务成员 (${_activeMembers.length - _managerCount})',
                      selected: _filter == TeamRoleFilter.member,
                      onTap: () =>
                          setState(() => _filter = TeamRoleFilter.member),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (_presenceError != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              0,
              AppSpacing.lg,
              AppSpacing.md,
            ),
            child: InfoBanner(
              message:
                  '在线状态暂不可用（${projectErrorMessage(_presenceError!)}），成员列表不受影响。',
              tone: InfoBannerTone.warning,
              icon: 'wifi-off',
            ),
          ),
        Expanded(child: _buildList()),
      ],
    );
  }

  Widget _buildList() {
    if (_members.isEmpty) {
      return AppEmptyState(
        title: '项目暂无成员',
        description: '可在项目概览页点「邀请新成员加入」，把同事拉进本项目。',
        icon: const AppIcon('team', size: 44, color: AppColors.textTertiary),
        actionLabel: '去项目概览',
        onAction: () => context.pushReplacement(
          '/projects/${widget.projectId}',
        ),
      );
    }

    final filtered = _filtered;
    final departed = _filteredDeparted;
    if (filtered.isEmpty && departed.isEmpty) {
      return const AppEmptyState(
        title: '无匹配成员',
        description: '未找到符合搜索条件的成员',
        icon: AppIcon('search', size: 40, color: AppColors.textTertiary),
      );
    }

    return ListView(
      padding: const EdgeInsets.only(bottom: AppSpacing.xxxl),
      children: [
        if (filtered.isNotEmpty)
          AppListSection(
            header: '成员列表 (${filtered.length})',
            children: [
              for (final member in filtered)
                _buildMemberTile(member, isDeparted: false),
            ],
          ),
        if (filtered.isEmpty)
          const Padding(
            padding: EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.md,
              AppSpacing.lg,
              AppSpacing.md,
            ),
            child: Text(
              '项目暂无在职成员',
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
          ),
        if (departed.isNotEmpty)
          AppListSection(
            header: '已退出成员 (${departed.length})',
            children: [
              for (final member in departed)
                _buildMemberTile(member, isDeparted: true),
            ],
          ),
      ],
    );
  }

  Widget _buildMemberTile(ProjectMember member, {required bool isDeparted}) {
    final avatar = MemberAvatar(member: member, size: 40);
    return AppListTile(
      leading: isDeparted
          ? avatar
          : Stack(
              clipBehavior: Clip.none,
              children: [
                avatar,
                Positioned(
                  right: -2,
                  bottom: -2,
                  child: PresenceDot(
                    status: _presence[member.userId] ?? 'offline',
                  ),
                ),
              ],
            ),
      title: member.name,
      subtitle: member.username != null
          ? '@${member.username}'
          : '用户ID: ${member.userId}',
      showChevron: false,
      trailing: ProjectChip(
        label: isDeparted ? '已退出' : member.roleLabel,
        tone: isDeparted
            ? ProjectChipTone.neutral
            : (member.isManager
                ? ProjectChipTone.primary
                : ProjectChipTone.neutral),
      ),
      onTap: () => context.push(
        '/projects/${widget.projectId}/team/${member.userId}',
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
        decoration: BoxDecoration(
          color: selected
              ? AppColors.primary
              : (isDarkMode(context)
                  ? AppColors.darkSurfaceVariant
                  : AppColors.surfaceVariant),
          borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: selected
                ? Colors.white
                : (isDarkMode(context)
                    ? AppColors.darkTextSecondary
                    : AppColors.textSecondary),
          ),
        ),
      ),
    );
  }
}

