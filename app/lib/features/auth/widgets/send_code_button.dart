import 'package:flutter/material.dart';

import '../../../design/design.dart';
import '../utils/countdown_controller.dart';

/// 发送验证码按钮（内置倒计时展示）。
///
/// 倒计时期间禁用并显示剩余秒数，文案对齐网页版 `${n}s 重新获取`。
class SendCodeButton extends StatelessWidget {
  const SendCodeButton({
    super.key,
    required this.controller,
    required this.onPressed,
    this.idleLabel = '获取验证码',
    this.enabled = true,
  });

  final CountdownController controller;
  final VoidCallback? onPressed;
  final String idleLabel;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final running = controller.isRunning;
        return AppButton(
          label: running ? '${controller.seconds}s 重新获取' : idleLabel,
          variant: AppButtonVariant.secondary,
          onPressed: (enabled && !running && onPressed != null)
              ? onPressed
              : null,
        );
      },
    );
  }
}
