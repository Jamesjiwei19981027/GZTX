import 'package:flutter/material.dart';

import '../../../core/time/time_utils.dart';
import '../../../design/design.dart';
import '../../../router/app_destination.dart';
import '../controllers/inbox_controller.dart';
import '../models/messages_models.dart';

/// 通知详情半屏：全文、归档、删除、回复。
class NotificationDetailSheet extends StatefulWidget {
  const NotificationDetailSheet({
    super.key,
    required this.controller,
    required this.notification,
    this.onTaskDraft,
    this.onOpenTarget,
  });

  final InboxController controller;
  final CollabNotification notification;
  final VoidCallback? onTaskDraft;
  final VoidCallback? onOpenTarget;

  @override
  State<NotificationDetailSheet> createState() =>
      _NotificationDetailSheetState();
}

class _NotificationDetailSheetState extends State<NotificationDetailSheet> {
  final TextEditingController _reply = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  CollabNotification get _current {
    for (final item in widget.controller.items) {
      if (item.id == widget.notification.id) return item;
    }
    return widget.notification;
  }

  Future<void> _replyNow() async {
    final text = _reply.text.trim();
    if (text.isEmpty || _submitting) return;
    setState(() => _submitting = true);
    final ok = await widget.controller.reply(_current, text);
    if (!mounted) return;
    setState(() => _submitting = false);
    if (ok) {
      _reply.clear();
      showAppToast(context, '回复已发送');
    } else if (widget.controller.actionError != null) {
      showAppToast(context, widget.controller.actionError!,
          type: ToastType.error);
      widget.controller.clearActionError();
    }
  }

  Future<void> _archive() async {
    final item = _current;
    final ok = await widget.controller.archive(item);
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop();
      showAppToast(context, item.archived ? '已移出归档' : '已归档');
    } else if (widget.controller.actionError != null) {
      showAppToast(context, widget.controller.actionError!,
          type: ToastType.error);
      widget.controller.clearActionError();
    }
  }

  Future<void> _delete() async {
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: '删除通知',
      message: '删除后这条协作通知将从收件箱移除，且无法恢复。',
      confirmLabel: '删除',
      isDestructive: true,
    );
    if (!confirmed || !mounted) return;
    final ok = await widget.controller.remove(_current);
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop();
      showAppToast(context, '通知已删除');
    } else if (widget.controller.actionError != null) {
      showAppToast(context, widget.controller.actionError!,
          type: ToastType.error);
      widget.controller.clearActionError();
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final item = _current;
        final busy = widget.controller.busy || _submitting;
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.sm,
            AppSpacing.lg,
            AppSpacing.lg,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.senderName ?? '系统通知',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          item.createdAt == null
                              ? '发送时间：近期'
                              : '发送时间：${formatDisplayDateTime(item.createdAt)}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: AppColors.textTertiary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (item.requiresReply)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.sm,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: AppColors.warningLight,
                        borderRadius:
                            BorderRadius.circular(AppSpacing.radiusSm),
                      ),
                      child: const Text(
                        '需回复',
                        style:
                            TextStyle(fontSize: 11, color: Color(0xFF7A4E00)),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              if (notificationDestination(item) != null &&
                  widget.onOpenTarget != null)
                AppButton(label: '打开对应页面', onPressed: widget.onOpenTarget),
              if (widget.onTaskDraft != null)
                AppButton(
                  label: '转为任务草稿',
                  variant: AppButtonVariant.secondary,
                  onPressed: widget.onTaskDraft,
                ),
              Container(
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                ),
                child: Text(
                  item.bodyText.trim().isEmpty ? '无详细内容' : item.bodyText,
                  style: const TextStyle(fontSize: 13, height: 1.65),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  Expanded(
                    child: AppButton(
                      label: item.archived ? '移出归档' : '归档',
                      variant: AppButtonVariant.secondary,
                      size: AppButtonSize.sm,
                      onPressed: busy ? null : _archive,
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: AppButton(
                      label: '删除',
                      variant: AppButtonVariant.danger,
                      size: AppButtonSize.sm,
                      onPressed: busy ? null : _delete,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              if (item.hasReply) ...[
                Container(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  decoration: BoxDecoration(
                    color: const Color(0xFFE9F7EF),
                    borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                    border: Border.all(color: const Color(0xFFB7E4C7)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '我的回复（${item.repliedAt == null ? '已提交' : formatDisplayDateTime(item.repliedAt)}）：',
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF1B6B45),
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        item.replyText!,
                        style: const TextStyle(fontSize: 13, height: 1.55),
                      ),
                    ],
                  ),
                ),
              ] else if (item.requiresReply) ...[
                const Text(
                  '快捷回复通知：',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: AppSpacing.sm),
                AppTextField(
                  controller: _reply,
                  placeholder: '输入你的答复意见，发送至发件人…',
                  minLines: 3,
                  maxLines: 5,
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: AppSpacing.sm),
                AppButton(
                  label: _submitting ? '正在发送…' : '发送回复',
                  size: AppButtonSize.sm,
                  isLoading: _submitting,
                  onPressed:
                      busy || _reply.text.trim().isEmpty ? null : _replyNow,
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}
