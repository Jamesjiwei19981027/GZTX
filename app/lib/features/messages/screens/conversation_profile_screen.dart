import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/api/api_client.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/media/system_links.dart';
import '../../../design/design.dart';
import '../controllers/conversation_profile_controller.dart';
import '../data/message_links.dart';
import '../data/messages_repository.dart';
import '../models/messages_models.dart';
import '../widgets/message_avatar.dart';
import '../widgets/pinned_link_sheet.dart';

/// 会话资料页。
///
/// 频道：钉选链接（可增删）+ 共享文件；私聊：成员与在线状态 + 共享文件。
class ConversationProfileScreen extends StatefulWidget {
  const ConversationProfileScreen({
    super.key,
    required this.scopeType,
    required this.scopeId,
    required this.name,
    this.companyId,
    this.repository,
  });

  final String scopeType;
  final int scopeId;
  final String name;
  final int? companyId;
  final MessagesRepository? repository;

  bool get isChannel => scopeType == 'channel';

  @override
  State<ConversationProfileScreen> createState() =>
      _ConversationProfileScreenState();
}

class _ConversationProfileScreenState extends State<ConversationProfileScreen> {
  ConversationProfileController? _controller;
  MessagesRepository? _repository;
  ApiClient? _api;
  int? _companyId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _resolve();
  }

  void _resolve() {
    var companyId = widget.companyId;
    ApiClient? api;
    if (widget.repository == null) {
      // 订阅登录态：切公司后按新企业重建控制器，避免继续展示旧企业的会话资料
      final auth = context.authState;
      api = auth.api;
      companyId ??= auth.currentCompany?.id;
    }
    if (_repository != null && api == _api && companyId == _companyId) return;
    _api = api;
    _companyId = companyId;
    _repository = widget.repository ?? MessagesRepository(api ?? ApiClient());
    _controller?.dispose();
    if (companyId == null) {
      _controller = null;
      return;
    }
    _controller = ConversationProfileController(
      repository: _repository!,
      scopeType: widget.scopeType,
      scopeId: widget.scopeId,
      name: widget.name,
      companyId: companyId,
    )..load();
  }

  @override
  void didUpdateWidget(covariant ConversationProfileScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.scopeId != widget.scopeId ||
        oldWidget.scopeType != widget.scopeType) {
      _controller?.dispose();
      _controller = null;
      // 置空后 _resolve 才会按新编号重建控制器；否则会命中“参数未变”的提前返回
      _repository = null;
      _resolve();
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _addLink() async {
    final controller = _controller;
    if (controller == null) return;
    final result = await showAppBottomSheet<({String title, String url})>(
      context: context,
      title: '添加钉选链接',
      builder: (context) => const PinnedLinkSheet(),
    );
    if (result == null || !mounted) return;
    final ok = await controller.addLink(title: result.title, url: result.url);
    if (!mounted) return;
    if (ok) {
      showAppToast(context, '钉选链接已添加');
    } else if (controller.actionError != null) {
      showAppToast(context, controller.actionError!, type: ToastType.error);
      controller.clearActionError();
    }
  }

  Future<void> _deleteLink(PinnedLink link) async {
    final controller = _controller;
    if (controller == null) return;
    final confirmed = await showAppConfirmDialog(
      context: context,
      title: '删除钉选链接',
      message: '删除后频道成员将看不到“${link.title}”。',
      confirmLabel: '删除',
      isDestructive: true,
    );
    if (!confirmed || !mounted) return;
    final ok = await controller.deleteLink(link);
    if (!mounted) return;
    if (ok) {
      showAppToast(context, '已删除钉选链接');
    } else if (controller.actionError != null) {
      showAppToast(context, controller.actionError!, type: ToastType.error);
      controller.clearActionError();
    }
  }

  Future<void> _copyLink(String? rawUrl) async {
    final repository = _repository;
    if (repository == null || rawUrl == null || rawUrl.trim().isEmpty) {
      showAppToast(context, '该内容暂无链接', type: ToastType.warning);
      return;
    }
    final url = resolveMessageLink(repository.api.baseUrl, rawUrl);
    await Clipboard.setData(ClipboardData(text: url));
    if (!mounted) return;
    showAppToast(context, '链接已复制，可在浏览器打开');
  }

  Future<void> _openLink(String? rawUrl, {String? filename}) async {
    final repository = _repository;
    if (repository == null || rawUrl == null || rawUrl.trim().isEmpty) {
      showAppToast(context, '该内容暂无链接', type: ToastType.warning);
      return;
    }
    final url = resolveMessageLink(repository.api.baseUrl, rawUrl);
    try {
      if (filename == null) {
        await SystemLinks.openExternal(url);
      } else {
        await SystemLinks.openDownload(repository.api, url, filename);
      }
    } catch (error) {
      if (!mounted) return;
      showAppToast(context, '打开失败：${friendlyMessage(error)}',
          type: ToastType.error);
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    return AppScaffold(
      title: '会话资料',
      actions: [
        if (controller != null)
          IconButton(
            tooltip: '刷新资料',
            onPressed: controller.loading ? null : controller.load,
            icon: const AppIcon('refresh', size: 20),
          ),
      ],
      body: controller == null
          ? const AppEmptyState(
              title: '尚未加入企业',
              description: '加入企业后可查看会话资料。',
              icon: AppIcon('team', size: 44, color: AppColors.textTertiary),
            )
          : AnimatedBuilder(
              animation: controller,
              builder: (context, _) => _body(context, controller),
            ),
    );
  }

  Widget _body(BuildContext context, ConversationProfileController controller) {
    if (controller.loading) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AppLoading(size: 26),
            SizedBox(height: AppSpacing.md),
            Text(
              '正在加载会话资料…',
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
          ],
        ),
      );
    }
    if (controller.error != null) {
      return AppErrorState(
          message: controller.error!, onRetry: controller.load);
    }

    return ListView(
      padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
      children: [
        _headerCard(context, controller),
        if (widget.isChannel) ...[
          AppListSection(
            header: '钉选链接 (${controller.links.length})',
            footer: '频道内重要文档、Figma 或代码仓库快捷入口。',
            children: [
              if (controller.links.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(AppSpacing.lg),
                  child: Text(
                    '暂无钉选链接',
                    textAlign: TextAlign.center,
                    style:
                        TextStyle(fontSize: 12, color: AppColors.textTertiary),
                  ),
                ),
              for (final link in controller.links)
                AppListTile(
                  leading:
                      const AppIcon('pin', size: 18, color: AppColors.warning),
                  title: link.title,
                  subtitle: link.url,
                  showChevron: false,
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        tooltip: '复制链接',
                        onPressed: () => _copyLink(link.url),
                        icon: const AppIcon('copy', size: 18),
                      ),
                      IconButton(
                        tooltip: '删除钉选链接',
                        onPressed: () => _deleteLink(link),
                        icon: const AppIcon('trash',
                            size: 18, color: AppColors.danger),
                      ),
                    ],
                  ),
                  onTap: () => _openLink(link.url),
                ),
              Padding(
                padding: const EdgeInsets.all(AppSpacing.sm),
                child: AppButton(
                  label: '添加新钉选链接',
                  variant: AppButtonVariant.secondary,
                  size: AppButtonSize.sm,
                  onPressed: _addLink,
                ),
              ),
            ],
          ),
        ] else ...[
          AppListSection(
            header: '会话成员 (${controller.members.length})',
            children: [
              if (controller.members.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(AppSpacing.lg),
                  child: Text(
                    '成员信息暂不可用，可返回会话列表重试。',
                    textAlign: TextAlign.center,
                    style:
                        TextStyle(fontSize: 12, color: AppColors.textTertiary),
                  ),
                ),
              for (final member in controller.members)
                AppListTile(
                  leading: MessageAvatar(label: member.name, size: 36),
                  title: member.name,
                  subtitle: null,
                  showChevron: false,
                  trailing: PresenceIndicator(
                    status: controller.presenceOf(member.userId),
                  ),
                ),
            ],
          ),
        ],
        AppListSection(
          header: '共享材料与文件 (${controller.files.length})',
          children: [
            if (controller.files.isEmpty)
              const Padding(
                padding: EdgeInsets.all(AppSpacing.lg),
                child: Text(
                  '会话中暂无共享文件',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: AppColors.textTertiary),
                ),
              ),
            for (final file in controller.files)
              AppListTile(
                leading:
                    const AppIcon('file', size: 18, color: AppColors.primary),
                title: file.originalName,
                subtitle: file.sizeLabel.isEmpty ? null : file.sizeLabel,
                onTap: () =>
                    _openLink(file.downloadUrl, filename: file.originalName),
              ),
          ],
        ),
      ],
    );
  }

  Widget _headerCard(
      BuildContext context, ConversationProfileController controller) {
    final isDark = isDarkMode(context);
    return Container(
      margin: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.lg,
        AppSpacing.xs,
      ),
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : Colors.white,
        borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.border,
          width: 0.5,
        ),
      ),
      child: Row(
        children: [
          MessageAvatar(
            label: widget.name,
            isChannel: widget.isChannel,
            size: 48,
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: isDark
                        ? AppColors.darkTextPrimary
                        : AppColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  widget.isChannel ? '项目公共讨论频道' : '直接私信讨论',
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textTertiary,
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
