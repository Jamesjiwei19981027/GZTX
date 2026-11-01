import 'package:flutter/material.dart';

import '../../../design/design.dart';
import '../controllers/personal_knowledge_controller.dart';
import '../data/voice_input.dart';
import '../models/knowledge_models.dart';
import '../widgets/entry_editor_sheet.dart';
import '../widgets/knowledge_graph.dart';
import '../widgets/knowledge_state_container.dart';
import '../widgets/link_editor_sheet.dart';
import '../widgets/suggestion_sheet.dart';

/// 个人知识空间（“我的知识”）：
/// 记一条、AI 整理、搜索、笔记列表与关联图。
class PersonalKnowledgeView extends StatefulWidget {
  const PersonalKnowledgeView({
    super.key,
    required this.controller,
    required this.companyId,
    this.recorder = const UnavailableVoiceRecorder(),
    this.transcriber,
  });

  final PersonalKnowledgeController controller;
  final int companyId;
  final VoiceRecorder recorder;
  final VoiceTranscriber? transcriber;

  @override
  State<PersonalKnowledgeView> createState() => _PersonalKnowledgeViewState();
}

class _PersonalKnowledgeViewState extends State<PersonalKnowledgeView> {
  PersonalKnowledgeController get controller => widget.controller;

  Future<void> _openEditor({PersonalKnowledgeEntry? entry}) async {
    await showAppBottomSheet<void>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      builder: (_) => EntryEditorSheet(
        entry: entry,
        companyId: widget.companyId,
        projectId: controller.projectId,
        recorder: widget.recorder,
        transcriber: widget.transcriber,
        onSubmit: (title, body, tags) async {
          final saved = await controller.saveEntry(
            entryId: entry?.id,
            title: title,
            bodyText: body,
            tags: tags,
          );
          if (saved != null && mounted) {
            showAppToast(context, '笔记已保存', type: ToastType.success);
          }
          return saved != null;
        },
        onDelete: entry == null
            ? null
            : () async => controller.deleteEntry(entry.id),
      ),
    );
  }

  Future<void> _organize() async {
    final suggestions = await controller.organize();
    if (!mounted) return;
    if (controller.error != null) {
      showAppToast(context, controller.error!, type: ToastType.error);
      return;
    }
    if (suggestions.isEmpty) {
      if (controller.notice != null) {
        showAppToast(context, controller.notice!);
      }
      return;
    }
    await showAppBottomSheet<void>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      builder: (_) => SuggestionSheet(
        suggestions: suggestions,
        titleOf: (id) => controller.entryTitleOf(id) ?? '已删除的笔记',
        onConfirm: controller.applySuggestions,
      ),
    );
  }

  Future<void> _openLinkEditor() async {
    await showAppBottomSheet<void>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      builder: (_) => LinkEditorSheet(
        entries: controller.entries,
        links: controller.links,
        titleOf: (id) => controller.entryTitleOf(id) ?? '已删除的笔记',
        onSave: ({
          int? linkId,
          required int sourceEntryId,
          required int targetEntryId,
          required String label,
        }) async {
          final saved = await controller.saveLink(
            linkId: linkId,
            sourceEntryId: sourceEntryId,
            targetEntryId: targetEntryId,
            label: label,
          );
          return saved != null;
        },
        onDelete: controller.deleteLink,
      ),
    );
  }

  Future<void> _openMore() async {
    await showAppActionSheet(
      context: context,
      title: '更多操作',
      actions: [
        AppActionSheetItem(
          label: '手动调整关联',
          onPressed: _openLinkEditor,
        ),
        AppActionSheetItem(
          label: '仅收集资料',
          onPressed: () async {
            final ok = await controller.collectOnly();
            if (!mounted) return;
            if (ok && controller.notice != null) {
              showAppToast(context, controller.notice!, type: ToastType.success);
            } else if (controller.error != null) {
              showAppToast(context, controller.error!, type: ToastType.error);
            }
          },
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final status = _statusText();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _scopeNote(context),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.sm,
                AppSpacing.lg,
                AppSpacing.sm,
              ),
              child: Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  AppButton(
                    label: '记一条',
                    icon: const AppIcon('plus', size: 16),
                    onPressed: controller.isPending ? null : () => _openEditor(),
                  ),
                  AppButton(
                    label: controller.organizing ? 'AI 正在整理…' : 'AI 整理',
                    variant: AppButtonVariant.secondary,
                    icon: const AppIcon('ai', size: 16),
                    onPressed:
                        controller.isPending || controller.isLoading
                            ? null
                            : _organize,
                  ),
                  AppButton(
                    label: '更多',
                    variant: AppButtonVariant.secondary,
                    size: AppButtonSize.sm,
                    onPressed: controller.isPending ? null : _openMore,
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              child: AppTextField(
                placeholder: '搜索标题、正文或标签',
                prefix: const AppIcon('search', size: 16),
                onChanged: controller.setSearch,
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.sm,
                AppSpacing.lg,
                0,
              ),
              child: AppSegmentedControl<KnowledgeViewMode>(
                segments: const {
                  KnowledgeViewMode.list: '笔记与资料',
                  KnowledgeViewMode.graph: '关联图',
                },
                selectedValue: controller.viewMode,
                onValueChanged: controller.setViewMode,
              ),
            ),
            if (status.isNotEmpty)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg,
                  AppSpacing.sm,
                  AppSpacing.lg,
                  0,
                ),
                child: Text(
                  status,
                  style: TextStyle(
                    fontSize: 12,
                    color: isDarkMode(context)
                        ? AppColors.darkTextSecondary
                        : AppColors.textSecondary,
                  ),
                ),
              ),
            if (controller.error != null && controller.entries.isNotEmpty)
              _errorBanner(context),
            Expanded(child: _body(context)),
          ],
        );
      },
    );
  }

  String _statusText() {
    if (controller.organizing) return '正在收集资料并请 AI 寻找关联…';
    if (controller.isPending) {
      return controller.pendingLabel.isEmpty ? '正在处理…' : controller.pendingLabel;
    }
    if (controller.isLoading) return '正在读取知识空间…';
    return controller.notice ?? '';
  }

  Widget _scopeNote(BuildContext context) {
    final isDark = isDarkMode(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.sm,
      ),
      color: isDark ? AppColors.darkSurfaceVariant : AppColors.primaryLight,
      child: Text(
        '仅自己可见 · AI 帮你找关联，原始资料保留',
        style: TextStyle(
          fontSize: 12,
          color: isDark ? AppColors.darkTextSecondary : AppColors.primary,
        ),
      ),
    );
  }

  Widget _errorBanner(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.sm,
        AppSpacing.lg,
        0,
      ),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: AppColors.dangerLight,
          borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
        ),
        child: Row(
          children: [
            const AppIcon('alert', size: 16, color: AppColors.danger),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                controller.error!,
                style: const TextStyle(fontSize: 12, color: AppColors.danger),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _body(BuildContext context) {
    if (controller.isLoading) {
      return const Center(child: AppLoading());
    }
    if (controller.error != null && controller.entries.isEmpty) {
      return KnowledgeStateContainer(
        child: AppErrorState(
          title: controller.networkError ? '网络连接异常' : '知识空间读取失败',
          message: controller.error!,
          onRetry: controller.load,
        ),
      );
    }
    if (controller.isEmpty) {
      return KnowledgeStateContainer(
        child: AppEmptyState(
          icon: const AppIcon(
            'knowledge',
            size: 48,
            color: AppColors.primary,
          ),
          title: '记下第一条工作积累',
          description: '点“记一条”写下想法，或让 AI 整理你已有的材料和汇报。',
          actionLabel: '记一条',
          onAction: () => _openEditor(),
        ),
      );
    }
    if (controller.isSearchEmpty) {
      return const KnowledgeStateContainer(
        child: AppEmptyState(
          title: '没有找到相关内容',
          description: '换个关键词试试。',
        ),
      );
    }
    return controller.viewMode == KnowledgeViewMode.list
        ? _list(context)
        : _graph(context);
  }

  Widget _list(BuildContext context) {
    final isDark = isDarkMode(context);
    final entries = controller.visibleEntries;
    return ListView.separated(
      padding: const EdgeInsets.all(AppSpacing.lg),
      itemCount: entries.length,
      separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
      itemBuilder: (context, index) {
        final entry = entries[index];
        return Material(
          color: isDark ? AppColors.darkSurface : Colors.white,
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          child: InkWell(
            borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
            onTap: controller.isPending ? null : () => _openEditor(entry: entry),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.cardPadding),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          entry.title,
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: isDark
                                ? AppColors.darkTextPrimary
                                : AppColors.textPrimary,
                          ),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Text(
                        entry.sourceLabel,
                        style: TextStyle(
                          fontSize: 11,
                          color: isDark
                              ? AppColors.darkTextTertiary
                              : AppColors.textTertiary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    entry.bodyText.isEmpty ? '暂无正文' : entry.bodyText,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.4,
                      color: isDark
                          ? AppColors.darkTextSecondary
                          : AppColors.textSecondary,
                    ),
                  ),
                  if (entry.tags.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.xs),
                    Wrap(
                      spacing: AppSpacing.xs,
                      runSpacing: AppSpacing.xxs,
                      children: [
                        for (final tag in entry.tags)
                          Text(
                            '#$tag',
                            style: const TextStyle(
                              fontSize: 11,
                              color: AppColors.primary,
                            ),
                          ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _graph(BuildContext context) {
    final entries = controller.visibleEntries;
    final positions = resolvePersonalPositions(entries);
    final nodes = [
      for (final entry in entries)
        KnowledgeGraphNode(
          id: '${entry.id}',
          title: entry.title,
          subtitle: entry.bodyText.isEmpty ? '点击补充正文' : entry.bodyText,
          badge: entry.tags.isEmpty ? '' : '#${entry.tags.first}',
          position: positions[entry.id] ?? const KnowledgePoint(0, 0),
        ),
    ];
    final edges = [
      for (final link in controller.visibleLinks)
        KnowledgeGraphEdge(
          fromId: '${link.sourceEntryId}',
          toId: '${link.targetEntryId}',
          label: link.label,
        ),
    ];
    return LayoutBuilder(builder: (context, constraints) {
      final height = constraints.maxHeight.isFinite
          ? (constraints.maxHeight - 32).clamp(160.0, 640.0)
          : 380.0;
      return Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: KnowledgeGraph(
          nodes: nodes,
          edges: edges,
          height: height,
          onTapNode: (node) {
          final id = int.tryParse(node.id);
          if (id == null) return;
          final entry = controller.entries.firstWhere(
            (item) => item.id == id,
            orElse: () => entries.first,
          );
            _openEditor(entry: entry);
          },
          onMoveNode: controller.isPending
              ? null
              : (node, position) {
                  final id = int.tryParse(node.id);
                  if (id == null) return;
                  controller.savePosition(id, position);
                },
        ),
      );
    });
  }
}
