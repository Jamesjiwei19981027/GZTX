import 'package:flutter/material.dart';

import '../../../design/design.dart';
import '../models/knowledge_models.dart';

/// “AI 发现的关联”浮层：只展示建议，勾选确认后才写入关联图
class SuggestionSheet extends StatefulWidget {
  const SuggestionSheet({
    super.key,
    required this.suggestions,
    required this.titleOf,
    required this.onConfirm,
  });

  final List<KnowledgeSuggestion> suggestions;
  final String Function(int entryId) titleOf;
  final Future<bool> Function(List<KnowledgeSuggestion> chosen) onConfirm;

  @override
  State<SuggestionSheet> createState() => _SuggestionSheetState();
}

class _SuggestionSheetState extends State<SuggestionSheet> {
  late final Set<int> _chosen;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _chosen = {for (var index = 0; index < widget.suggestions.length; index++) index};
  }

  Future<void> _confirm() async {
    if (_submitting || _chosen.isEmpty) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    final ordered = _chosen.toList()..sort();
    final ok = await widget.onConfirm(
      ordered.map((index) => widget.suggestions[index]).toList(growable: false),
    );
    if (!mounted) return;
    setState(() => _submitting = false);
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      setState(() => _error = '加入关联失败，建议仍保留，可以重试');
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final maxHeight = MediaQuery.sizeOf(context).height * 0.8;
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxHeight),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: ListView(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
              children: [
                Text(
                  '已根据你的笔记找到这些关联，确认后加入关联图。',
                  style: TextStyle(
                    fontSize: 13,
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
                      style: const TextStyle(
                        fontSize: 13,
                        color: AppColors.danger,
                      ),
                    ),
                  ),
                const SizedBox(height: AppSpacing.sm),
                for (var index = 0;
                    index < widget.suggestions.length;
                    index++)
                  _suggestionTile(index, isDark),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(AppSpacing.lg),
            child: AppButton(
              label: '确认关联（${_chosen.length}）',
              isFullWidth: true,
              isLoading: _submitting,
              onPressed: _chosen.isEmpty || _submitting ? null : _confirm,
            ),
          ),
        ],
      ),
    );
  }

  Widget _suggestionTile(int index, bool isDark) {
    final suggestion = widget.suggestions[index];
    final source = widget.titleOf(suggestion.sourceEntryId);
    final target = widget.titleOf(suggestion.targetEntryId);
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.md),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Checkbox(
                value: _chosen.contains(index),
                onChanged: _submitting
                    ? null
                    : (value) {
                        setState(() {
                          if (value == true) {
                            _chosen.add(index);
                          } else {
                            _chosen.remove(index);
                          }
                        });
                      },
              ),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: Text(
                    '$source → $target',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: isDark
                          ? AppColors.darkTextPrimary
                          : AppColors.textPrimary,
                    ),
                  ),
                ),
              ),
            ],
          ),
          Padding(
            padding: const EdgeInsets.only(left: 40),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  suggestion.label,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppColors.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  suggestion.reason,
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark
                        ? AppColors.darkTextSecondary
                        : AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(AppSpacing.sm),
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.darkSurface : Colors.white,
                    borderRadius: BorderRadius.circular(AppSpacing.radiusSm),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '依据一：${suggestion.sourceQuote}',
                        style: TextStyle(
                          fontSize: 12,
                          color: isDark
                              ? AppColors.darkTextSecondary
                              : AppColors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '依据二：${suggestion.targetQuote}',
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
              ],
            ),
          ),
        ],
      ),
    );
  }
}
