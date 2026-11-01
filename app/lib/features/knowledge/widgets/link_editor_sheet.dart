import 'package:flutter/material.dart';

import '../../../design/design.dart';
import '../models/knowledge_models.dart';

/// “调整关联”浮层：手动新增、修改说明、删除知识之间的关联。
///
/// 关联图上的主要入口是 AI 建议，这里只是给用户一个能自己改的备用入口。
class LinkEditorSheet extends StatefulWidget {
  const LinkEditorSheet({
    super.key,
    required this.entries,
    required this.links,
    required this.titleOf,
    required this.onSave,
    required this.onDelete,
  });

  final List<PersonalKnowledgeEntry> entries;
  final List<PersonalKnowledgeLink> links;
  final String Function(int entryId) titleOf;
  final Future<bool> Function({
    int? linkId,
    required int sourceEntryId,
    required int targetEntryId,
    required String label,
  }) onSave;
  final Future<bool> Function(int linkId) onDelete;

  @override
  State<LinkEditorSheet> createState() => _LinkEditorSheetState();
}

class _LinkEditorSheetState extends State<LinkEditorSheet> {
  final TextEditingController _label = TextEditingController();
  int? _editingId;
  int? _sourceId;
  int? _targetId;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _label.dispose();
    super.dispose();
  }

  void _reset() {
    _editingId = null;
    _sourceId = null;
    _targetId = null;
    _label.text = '';
  }

  Future<void> _pickEntry({required bool asSource}) async {
    final candidates = asSource
        ? widget.entries
        : widget.entries
            .where((entry) => entry.id != _sourceId)
            .toList(growable: false);
    if (candidates.isEmpty) return;
    await showAppActionSheet(
      context: context,
      title: asSource ? '选择关联起点' : '选择关联终点',
      actions: [
        for (final entry in candidates)
          AppActionSheetItem(
            label: entry.title,
            onPressed: () {
              setState(() {
                if (asSource) {
                  _sourceId = entry.id;
                  if (_targetId == entry.id) _targetId = null;
                } else {
                  _targetId = entry.id;
                }
              });
            },
          ),
      ],
    );
  }

  Future<void> _submit() async {
    final source = _sourceId;
    final target = _targetId;
    if (source == null || target == null || source == target || _submitting) {
      setState(() => _error = '请选择两条不同的知识');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    final ok = await widget.onSave(
      linkId: _editingId,
      sourceEntryId: source,
      targetEntryId: target,
      label: _label.text.trim(),
    );
    if (!mounted) return;
    setState(() {
      _submitting = false;
      if (ok) _reset();
    });
    if (!ok) setState(() => _error = '关联保存失败，请重试');
  }

  Future<void> _delete(PersonalKnowledgeLink link) async {
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: '删除这条关联？',
      message: '只删除知识之间的关系，两条笔记本身都会保留。',
      confirmLabel: '删除关联',
      isDestructive: true,
    );
    if (!confirmed || !mounted) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    final ok = await widget.onDelete(link.id);
    if (!mounted) return;
    setState(() {
      _submitting = false;
      if (ok && _editingId == link.id) _reset();
    });
    if (!ok) setState(() => _error = '删除关联失败，请重试');
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final maxHeight = MediaQuery.sizeOf(context).height * 0.82;
    final viewInsets = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: viewInsets),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            0,
            AppSpacing.lg,
            AppSpacing.lg,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '条目关联',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color:
                      isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                '连接两条知识，写下它们的关系；也可以在关联图里点开节点查看。',
                style: TextStyle(
                  fontSize: 12,
                  color: isDark
                      ? AppColors.darkTextSecondary
                      : AppColors.textSecondary,
                ),
              ),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: Text(
                    _error!,
                    style: const TextStyle(fontSize: 13, color: AppColors.danger),
                  ),
                ),
              const SizedBox(height: AppSpacing.md),
              _pickerRow(
                label: '关联起点',
                value: _sourceId == null ? '' : widget.titleOf(_sourceId!),
                enabled: !_submitting && _editingId == null,
                onTap: () => _pickEntry(asSource: true),
                isDark: isDark,
              ),
              const SizedBox(height: AppSpacing.sm),
              _pickerRow(
                label: '关联终点',
                value: _targetId == null ? '' : widget.titleOf(_targetId!),
                enabled: !_submitting && _editingId == null,
                onTap: () => _pickEntry(asSource: false),
                isDark: isDark,
              ),
              const SizedBox(height: AppSpacing.sm),
              AppTextField(
                controller: _label,
                label: '关联说明',
                placeholder: '例如：提供验收依据',
                enabled: !_submitting,
              ),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                label: _editingId == null ? '添加关联' : '保存关联',
                isFullWidth: true,
                isLoading: _submitting,
                onPressed: _submitting ? null : _submit,
              ),
              if (_editingId != null) ...[
                const SizedBox(height: AppSpacing.sm),
                AppButton(
                  label: '取消编辑关联',
                  variant: AppButtonVariant.secondary,
                  isFullWidth: true,
                  onPressed: _submitting
                      ? null
                      : () => setState(() {
                            _reset();
                            _error = null;
                          }),
                ),
              ],
              const SizedBox(height: AppSpacing.lg),
              Text(
                '已有 ${widget.links.length} 条关联',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color:
                      isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              if (widget.links.isEmpty)
                Text(
                  '还没有关联，可以让 AI 整理，或者手动添加。',
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark
                        ? AppColors.darkTextTertiary
                        : AppColors.textTertiary,
                  ),
                ),
              for (final link in widget.links)
                Container(
                  margin: const EdgeInsets.only(top: AppSpacing.sm),
                  padding: const EdgeInsets.all(AppSpacing.md),
                  decoration: BoxDecoration(
                    color: isDark
                        ? AppColors.darkSurfaceVariant
                        : AppColors.surfaceVariant,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${widget.titleOf(link.sourceEntryId)} → ${widget.titleOf(link.targetEntryId)}',
                        style: TextStyle(
                          fontSize: 13,
                          color: isDark
                              ? AppColors.darkTextPrimary
                              : AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        link.label.isEmpty ? '未填写说明' : link.label,
                        style: TextStyle(
                          fontSize: 12,
                          color: isDark
                              ? AppColors.darkTextSecondary
                              : AppColors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Wrap(
                        spacing: AppSpacing.sm,
                        children: [
                          TextButton(
                            onPressed: _submitting
                                ? null
                                : () => setState(() {
                                      _editingId = link.id;
                                      _sourceId = link.sourceEntryId;
                                      _targetId = link.targetEntryId;
                                      _label.text = link.label;
                                    }),
                            child: const Text('编辑'),
                          ),
                          TextButton(
                            onPressed:
                                _submitting ? null : () => _delete(link),
                            child: const Text(
                              '删除',
                              style: TextStyle(color: AppColors.danger),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _pickerRow({
    required String label,
    required String value,
    required bool enabled,
    required VoidCallback onTap,
    required bool isDark,
  }) {
    return InkWell(
      onTap: enabled ? onTap : null,
      borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.md,
        ),
        decoration: BoxDecoration(
          color: isDark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant,
          borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
        ),
        child: Row(
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                color: isDark
                    ? AppColors.darkTextSecondary
                    : AppColors.textSecondary,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                value.isEmpty ? '选择条目' : value,
                textAlign: TextAlign.right,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: value.isEmpty
                      ? (isDark
                          ? AppColors.darkTextTertiary
                          : AppColors.textTertiary)
                      : (isDark
                          ? AppColors.darkTextPrimary
                          : AppColors.textPrimary),
                ),
              ),
            ),
            AppIcon(
              'chevron-right',
              size: 16,
              color: isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
            ),
          ],
        ),
      ),
    );
  }
}
