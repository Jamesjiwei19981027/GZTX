import 'package:flutter/material.dart';

import '../../../design/design.dart';

/// 聊天底部输入栏。
///
/// - 多行长消息自动增高（最多 5 行）；
/// - iOS 下页面骨架不会自动让出键盘高度，这里按 `viewInsets` 把输入栏顶到键盘上方；
///   安卓由 Scaffold 的 `resizeToAvoidBottomInset` 负责，避免重复偏移。
class ChatInputBar extends StatelessWidget {
  const ChatInputBar({
    super.key,
    required this.controller,
    required this.sending,
    required this.uploading,
    required this.onSend,
    required this.onPickFile,
    this.onChanged,
    this.enabled = true,
  });

  final TextEditingController controller;
  final bool sending;
  final bool uploading;
  final VoidCallback onSend;
  final VoidCallback onPickFile;
  final ValueChanged<String>? onChanged;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final isIos = isCupertinoPlatform(context);
    final isDark = isDarkMode(context);
    final keyboardInset = isIos ? MediaQuery.viewInsetsOf(context).bottom : 0.0;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : Colors.white,
        border: Border(
          top: BorderSide(
            color: isDark ? AppColors.darkBorder : AppColors.border,
            width: 0.5,
          ),
        ),
      ),
      padding: EdgeInsets.only(bottom: keyboardInset),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.sm,
            AppSpacing.sm,
            AppSpacing.sm,
            AppSpacing.sm,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (uploading)
                const Padding(
                  padding: EdgeInsets.only(bottom: AppSpacing.sm),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      AppLoading(size: 14),
                      SizedBox(width: AppSpacing.sm),
                      Text(
                        '正在发送文件…',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  IconButton(
                    tooltip: '发送文件',
                    onPressed:
                        enabled && !sending && !uploading ? onPickFile : null,
                    icon: const AppIcon('paperclip', size: 21),
                  ),
                  Expanded(
                    child: AppTextField(
                      controller: controller,
                      placeholder: '输入协同消息…',
                      minLines: 1,
                      maxLines: 5,
                      textInputAction: TextInputAction.newline,
                      onChanged: onChanged,
                      enabled: enabled,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  AppButton(
                    label: '发送',
                    size: AppButtonSize.sm,
                    isLoading: sending,
                    onPressed:
                        enabled && !sending && !uploading ? onSend : null,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
