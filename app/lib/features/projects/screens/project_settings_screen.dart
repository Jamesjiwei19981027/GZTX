/// 项目设置（含归档与退出项目）
///
/// 网页真源：`MobileProjectScreens.tsx` 中的 `MobileProjectSettingsScreen`（10）。
/// 与网页版的差异：网页的「归档」只是本地提示（没有调用接口），原生版调用
/// `POST /projects/{id}/archive`；「退出项目」网页手机版缺失，原生版按任务范围补齐，
/// 调用 `POST /projects/{id}/leave`。
library;

import 'package:flutter/material.dart';
import 'package:worktodo_app/core/auth/auth_provider.dart';
import 'package:worktodo_app/design/design.dart';

import '../data/projects_repository.dart';
import '../models/project_models.dart';
import '../widgets/project_error_view.dart';
import '../widgets/project_widgets.dart';

class ProjectSettingsScreen extends StatefulWidget {
  const ProjectSettingsScreen({super.key, required this.projectId});

  final int projectId;

  @override
  State<ProjectSettingsScreen> createState() => _ProjectSettingsScreenState();
}

class _ProjectSettingsScreenState extends State<ProjectSettingsScreen> {
  bool _loading = true;
  bool _busy = false;
  Object? _error;
  String? _actionError;
  String? _message;

  ProjectDetail? _project;
  ProjectPermissions? _permissions;

  int _loadSeq = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void didUpdateWidget(ProjectSettingsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.projectId == widget.projectId) return;
    // go_router 在 /projects/11/settings → /projects/12/settings 之间会复用同一个
    // 页面状态：只靠 initState 加载，页面会继续展示 11 的详情与权限，而「归档/退出」
    // 用的却是 12 的 ID。这里清空旧数据并按新 ID 重新加载。
    setState(() {
      _project = null;
      _permissions = null;
      _loading = true;
      _error = null;
      _busy = false;
      _actionError = null;
      _message = null;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _load();
    });
  }

  ProjectsRepository get _repo =>
      ProjectsRepository(context.authStateRead.api);

  Future<void> _load() async {
    // 序号用于丢弃旧参数请求的迟到结果
    final seq = ++_loadSeq;
    final projectId = widget.projectId;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final detail = await _repo.fetchProject(projectId);
      final permissions = await _repo.fetchPermissions(projectId);
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _project = detail;
        _permissions = permissions;
        _loading = false;
      });
    } catch (error) {
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _loading = false;
        _error = error;
      });
    }
  }

  Future<void> _archive() async {
    final projectId = widget.projectId;
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: '确认归档项目？',
      message: '归档后项目所有任务、人轴与资料将转为只读历史存档，普通成员不可再提交新汇报。',
      confirmLabel: '确认归档',
      isDestructive: true,
    );
    // 确认框打开期间切了项目（如从 11 跳到 12）：这次确认属于旧项目，直接丢弃
    if (!confirmed || !mounted || projectId != widget.projectId) return;

    final seq = ++_loadSeq;
    setState(() {
      _busy = true;
      _actionError = null;
      _message = null;
    });
    final auth = context.authStateRead;
    try {
      await _repo.archiveProject(projectId);
      final detail = await _repo.fetchProject(projectId);
      await auth.refreshProjects();
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _project = detail;
        _busy = false;
        _message = '项目已归档，已转为只读历史存档';
      });
    } catch (error) {
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _busy = false;
        _actionError = projectErrorMessage(error);
      });
    }
  }

  Future<void> _leave() async {
    final projectId = widget.projectId;
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: '确认退出项目？',
      message: '退出后将失去该项目任务、人轴与资料的访问权限，需要重新受邀才能加入。',
      confirmLabel: '确认退出',
      isDestructive: true,
    );
    if (!confirmed || !mounted || projectId != widget.projectId) return;

    final seq = ++_loadSeq;
    setState(() {
      _busy = true;
      _actionError = null;
      _message = null;
    });
    final auth = context.authStateRead;
    try {
      await _repo.leaveProject(projectId);
      await auth.refreshProjects();
      if (!mounted || seq != _loadSeq) return;
      setState(() => _busy = false);
      showAppToast(context, '已退出该项目', type: ToastType.success);
      Navigator.of(context).maybePop();
    } catch (error) {
      if (!mounted || seq != _loadSeq) return;
      setState(() {
        _busy = false;
        _actionError = projectErrorMessage(error);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: '项目设置',
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
              '检查权限与加载设置…',
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

    final project = _project;
    final canArchive = _permissions?.canArchive ?? false;
    final isPm = _permissions?.isPm ?? false;

    return ListView(
      padding: const EdgeInsets.only(
        top: AppSpacing.lg,
        bottom: AppSpacing.xxxl,
      ),
      children: [
        if (_message != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: InfoBanner(
              message: _message!,
              tone: InfoBannerTone.success,
              icon: 'check-circle',
            ),
          ),
        if (_actionError != null)
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.lg,
              vertical: AppSpacing.sm,
            ),
            child: InfoBanner(
              message: _actionError!,
              tone: InfoBannerTone.danger,
              icon: 'alert',
            ),
          ),
        if (!canArchive)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: InfoBanner(
              message: '你没有归档权限。归档需要项目负责人 (PM)、企业管理员或具备管理授权的受托管理人。',
              tone: InfoBannerTone.warning,
              icon: 'warning',
            ),
          ),
        const SizedBox(height: AppSpacing.md),
        AppListSection(
          header: '项目信息',
          children: [
            AppListTile(
              title: '项目名称',
              subtitle: project?.name ?? '-',
              showChevron: false,
            ),
            AppListTile(
              title: '当前角色',
              subtitle: _permissions?.roleLabel ?? '未知',
              showChevron: false,
            ),
            const AppListTile(
              title: '数据隔离状态',
              subtitle: '独立沙箱安全隔离',
              showChevron: false,
            ),
          ],
        ),
        if (canArchive)
          AppListSection(
            header: '危险操作区',
            children: [
              AppListTile(
                leading: const AppIcon(
                  'archive',
                  size: 20,
                  color: AppColors.danger,
                ),
                title: '归档此项目',
                subtitle: '归档后项目变为只读，不再接收新的 AI 汇报与修改',
                showChevron: false,
                onTap: _busy ? null : _archive,
              ),
            ],
          ),
        if (isPm)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: InfoBanner(
              message: '你是项目负责人，需先把 PM 转让给其他成员后才能退出项目。',
              tone: InfoBannerTone.info,
              icon: 'info',
            ),
          )
        else
          AppListSection(
            header: '成员操作',
            children: [
              AppListTile(
                leading: const AppIcon(
                  'logout',
                  size: 20,
                  color: AppColors.danger,
                ),
                title: '退出项目',
                subtitle: '退出后将失去该项目的任务、人轴与资料访问权限',
                showChevron: false,
                onTap: _busy ? null : _leave,
              ),
            ],
          ),
        if (_busy)
          const Padding(
            padding: EdgeInsets.only(top: AppSpacing.lg),
            child: Center(child: AppLoading(size: 20)),
          ),
      ],
    );
  }
}
