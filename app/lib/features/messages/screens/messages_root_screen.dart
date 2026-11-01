import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/time/time_utils.dart';
import '../../../design/design.dart';
import '../controllers/messages_home_controller.dart';
import '../data/messages_repository.dart';
import '../models/messages_models.dart';
import '../widgets/message_avatar.dart';
import '../widgets/permission_notice.dart';

/// 消息 Tab 根页：项目频道 + 直接私聊。
///
/// 与网页版 `MobileMessageScreens.tsx` 的 `MobileMessageListScreen` 对齐：
/// 顶栏两个入口（通知收件箱、新建私聊）、频道／私聊切换、空状态引导。
class MessagesRootScreen extends StatefulWidget {
  const MessagesRootScreen({
    super.key,
    this.repository,
    this.companyId,
    this.projectId,
  });

  /// 测试注入用；为空时从登录态取真实接口客户端
  final MessagesRepository? repository;
  final int? companyId;
  final int? projectId;

  @override
  State<MessagesRootScreen> createState() => _MessagesRootScreenState();
}

enum _MessageListTab { channels, direct }

class _MessagesRootScreenState extends State<MessagesRootScreen> {
  _MessageListTab _tab = _MessageListTab.channels;
  MessagesHomeController? _controller;
  ApiClient? _api;
  int? _companyId;
  int? _projectId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _resolve();
  }

  void _resolve() {
    var companyId = widget.companyId;
    var projectId = widget.projectId;
    ApiClient? api;

    if (widget.repository == null) {
      final auth = context.authStateRead;
      api = auth.api;
      companyId ??= auth.currentCompany?.id;
      if (widget.projectId == null) {
        final current = auth.currentProject;
        projectId = (current != null && current.id > 0) ? current.id : null;
      }
    }

    if (api == _api && companyId == _companyId && projectId == _projectId) {
      return;
    }

    _controller?.dispose();
    _controller = null;
    _api = api;
    _companyId = companyId;
    _projectId = projectId;

    if (companyId == null) return;
    final repository =
        widget.repository ?? MessagesRepository(api ?? ApiClient());
    _controller = MessagesHomeController(
      repository: repository,
      companyId: companyId,
      projectId: projectId,
    )..load();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  void _openNewChat() {
    context.push('/messages/contacts');
  }

  void _openInbox() {
    context.push('/messages/inbox');
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: '消息',
      actions: [
        IconButton(
          tooltip: '通知与收件箱',
          onPressed: _openInbox,
          icon: const AppIcon('bell', size: 21),
        ),
        IconButton(
          tooltip: '新建私聊',
          onPressed: _openNewChat,
          icon: const AppIcon('plus', size: 22),
        ),
      ],
      body: _body(context),
    );
  }

  Widget _body(BuildContext context) {
    if (_companyId == null) {
      return const AppEmptyState(
        title: '尚未加入企业',
        description: '加入企业或团队后，就能看到项目频道与私聊。',
        icon: AppIcon('messages', size: 48, color: AppColors.textTertiary),
      );
    }

    final controller = _controller;
    if (controller == null) {
      return const Center(child: AppLoading(size: 26));
    }

    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.sm,
                AppSpacing.lg,
                AppSpacing.xs,
              ),
              child: AppSegmentedControl<_MessageListTab>(
                segments: {
                  _MessageListTab.channels: '项目频道 (${controller.channels.length})',
                  _MessageListTab.direct:
                      '直接私聊 (${controller.conversations.length})',
                },
                selectedValue: _tab,
                onValueChanged: (value) => setState(() => _tab = value),
              ),
            ),
            Expanded(
              child: controller.loading
                  ? const Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          AppLoading(size: 26),
                          SizedBox(height: AppSpacing.md),
                          Text(
                            '获取会话列表…',
                            style: TextStyle(
                              fontSize: 13,
                              color: AppColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: controller.load,
                      child: _tab == _MessageListTab.channels
                          ? _channelList(context, controller)
                          : _directList(context, controller),
                    ),
            ),
          ],
        );
      },
    );
  }

  Widget _channelList(BuildContext context, MessagesHomeController controller) {
    if (controller.channelError != null) {
      if (controller.channelForbidden) {
        return ListView(
          children: [
            SizedBox(height: MediaQuery.sizeOf(context).height * 0.06),
            PermissionNotice(
              title: '无法进入项目频道',
              message: controller.channelError!,
              hint: '次级人员默认不能进入频道；如需进入，请联系项目管理人员开通项目频道访问授权。',
            ),
          ],
        );
      }
      return ListView(
        children: [
          SizedBox(height: MediaQuery.sizeOf(context).height * 0.12),
          AppErrorState(
            title: '无法进入项目频道',
            message: controller.channelError!,
            onRetry: controller.load,
          ),
        ],
      );
    }
    if (controller.channels.isEmpty) {
      return ListView(
        children: [
          SizedBox(height: MediaQuery.sizeOf(context).height * 0.08),
          AppEmptyState(
            title: '暂无项目频道',
            description: '选择项目后可进入项目频道，也可以直接找工作联系人私聊。',
            icon: const AppIcon('messages', size: 42, color: AppColors.textTertiary),
            actionLabel: '选择工作联系人',
            onAction: _openNewChat,
          ),
        ],
      );
    }

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      children: [
        AppListSection(
          header: '频道列表',
          children: [
            for (final channel in controller.channels)
              AppListTile(
                leading: MessageAvatar(label: channel.name, isChannel: true),
                title: channel.name,
                subtitle: '项目公共频道 #${channel.key}',
                onTap: () => context.push(
                  '/messages/chat/${channel.id}'
                  '?type=channel&name=${Uri.encodeComponent(channel.name)}',
                ),
              ),
          ],
        ),
      ],
    );
  }

  Widget _directList(BuildContext context, MessagesHomeController controller) {
    if (controller.conversationError != null) {
      return ListView(
        children: [
          SizedBox(height: MediaQuery.sizeOf(context).height * 0.12),
          AppErrorState(
            message: controller.conversationError!,
            onRetry: controller.load,
          ),
        ],
      );
    }
    if (controller.conversations.isEmpty) {
      return ListView(
        children: [
          SizedBox(height: MediaQuery.sizeOf(context).height * 0.08),
          AppEmptyState(
            title: '暂无直接私聊',
            description: '点击右上角「+」选择工作联系人发起私聊。',
            icon: const AppIcon('messages', size: 42, color: AppColors.textTertiary),
            actionLabel: '发起私聊',
            onAction: _openNewChat,
          ),
        ],
      );
    }

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      children: [
        AppListSection(
          header: '私聊与讨论组',
          children: [
            for (final conversation in controller.conversations)
              AppListTile(
                leading: MessageAvatar(label: conversation.displayTitle),
                title: conversation.displayTitle,
                subtitle: _conversationSubtitle(conversation),
                onTap: () => context.push(
                  '/messages/chat/${conversation.id}'
                  '?type=direct&name=${Uri.encodeComponent(conversation.displayTitle)}',
                ),
              ),
          ],
        ),
      ],
    );
  }

  String _conversationSubtitle(DirectConversation conversation) {
    final body = (conversation.lastMessageBody ?? '').trim();
    if (body.isEmpty) return '暂无消息记录';
    final time = conversation.lastMessageAt;
    if (time == null) return body;
    return '${formatRelativeDate(time)}  $body';
  }
}
