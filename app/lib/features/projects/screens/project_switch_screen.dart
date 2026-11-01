/// 项目切换（含“全部项目”个人总览说明）
///
/// 网页真源：`frontend/src/mobile/features/projects/MobileProjectScreens.tsx`
/// 中的 `MobileProjectSwitchScreen`（07）。
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:worktodo_app/core/auth/auth_provider.dart';
import 'package:worktodo_app/core/models/company.dart';
import 'package:worktodo_app/core/models/project.dart';
import 'package:worktodo_app/design/design.dart';

import '../widgets/project_widgets.dart';

class ProjectSwitchScreen extends StatefulWidget {
  const ProjectSwitchScreen({super.key});

  @override
  State<ProjectSwitchScreen> createState() => _ProjectSwitchScreenState();
}

class _ProjectSwitchScreenState extends State<ProjectSwitchScreen> {
  bool _refreshing = false;

  Future<void> _refresh() async {
    if (_refreshing) return;
    setState(() => _refreshing = true);
    final auth = context.authStateRead;
    final ok = await auth.refreshProjects();
    if (!mounted) return;
    setState(() => _refreshing = false);
    if (!ok && auth.errorMessage != null) {
      showAppToast(
        context,
        auth.errorMessage!,
        type: ToastType.error,
      );
    }
  }

  void _selectProject(Project project) {
    final auth = context.authStateRead;
    auth.selectProject(project);
    showAppToast(context, '已切换到「${project.name}」', type: ToastType.success);
    if (Navigator.of(context).canPop()) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.authState;
    final company = auth.currentCompany;
    final projects = auth.projects;
    final current = auth.currentProject;

    return AppScaffold(
      title: '切换工作区与项目',
      actions: [
        if (_refreshing)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: 12),
            child: Center(child: AppLoading(size: 18)),
          )
        else
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _refresh,
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 12),
              child: AppIcon('refresh', size: 20),
            ),
          ),
      ],
      body: _buildBody(context, company, projects, current),
    );
  }

  Widget _buildBody(
    BuildContext context,
    Company? company,
    List<Project> projects,
    Project? current,
  ) {
    if (company == null) {
      return AppEmptyState(
        title: '尚未加入任何公司',
        description: '创建或加入公司工作区后，才能新建协同项目。',
        icon: const AppIcon('folder', size: 44, color: AppColors.textTertiary),
        actionLabel: '创建新企业/团队公司',
        onAction: () => context.push('/projects/company/create'),
      );
    }

    if (projects.isEmpty) {
      return AppEmptyState(
        title: '当前工作区暂无项目',
        description: '新建项目后即可邀请同事一起推进任务。',
        icon: const AppIcon('folder', size: 44, color: AppColors.textTertiary),
        actionLabel: '新建项目',
        onAction: () => context.push('/projects/create'),
      );
    }

    return ListView(
      padding: const EdgeInsets.only(top: AppSpacing.md, bottom: AppSpacing.xxl),
      children: [
        const AppListSection(
          header: '全局视图',
          footer: '“全部项目”仅作为个人待办与日程汇总，不合并各项目的原始 AI 与人轴上下文。',
          children: [
            AppListTile(
              leading: AppIcon('work', size: 20, color: AppColors.primary),
              title: '全部项目',
              subtitle: '个人跨项目待办与日历总览',
              showChevron: false,
              trailing: ProjectChip(label: '工作台'),
            ),
          ],
        ),
        AppListSection(
          header: '具体协同项目',
          footer: '当前企业：${company.name}',
          children: [
            for (final project in projects)
              AppListTile(
                leading: _ProjectColorDot(color: project.color),
                title: project.name,
                subtitle: project.description ?? '项目协同工作区',
                showChevron: false,
                trailing: current?.id == project.id
                    ? const AppIcon(
                        'check',
                        size: 20,
                        color: AppColors.primary,
                      )
                    : null,
                onTap: () => _selectProject(project),
              ),
          ],
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
          child: Column(
            children: [
              AppButton(
                label: '新建项目',
                variant: AppButtonVariant.secondary,
                isFullWidth: true,
                icon: const AppIcon('plus', size: 18),
                onPressed: () => context.push('/projects/create'),
              ),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                label: '创建新企业/团队公司',
                variant: AppButtonVariant.secondary,
                size: AppButtonSize.sm,
                isFullWidth: true,
                icon: const AppIcon('folder', size: 16),
                onPressed: () => context.push('/projects/company/create'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ProjectColorDot extends StatelessWidget {
  const _ProjectColorDot({this.color});

  final String? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 12,
      height: 12,
      decoration: BoxDecoration(
        color: parseProjectColor(color),
        shape: BoxShape.circle,
      ),
    );
  }
}

/// 解析后端项目颜色（`#RRGGBB`），非法值回退品牌主色
Color parseProjectColor(String? value) {
  if (value == null) return AppColors.primary;
  var hex = value.trim().replaceFirst('#', '');
  if (hex.length == 3) {
    hex = hex.split('').map((char) => '$char$char').join();
  }
  if (hex.length != 6) return AppColors.primary;
  final parsed = int.tryParse(hex, radix: 16);
  if (parsed == null) return AppColors.primary;
  return Color(0xFF000000 | parsed);
}
