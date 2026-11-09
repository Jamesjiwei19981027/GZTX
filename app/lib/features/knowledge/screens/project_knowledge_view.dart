import 'package:flutter/material.dart';

import '../../../design/design.dart';
import '../controllers/project_knowledge_controller.dart';
import '../models/knowledge_models.dart';
import '../widgets/knowledge_button_text_scale.dart';
import '../widgets/knowledge_graph.dart';
import '../widgets/knowledge_state_container.dart';
import '../widgets/summary_sheet.dart';

/// 项目知识空间（“项目知识”）：读取团队共享资料、授权管理、
/// 请 AI 总结并沉淀到自己的知识库。
class ProjectKnowledgeView extends StatefulWidget {
  const ProjectKnowledgeView({
    super.key,
    required this.controller,
    required this.onSavedToPersonal,
  });

  final ProjectKnowledgeController controller;

  /// 存入个人知识后回调：切回“我的知识”并重新读取
  final VoidCallback onSavedToPersonal;

  @override
  State<ProjectKnowledgeView> createState() => _ProjectKnowledgeViewState();
}

class _ProjectKnowledgeViewState extends State<ProjectKnowledgeView> {
  ProjectKnowledgeController get controller => widget.controller;
  bool _graphVisible = false;

  Future<void> _generate() async {
    final draft = await controller.generateSummary();
    if (!mounted) return;
    if (draft == null) {
      if (controller.error != null) {
        showAppToast(context, controller.error!, type: ToastType.error);
      }
      return;
    }
    await _openSummary(draft);
  }

  Future<void> _openSummary(ProjectKnowledgeSummary draft) async {
    await showAppBottomSheet<void>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      builder: (_) => SummarySheet(
        summary: draft,
        canSummarize: controller.canSummarize,
        onSave: (title, body, tags) => controller.saveSummary(
          title: title,
          bodyText: body,
          tags: tags,
        ),
      ),
    );
    if (!mounted) return;
    if (controller.summary?.isSaved == true && controller.error == null) {
      showAppToast(context, controller.notice ?? '已存入我的知识',
          type: ToastType.success);
      widget.onSavedToPersonal();
    }
  }

  Future<void> _openPage(ProjectKnowledgePage page) async {
    await showAppBottomSheet<void>(
      context: context,
      isDismissible: true,
      builder: (_) => PageDetailSheet(page: page),
    );
  }

  Future<void> _openGrants() async {
    await showAppBottomSheet<void>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      builder: (ctx) => ListenableBuilder(
        listenable: controller,
        builder: (context, _) => _GrantSheet(controller: controller),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        if (controller.isLoading) {
          return const Center(child: AppLoading());
        }
        if (controller.error != null && controller.pages.isEmpty) {
          return KnowledgeStateContainer(
            child: AppErrorState(
              title: controller.networkError ? '网络连接异常' : '项目知识读取失败',
              message: controller.error!,
              onRetry: controller.load,
              isForbidden: controller.forbidden,
            ),
          );
        }
        return RefreshIndicator(
          onRefresh: controller.load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.md,
              AppSpacing.lg,
              AppSpacing.xxl,
            ),
            children: [
              Text(
                '查看团队积累，让 AI 帮你提炼成自己的知识',
                style: TextStyle(
                  fontSize: 12,
                  color: isDarkMode(context)
                      ? AppColors.darkTextSecondary
                      : AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              if (controller.error != null) _errorBanner(context),
              _summaryCard(context),
              if (controller.canManageGrants) ...[
                const SizedBox(height: AppSpacing.md),
                KnowledgeButtonTextScale(
                  child: AppButton(
                    label: '管理总结授权',
                    variant: AppButtonVariant.secondary,
                    isFullWidth: true,
                    icon: const AppIcon('team', size: 18),
                    onPressed: controller.isPending ? null : _openGrants,
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.lg),
              _pagesSection(context),
              const SizedBox(height: AppSpacing.lg),
              _graphSection(context),
            ],
          ),
        );
      },
    );
  }

  Widget _errorBanner(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.dangerContainerOf(isDarkMode(context)),
        borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
      ),
      child: Text(
        controller.error!,
        style: TextStyle(
            fontSize: 12,
            color: AppColors.onDangerContainerOf(isDarkMode(context))),
      ),
    );
  }

  Widget _summaryCard(BuildContext context) {
    final isDark = isDarkMode(context);
    final selected = controller.selectedPageIds.length;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.cardPadding),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : Colors.white,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            '让 AI 帮我整理',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w500,
              color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            selected == 0
                ? '默认整理全部共享资料（共 ${controller.pages.length} 份）'
                : '已选 $selected 份资料',
            style: TextStyle(
              fontSize: 12,
              color: isDark
                  ? AppColors.darkTextSecondary
                  : AppColors.textSecondary,
            ),
          ),
          if (!controller.canSummarize) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              '请联系项目经理开通 AI 总结权限',
              style: TextStyle(
                fontSize: 12,
                color: AppColors.textTertiaryOf(isDark),
              ),
            ),
          ],
          if (controller.canSummarize) ...[
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              label: '整理要求（可选）',
              placeholder: '例如：提炼验收要点',
              maxLines: 2,
              onChanged: controller.setInstruction,
              enabled: !controller.isPending,
            ),
            const SizedBox(height: AppSpacing.md),
            KnowledgeButtonTextScale(
              child: AppButton(
                label: controller.pendingLabel == '正在整理…'
                    ? 'AI 正在整理…'
                    : 'AI 总结到我的知识',
                isFullWidth: true,
                isLoading: controller.pendingLabel == '正在整理…',
                onPressed: controller.isPending || controller.pages.isEmpty
                    ? null
                    : _generate,
              ),
            ),
            if (controller.pages.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xs),
                child: Text(
                  '暂无共享资料，暂时无法总结',
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark
                        ? AppColors.darkTextTertiary
                        : AppColors.textTertiary,
                  ),
                ),
              ),
            if (controller.summary != null && !controller.summary!.isSaved)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.sm),
                child: AppButton(
                  label: '继续查看总结',
                  variant: AppButtonVariant.secondary,
                  isFullWidth: true,
                  onPressed: () => _openSummary(controller.summary!),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget _pagesSection(BuildContext context) {
    final isDark = isDarkMode(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                '团队共享资料',
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                  color: isDark
                      ? AppColors.darkTextPrimary
                      : AppColors.textPrimary,
                ),
              ),
            ),
            Text(
              '${controller.pages.length} 份',
              style: TextStyle(
                fontSize: 12,
                color: isDark
                    ? AppColors.darkTextTertiary
                    : AppColors.textTertiary,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        if (controller.pages.isEmpty)
          Container(
            padding: const EdgeInsets.all(AppSpacing.lg),
            decoration: BoxDecoration(
              color: isDark ? AppColors.darkSurface : Colors.white,
              borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '暂无共享知识',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: isDark
                        ? AppColors.darkTextPrimary
                        : AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '团队已发布的资料和笔记会显示在这里',
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark
                        ? AppColors.darkTextSecondary
                        : AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        for (final page in controller.pages)
          Container(
            margin: const EdgeInsets.only(bottom: AppSpacing.sm),
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
                border: Border(
                    bottom: BorderSide(
                        color:
                            isDark ? AppColors.darkBorder : AppColors.border))),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (controller.canSummarize)
                  Checkbox(
                    value: controller.selectedPageIds.contains(page.id),
                    onChanged: controller.isPending
                        ? null
                        : (_) => controller.togglePage(page.id),
                  ),
                Expanded(
                  child: InkWell(
                    onTap: () => _openPage(page),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            page.title,
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                              color: isDark
                                  ? AppColors.darkTextPrimary
                                  : AppColors.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            page.sourceLabel,
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.primary,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            page.bodyText.isEmpty ? '暂无正文' : page.bodyText,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 12,
                              height: 1.4,
                              color: isDark
                                  ? AppColors.darkTextSecondary
                                  : AppColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _graphSection(BuildContext context) {
    final isDark = isDarkMode(context);
    final pages = controller.pages;
    final nodeList = <KnowledgeGraphNode>[];
    final edges = <KnowledgeGraphEdge>[];
    final packageIds = <int>{};
    for (var index = 0; index < pages.length; index++) {
      final page = pages[index];
      nodeList.add(KnowledgeGraphNode(
        id: 'page:${page.id}',
        title: page.title,
        subtitle: page.sourceLabel,
        position: KnowledgePoint(200, index * 100.0),
      ));
      for (final fact in page.facts) {
        final packageId = fact.packageId;
        if (packageId == null || packageId <= 0) continue;
        packageIds.add(packageId);
        edges.add(KnowledgeGraphEdge(
          fromId: 'package:$packageId',
          toId: 'page:${page.id}',
          label: '来源引用',
        ));
      }
    }
    var packageIndex = 0;
    for (final id in packageIds) {
      nodeList.add(KnowledgeGraphNode(
        id: 'package:$id',
        title: '材料包 #$id',
        subtitle: '来源引用',
        position: KnowledgePoint(0, packageIndex * 100.0 + 40),
        tappable: false,
      ));
      packageIndex++;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        KnowledgeButtonTextScale(
          child: AppButton(
            label: _graphVisible ? '收起来源关系图' : '查看来源关系图',
            variant: AppButtonVariant.secondary,
            isFullWidth: true,
            icon: const AppIcon('axis', size: 18),
            onPressed: () => setState(() => _graphVisible = !_graphVisible),
          ),
        ),
        if (_graphVisible) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            '连线来自共享资料中的明确引用',
            style: TextStyle(
              fontSize: 12,
              color: isDark
                  ? AppColors.darkTextSecondary
                  : AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          KnowledgeGraph(
            nodes: nodeList,
            edges: edges,
            height: 320,
            hint: '点开共享知识页查看正文与原始依据',
            onTapNode: (node) {
              if (!node.id.startsWith('page:')) return;
              final id = int.tryParse(node.id.substring(5));
              if (id == null) return;
              for (final page in pages) {
                if (page.id == id) {
                  _openPage(page);
                  return;
                }
              }
            },
          ),
        ],
      ],
    );
  }
}

/// 成员总结授权浮层
class _GrantSheet extends StatelessWidget {
  const _GrantSheet({required this.controller});

  final ProjectKnowledgeController controller;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final members =
        controller.catalog?.members ?? const <ProjectKnowledgeMember>[];
    final maxHeight = MediaQuery.sizeOf(context).height * 0.75;
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxHeight),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    '管理总结授权',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                      color: isDark
                          ? AppColors.darkTextPrimary
                          : AppColors.textPrimary,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: '关闭',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: AppIcon(
                    'close',
                    size: 18,
                    color: isDark
                        ? AppColors.darkTextSecondary
                        : AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: Text(
              '授权成员使用自己的 AI 整理本项目共享知识',
              style: TextStyle(
                fontSize: 12,
                color: isDark
                    ? AppColors.darkTextSecondary
                    : AppColors.textSecondary,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              children: [
                if (members.isEmpty)
                  Text(
                    '当前没有可授权的项目成员',
                    style: TextStyle(
                      fontSize: 12,
                      color: isDark
                          ? AppColors.darkTextTertiary
                          : AppColors.textTertiary,
                    ),
                  ),
                for (final member in members)
                  Padding(
                    padding:
                        const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                member.name,
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w500,
                                  color: isDark
                                      ? AppColors.darkTextPrimary
                                      : AppColors.textPrimary,
                                ),
                              ),
                              Text(
                                member.isManager ? '项目经理 · 默认授权' : '当前项目成员',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: isDark
                                      ? AppColors.darkTextTertiary
                                      : AppColors.textTertiary,
                                ),
                              ),
                            ],
                          ),
                        ),
                        AppSwitch(
                          value: member.canSummarize,
                          onChanged: member.isManager || controller.isPending
                              ? null
                              : (value) =>
                                  controller.setGrant(member.userId, value),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
      ),
    );
  }
}
