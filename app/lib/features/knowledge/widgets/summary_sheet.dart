import 'package:flutter/material.dart';

import '../../../design/design.dart';
import '../../../core/time/time_utils.dart';
import '../models/knowledge_models.dart';

/// “确认 AI 总结”浮层：可编辑标题、正文、标签，确认后才沉淀进个人知识
class SummarySheet extends StatefulWidget {
  const SummarySheet({
    super.key,
    required this.summary,
    required this.onSave,
    this.canSummarize = true,
  });

  final ProjectKnowledgeSummary summary;
  final Future<bool> Function(String title, String body, List<String> tags)
      onSave;
  final bool canSummarize;

  @override
  State<SummarySheet> createState() => _SummarySheetState();
}

class _SummarySheetState extends State<SummarySheet> {
  late final TextEditingController _title;
  late final TextEditingController _body;
  late final TextEditingController _tags;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _title = TextEditingController(text: widget.summary.title);
    _body = TextEditingController(text: widget.summary.bodyText);
    _tags = TextEditingController();
    _title.addListener(_refresh);
  }

  @override
  void dispose() {
    _title.removeListener(_refresh);
    _title.dispose();
    _body.dispose();
    _tags.dispose();
    super.dispose();
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final ok = await widget.onSave(
      _title.text,
      _body.text,
      parseKnowledgeTags(_tags.text),
    );
    if (!mounted) return;
    setState(() => _saving = false);
    if (ok) {
      Navigator.of(context).pop(true);
    } else {
      setState(() => _error = '存入失败，内容仍保留，可以修改后重试');
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final maxHeight = MediaQuery.sizeOf(context).height * 0.88;
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
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '总结草稿',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                        color: isDark
                            ? AppColors.darkTextPrimary
                            : AppColors.textPrimary,
                      ),
                    ),
                  ),
                  Text(
                    widget.summary.isSaved ? '已保存' : '仅自己可见',
                    style: TextStyle(
                      fontSize: 12,
                      color: isDark
                          ? AppColors.darkTextTertiary
                          : AppColors.textTertiary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                '可以直接保存，也可以补充自己的想法。',
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
              AppTextField(
                controller: _title,
                label: '总结标题',
                enabled: !_saving,
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _body,
                label: '总结正文',
                minLines: 5,
                maxLines: 12,
                enabled: !_saving,
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _tags,
                label: '总结标签',
                placeholder: '例如：验收，交付',
                enabled: !_saving,
              ),
              if (widget.summary.sources.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.lg),
                Text(
                  '原始依据',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: isDark
                        ? AppColors.darkTextPrimary
                        : AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                for (final source in widget.summary.sources)
                  Container(
                    margin: const EdgeInsets.only(bottom: AppSpacing.sm),
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
                          source.title,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: isDark
                                ? AppColors.darkTextPrimary
                                : AppColors.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          source.quote,
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
              if (widget.summary.status == 'saved')
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: Text(
                    '已存入我的知识',
                    style: TextStyle(
                      fontSize: 12,
                      color: isDark
                          ? AppColors.darkTextTertiary
                          : AppColors.textTertiary,
                    ),
                  ),
                ),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                label: '确认存入我的知识',
                isFullWidth: true,
                isLoading: _saving,
                onPressed: _saving || !widget.canSummarize || _title.text.trim().isEmpty
                    ? null
                    : _save,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 共享知识页详情浮层：正文 + 原始引用
class PageDetailSheet extends StatelessWidget {
  const PageDetailSheet({super.key, required this.page});

  final ProjectKnowledgePage page;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final maxHeight = MediaQuery.sizeOf(context).height * 0.85;
    final updated = formatDisplayDateTime(parseApiDateTime(page.updatedAt));
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxHeight),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          0,
          AppSpacing.lg,
          AppSpacing.lg,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              page.title,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w600,
                color:
                    isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              updated.isEmpty
                  ? page.sourceLabel
                  : '${page.sourceLabel} · 更新于 $updated',
              style: TextStyle(
                fontSize: 12,
                color: isDark
                    ? AppColors.darkTextTertiary
                    : AppColors.textTertiary,
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              page.bodyText.isEmpty ? '暂无正文' : page.bodyText,
              style: TextStyle(
                fontSize: 14,
                height: 1.5,
                color: isDark
                    ? AppColors.darkTextSecondary
                    : AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              '原始依据',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color:
                    isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            if (page.facts.isEmpty)
              Text(
                '暂无额外引用。',
                style: TextStyle(
                  fontSize: 12,
                  color: isDark
                      ? AppColors.darkTextTertiary
                      : AppColors.textTertiary,
                ),
              ),
            for (final fact in page.facts)
              Container(
                margin: const EdgeInsets.only(bottom: AppSpacing.sm),
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
                    if (fact.text.isNotEmpty)
                      Text(
                        fact.text,
                        style: TextStyle(
                          fontSize: 13,
                          color: isDark
                              ? AppColors.darkTextPrimary
                              : AppColors.textPrimary,
                        ),
                      ),
                    if (fact.quote.isNotEmpty)
                      Text(
                        '“${fact.quote}”',
                        style: TextStyle(
                          fontSize: 12,
                          height: 1.4,
                          color: isDark
                              ? AppColors.darkTextSecondary
                              : AppColors.textSecondary,
                        ),
                      ),
                    if (fact.sourceName.isNotEmpty ||
                        fact.packageId != null ||
                        fact.lineLabel.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          [
                            fact.sourceName.isEmpty ? '来源材料' : fact.sourceName,
                            if (fact.packageId != null) '材料 #${fact.packageId}',
                            if (fact.lineLabel.isNotEmpty) fact.lineLabel,
                          ].join(' · '),
                          style: TextStyle(
                            fontSize: 11,
                            color: isDark
                                ? AppColors.darkTextTertiary
                                : AppColors.textTertiary,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
