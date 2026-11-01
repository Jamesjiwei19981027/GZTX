/// 成员职责名片（`me-member-detail`）
///
/// 网页真源：`frontend/src/mobile/features/projects/MobileTeamScreens.tsx`
/// 中的 `MobileMemberDetailScreen`（52）。网页用 `listTasks` 全量拉取后再按
/// `project_id` 过滤；原生版直接调用 `GET /projects/{id}/tasks`，项目隔离更准确。
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:worktodo_app/core/auth/auth_provider.dart';
import 'package:worktodo_app/core/time/time_utils.dart';
import 'package:worktodo_app/design/design.dart';

import '../data/projects_repository.dart';
import '../models/project_models.dart';
import '../widgets/project_error_view.dart';
import '../widgets/project_widgets.dart';

class MemberDetailScreen extends StatefulWidget {
  const MemberDetailScreen({
    super.key,
    required this.projectId,
    required this.userId,
  });

  final int projectId;
  final int userId;

  @override
  State<MemberDetailScreen> createState() => _MemberDetailScreenState();
}

class _MemberDetailScreenState extends State<MemberDetailScreen> {
  bool _loading = true;
  Object? _error;
  Object? _tasksError;
  ProjectMember? _member;
  List<ProjectTask> _tasks = const [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  ProjectsRepository get _repo =>
      ProjectsRepository(context.authStateRead.api);

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _tasksError = null;
    });
    try {
      final members = await _repo.fetchMembers(widget.projectId);
      ProjectMember? member;
      for (final item in members) {
        if (item.userId == widget.userId) {
          member = item;
          break;
        }
      }
      if (!mounted) return;
      if (member == null) {
        setState(() {
          _loading = false;
          _member = null;
          _error = null;
        });
        return;
      }
      setState(() {
        _member = member;
        _loading = false;
      });
      try {
        final tasks = await _repo.fetchProjectTasks(widget.projectId);
        if (!mounted) return;
        setState(() {
          _tasks = tasks
              .where((task) => task.isAssignedTo(widget.userId))
              .toList(growable: false);
        });
      } catch (error) {
        if (!mounted) return;
        setState(() => _tasksError = error);
      }
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: '成员职责名片',
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
              '正在加载成员职责…',
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

    final member = _member;
    if (member == null) {
      return AppEmptyState(
        title: '成员不存在',
        description: '该成员可能已退出本项目，请返回成员列表刷新。',
        icon: const AppIcon('user', size: 44, color: AppColors.textTertiary),
        actionLabel: '返回成员列表',
        onAction: () => Navigator.of(context).maybePop(),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.lg,
        AppSpacing.lg,
        AppSpacing.xxxl,
      ),
      children: [
        SectionCard(
          child: Column(
            children: [
              MemberAvatar(member: member, size: 64),
              const SizedBox(height: AppSpacing.md),
              Text(
                member.name,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: AppSpacing.xxs),
              Text(
                member.username != null
                    ? '@${member.username}'
                    : '用户ID: ${member.userId}',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              ProjectChip(
                label: member.isManager ? '项目负责人' : '项目成员',
                tone: member.isManager
                    ? ProjectChipTone.primary
                    : ProjectChipTone.neutral,
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        const InfoBanner(
          message: '该成员在人轴中的权限、责任节点及汇报内容均受服务端安全策略约束。',
          tone: InfoBannerTone.info,
          icon: 'info',
        ),
        const SizedBox(height: AppSpacing.md),
        AppListSection(
          header: '当前项目负责事项 (${_tasks.length})',
          children: [
            if (_tasksError != null)
              AppListTile(
                title: '事项加载失败',
                subtitle: '${projectErrorMessage(_tasksError!)}，点击重试',
                showChevron: false,
                onTap: _load,
              )
            else if (_tasks.isEmpty)
              const AppListTile(
                title: '当前项目尚未分派任务',
                subtitle: '该成员目前没有负责的事项',
                showChevron: false,
              )
            else
              for (final task in _tasks)
                AppListTile(
                  leading: Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: task.isDone
                          ? AppColors.success
                          : task.status == ProjectTask.statusInProgress
                              ? AppColors.primary
                              : AppColors.textTertiary,
                      shape: BoxShape.circle,
                    ),
                  ),
                  title: task.title,
                  subtitle: apiDateToLocalKey(task.dueDate).isEmpty
                      ? '无截止日'
                      : '截止: ${apiDateToLocalKey(task.dueDate)}',
                  showChevron: false,
                  onTap: () => context.push('/work/task/${task.id}'),
                ),
          ],
        ),
      ],
    );
  }
}
