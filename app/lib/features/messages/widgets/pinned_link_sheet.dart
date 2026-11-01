import 'package:flutter/material.dart';

import '../../../design/design.dart';

/// 新增钉选链接的半屏表单；返回 (title, url)，取消返回 null。
class PinnedLinkSheet extends StatefulWidget {
  const PinnedLinkSheet({super.key});

  @override
  State<PinnedLinkSheet> createState() => _PinnedLinkSheetState();
}

class _PinnedLinkSheetState extends State<PinnedLinkSheet> {
  final TextEditingController _title = TextEditingController();
  final TextEditingController _url = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _url.dispose();
    super.dispose();
  }

  void _submit() {
    final title = _title.text.trim();
    final url = _url.text.trim();
    if (title.isEmpty) {
      setState(() => _error = '请填写链接标题');
      return;
    }
    if (url.length < 4) {
      setState(() => _error = '请填写有效链接地址');
      return;
    }
    Navigator.of(context).pop((title: title, url: url));
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.sm,
          AppSpacing.lg,
          AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              '频道内重要文档、设计稿或代码仓库的快捷入口。',
              style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              controller: _title,
              placeholder: '链接标题',
              label: '标题',
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              controller: _url,
              placeholder: 'https://…',
              label: '链接地址',
              keyboardType: TextInputType.url,
              clearButtonEnabled: false,
            ),
            if (_error != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(
                _error!,
                style: const TextStyle(fontSize: 12, color: AppColors.danger),
              ),
            ],
            const SizedBox(height: AppSpacing.lg),
            Row(
              children: [
                Expanded(
                  child: AppButton(
                    label: '取消',
                    variant: AppButtonVariant.secondary,
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: AppButton(label: '确认钉选', onPressed: _submit),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
