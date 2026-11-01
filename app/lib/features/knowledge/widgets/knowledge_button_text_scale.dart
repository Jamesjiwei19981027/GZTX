import 'package:flutter/material.dart';

/// 限制按钮内文字放大倍数。
///
/// 底座的 `AppButton` 文案为单行布局，在 320 窄屏叠加系统 200% 字号时会被裁掉。
/// 组件内文字最多放大到 1.3 倍（正文、列表等其它内容仍按系统字号渲染），
/// 保证按钮文字完整可见、可点击；等底座支持多行文案后可移除本包装。
class KnowledgeButtonTextScale extends StatelessWidget {
  const KnowledgeButtonTextScale({
    super.key,
    required this.child,
    this.maxScale = 1.3,
  });

  final Widget child;
  final double maxScale;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final current = media.textScaler.scale(1);
    if (current <= maxScale) return child;
    return MediaQuery(
      data: media.copyWith(textScaler: TextScaler.linear(maxScale)),
      child: child,
    );
  }
}
