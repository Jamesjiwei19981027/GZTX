import 'package:flutter/material.dart';

import '../../../design/design.dart';

/// 输入框 + “发送验证码”按钮的一行布局。
///
/// 窄屏（<340）或系统字号放大（>150%）时自动改为上下两行，
/// 保证 320 宽度与 200% 字号下都不溢出、不被截断。
class CodeFieldRow extends StatelessWidget {
  const CodeFieldRow({
    super.key,
    required this.field,
    required this.button,
  });

  final Widget field;
  final Widget button;

  @override
  Widget build(BuildContext context) {
    final textScaler = MediaQuery.textScalerOf(context);
    final largeText = textScaler.scale(14) > 21;
    return LayoutBuilder(
      builder: (context, constraints) {
        if (largeText || constraints.maxWidth < 300) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              field,
              const SizedBox(height: AppSpacing.sm),
              Align(alignment: Alignment.centerRight, child: button),
            ],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(child: field),
            const SizedBox(width: AppSpacing.sm),
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: button,
            ),
          ],
        );
      },
    );
  }
}
