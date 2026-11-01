import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../design/design.dart';
import '../controllers/chat_controller.dart';
import '../data/message_file_transfer.dart';
import '../data/messages_repository.dart';
import '../models/messages_models.dart';
import '../widgets/chat_input_bar.dart';
import '../widgets/chat_message_tile.dart';
import '../widgets/permission_notice.dart';

/// 频道 / 私聊会话页。
///
/// 对齐 `MobileChatDetailScreen`：发消息、点赞、发文件、AI 总结、会话资料与通话入口；
/// 轮询按网页版 6 秒一次，退到后台停止。
class ChatScreen extends StatefulWidget {
  const ChatScreen({
    super.key,
    required this.scopeType,
    required this.scopeId,
    required this.name,
    this.currentUserId,
    this.companyId,
    this.repository,
    this.picker,
    this.uploader,
    this.pollInterval = const Duration(seconds: 6),
  });

  /// `channel` 或 `direct`
  final String scopeType;
  final int scopeId;
  final String name;
  final int? currentUserId;
  final int? companyId;
  final MessagesRepository? repository;
  final MessageFilePicker? picker;
  final MessageFileUploader? uploader;
  final Duration pollInterval;

  bool get isChannel => scopeType == 'channel';

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> with WidgetsBindingObserver {
  final TextEditingController _text = TextEditingController();

  ChatController? _controller;
  MessagesRepository? _repository;
  ApiClient? _api;
  int? _companyId;
  int? _currentUserId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _resolve();
  }

  void _resolve() {
    var companyId = widget.companyId;
    var userId = widget.currentUserId;
    ApiClient? api;
    if (widget.repository == null) {
      final auth = context.authStateRead;
      api = auth.api;
      companyId ??= auth.currentCompany?.id;
      userId ??= auth.currentUser?.id;
    }
    if (_repository != null &&
        api == _api &&
        companyId == _companyId &&
        userId == _currentUserId) {
      return;
    }
    _api = api;
    _companyId = companyId;
    _currentUserId = userId;
    _repository = widget.repository ?? MessagesRepository(api ?? ApiClient());
    _startController();
  }

  void _startController() {
    _controller?.dispose();
    final controller = ChatController(
      repository: _repository!,
      scopeType: widget.scopeType,
      scopeId: widget.scopeId,
      currentUserId: _currentUserId,
      pollInterval: widget.pollInterval,
      picker: widget.picker ?? const UnavailableMessageFilePicker(),
      uploader: widget.uploader ??
          (_api == null ? null : ApiMessageFileUploader(api: _api!)),
    );
    _controller = controller;
    controller.load();
    controller.startPolling();
  }

  @override
  void didUpdateWidget(covariant ChatScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.scopeId != widget.scopeId ||
        oldWidget.scopeType != widget.scopeType) {
      _text.clear();
      // 同一路由换参数时必须重新拉取，不能沿用上一个会话的记录
      _startController();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (controller == null) return;
    if (state == AppLifecycleState.resumed) {
      controller.load(silent: true);
      controller.startPolling();
    } else {
      // paused / inactive / hidden / detached：停止轮询
      controller.stopPolling();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    _text.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final controller = _controller;
    if (controller == null) return;
    final text = _text.text;
    if (text.trim().isEmpty) return;
    final ok = await controller.send(text);
    if (!mounted) return;
    if (ok) {
      _text.clear();
    } else if (controller.sendError != null) {
      showAppToast(context, controller.sendError!, type: ToastType.error);
    }
  }

  Future<void> _retrySend() async {
    final controller = _controller;
    if (controller == null) return;
    final text = controller.failedText;
    final ok = await controller.retryFailedSend();
    if (!mounted || text == null) return;
    if (ok) {
      _text.clear();
      showAppToast(context, '消息已重新发送');
    } else if (controller.sendError != null) {
      showAppToast(context, controller.sendError!, type: ToastType.error);
    }
  }

  Future<void> _pickFile() async {
    final controller = _controller;
    if (controller == null) return;
    try {
      final ok = await controller.pickAndSendFile();
      if (!mounted) return;
      if (ok) {
        showAppToast(context, '文件已发送');
      } else if (controller.sendError != null) {
        showAppToast(context, controller.sendError!, type: ToastType.error);
      }
    } on MessageFilePickerException catch (error) {
      if (!mounted) return;
      showAppToast(context, error.message, type: ToastType.warning);
    }
  }

  Future<void> _summarize() async {
    final controller = _controller;
    if (controller == null) return;
    final ok = await controller.summarize();
    if (!mounted || ok) return;
    if (controller.summaryError != null) {
      showAppToast(context, controller.summaryError!, type: ToastType.error);
    }
  }

  Future<void> _openMessageActions(ChatMessage message) async {
    final controller = _controller;
    if (controller == null) return;
    await showAppBottomSheet<void>(
      context: context,
      title: '消息操作',
      builder: (sheetContext) {
        return SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.lg,
                  vertical: AppSpacing.sm,
                ),
                child: Text(
                  '“${message.body.trim().isEmpty ? '文件消息' : message.body}”',
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    height: 1.5,
                    color: AppColors.textSecondary,
                  ),
                ),
              ),
              if (widget.isChannel)
                AppListTile(
                  title: '为此消息点赞 (+1)',
                  subtitle: message.likes > 0 ? '当前 ${message.likes} 个赞' : '让同事知道这条消息有用',
                  leading: const AppIcon('thumbs-up', size: 20),
                  showChevron: false,
                  onTap: () async {
                    Navigator.of(sheetContext).pop();
                    final ok = await controller.like(message);
                    if (!mounted) return;
                    if (ok) {
                      showAppToast(context, '已点赞');
                    } else if (controller.sendError != null) {
                      showAppToast(context, controller.sendError!,
                          type: ToastType.error);
                      controller.clearSendError();
                    }
                  },
                ),
              AppListTile(
                title: '复制消息文本',
                leading: const AppIcon('copy', size: 20),
                showChevron: false,
                onTap: () async {
                  Navigator.of(sheetContext).pop();
                  await Clipboard.setData(ClipboardData(text: message.body));
                  if (!mounted) return;
                  showAppToast(context, '已复制消息文本');
                },
              ),
              const SizedBox(height: AppSpacing.md),
            ],
          ),
        );
      },
    );
  }

  Future<void> _copyAttachmentLink(ChatAttachment attachment) async {
    final repository = _repository;
    final raw = attachment.downloadUrl;
    if (repository == null || raw == null || raw.trim().isEmpty) {
      showAppToast(context, '该附件暂无下载链接', type: ToastType.warning);
      return;
    }
    final base = repository.api.baseUrl.endsWith('/')
        ? repository.api.baseUrl.substring(0, repository.api.baseUrl.length - 1)
        : repository.api.baseUrl;
    final url = raw.startsWith('http') ? raw : '$base$raw';
    await Clipboard.setData(ClipboardData(text: url));
    if (!mounted) return;
    showAppToast(context, '下载链接已复制，可在浏览器打开');
  }

  void _openProfile() {
    context.push(
      '/messages/profile/${widget.scopeId}'
      '?type=${widget.scopeType}&name=${Uri.encodeComponent(widget.name)}',
    );
  }

  void _openCall(String callType) {
    final query = <String>[
      'name=${Uri.encodeComponent(widget.name)}',
      'callType=$callType',
      if (!widget.isChannel) 'conversationId=${widget.scopeId}',
    ].join('&');
    context.push('/messages/call?$query');
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    return AppScaffold(
      title: widget.name,
      actions: [
        IconButton(
          tooltip: '语音通话',
          onPressed: controller == null ? null : () => _openCall('audio'),
          icon: const AppIcon('phone', size: 19),
        ),
        IconButton(
          tooltip: '视频通话',
          onPressed: controller == null ? null : () => _openCall('video'),
          icon: const AppIcon('video', size: 20),
        ),
        IconButton(
          tooltip: 'AI 总结聊天记录',
          onPressed: controller == null ? null : _summarize,
          icon: const AppIcon('ai', size: 20),
        ),
        IconButton(
          tooltip: '会话资料',
          onPressed: _openProfile,
          icon: const AppIcon('info', size: 20),
        ),
      ],
      body: controller == null
          ? const Center(child: AppLoading(size: 26))
          : AnimatedBuilder(
              animation: controller,
              builder: (context, _) => Column(
                children: [
                  if (controller.summaryLoading ||
                      controller.summary != null ||
                      controller.summaryError != null)
                    _summaryCard(context, controller),
                  if (controller.pollError != null)
                    _banner(
                      context,
                      message: '刷新失败：${controller.pollError}',
                      actionLabel: '重试',
                      onAction: () => controller.load(silent: true),
                    ),
                  if (controller.sendError != null)
                    _banner(
                      context,
                      message: controller.failedText != null
                          ? '发送失败：${controller.sendError}'
                          : controller.sendError!,
                      actionLabel:
                          controller.failedText != null ? '重试发送' : null,
                      onAction: controller.failedText != null
                          ? _retrySend
                          : null,
                      onDismiss: () {
                        controller.dismissFailedSend();
                        controller.clearSendError();
                      },
                    ),
                  Expanded(child: _messageArea(context, controller)),
                  ChatInputBar(
                    controller: _text,
                    sending: controller.sending,
                    uploading: controller.uploading,
                    enabled: controller.state != ChatLoadState.error,
                    onSend: _send,
                    onPickFile: _pickFile,
                  ),
                ],
              ),
            ),
    );
  }

  Widget _messageArea(BuildContext context, ChatController controller) {
    if (controller.state == ChatLoadState.loading) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AppLoading(size: 26),
            SizedBox(height: AppSpacing.md),
            Text(
              '正在加载消息…',
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
          ],
        ),
      );
    }
    if (controller.state == ChatLoadState.error) {
      if (controller.isForbidden) {
        return PermissionNotice(
          title: '暂无频道访问权限',
          message: controller.error ?? '您暂时无法查看这个会话。',
          hint: '次级人员默认不能进入频道；如需进入，请联系项目管理人员开通项目频道访问授权。',
        );
      }
      return AppErrorState(
        message: controller.error ?? '加载失败，请稍后重试',
        onRetry: controller.load,
      );
    }
    if (controller.messages.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(AppSpacing.xxl),
          child: Text(
            '暂无消息，发送一条消息开启讨论吧',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: AppColors.textTertiary),
          ),
        ),
      );
    }

    // 倒序列表让最新消息稳定贴在底部，新消息到达时无需手动滚动
    final items = controller.messages.reversed.toList(growable: false);
    return ListView.builder(
      reverse: true,
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.lg,
        AppSpacing.md,
      ),
      itemCount: items.length,
      itemBuilder: (context, index) {
        final message = items[index];
        return ChatMessageTile(
          message: message,
          isMine: message.isMine(controller.currentUserId),
          onTap: () => _openMessageActions(message),
          onOpenAttachment: _copyAttachmentLink,
        );
      },
    );
  }

  Widget _summaryCard(BuildContext context, ChatController controller) {
    final isDark = isDarkMode(context);
    final background =
        isDark ? const Color(0xFF14263D) : const Color(0xFFEDF4FF);
    final border = isDark ? const Color(0xFF22436B) : const Color(0xFFD3E3F8);

    Widget content;
    if (controller.summaryLoading) {
      content = const Row(
        children: [
          AppLoading(size: 16),
          SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              'AI 正在总结聊天记录…',
              style: TextStyle(fontSize: 13, color: AppColors.primary),
            ),
          ),
        ],
      );
    } else if (controller.summaryError != null) {
      content = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'AI 总结未完成：${controller.summaryError}',
            style: const TextStyle(fontSize: 13, color: AppColors.danger),
          ),
          const SizedBox(height: AppSpacing.xs),
          GestureDetector(
            onTap: _summarize,
            child: const Text(
              '重新生成',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.primary,
              ),
            ),
          ),
        ],
      );
    } else {
      final summary = controller.summary!;
      content = Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'AI 聊天总结 · ${summary.sourceCount} 条来源',
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 150),
            child: SingleChildScrollView(
              child: Text(
                summary.summaryText,
                style: TextStyle(
                  fontSize: 13,
                  height: 1.55,
                  color: isDark
                      ? AppColors.darkTextPrimary
                      : AppColors.textPrimary,
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            '生成方式：${summary.providerLabel}',
            style: const TextStyle(fontSize: 11, color: AppColors.textTertiary),
          ),
        ],
      );
    }

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.sm,
        AppSpacing.md,
        0,
      ),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        border: Border.all(color: border),
      ),
      child: content,
    );
  }

  Widget _banner(
    BuildContext context, {
    required String message,
    String? actionLabel,
    VoidCallback? onAction,
    VoidCallback? onDismiss,
  }) {
    return Container(
      width: double.infinity,
      color: AppColors.dangerLight,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.sm,
      ),
      child: Row(
        children: [
          const AppIcon('warning', size: 16, color: AppColors.danger),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(fontSize: 12, color: AppColors.danger),
            ),
          ),
          if (actionLabel != null && onAction != null)
            GestureDetector(
              onTap: onAction,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
                child: Text(
                  actionLabel,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.danger,
                  ),
                ),
              ),
            ),
          if (onDismiss != null)
            GestureDetector(
              onTap: onDismiss,
              child: const Padding(
                padding: EdgeInsets.only(left: AppSpacing.xs),
                child: AppIcon('close', size: 14, color: AppColors.danger),
              ),
            ),
        ],
      ),
    );
  }
}
