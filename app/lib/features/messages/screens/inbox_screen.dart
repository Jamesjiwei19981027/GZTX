import 'package:flutter/material.dart';

import '../../../core/api/api_client.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../design/design.dart';
import '../../../router/app_destination.dart';
import '../controllers/inbox_controller.dart';
import '../data/messages_repository.dart';
import '../models/messages_models.dart';
import '../widgets/notification_detail_sheet.dart';
import '../widgets/notification_tile.dart';
import '../widgets/notification_badge_host.dart';
import 'external_mail_view.dart';

/// 通知与收件箱：协作通知（已读、全部已读、回复、归档、删除）+ 外部邮件。
class InboxScreen extends StatefulWidget {
  const InboxScreen({
    super.key,
    this.repository,
    this.companyId,
    this.initialTab = InboxTab.notifications,
  });

  final MessagesRepository? repository;
  final int? companyId;
  final InboxTab initialTab;

  @override
  State<InboxScreen> createState() => _InboxScreenState();
}

enum InboxTab { notifications, externalMail }

class _InboxScreenState extends State<InboxScreen> {
  InboxController? _inbox;
  ExternalMailController? _mail;
  MessagesRepository? _repository;
  ApiClient? _api;
  int? _companyId;
  late InboxTab _tab = widget.initialTab;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _resolve();
  }

  void _resolve() {
    var companyId = widget.companyId;
    ApiClient? api;
    if (widget.repository == null) {
      // 订阅登录态：切公司后按新企业重建收件箱控制器，通知与外部邮件都按企业隔离
      final auth = context.authState;
      api = auth.api;
      companyId ??= auth.currentCompany?.id;
    }
    if (_repository != null && api == _api && companyId == _companyId) return;
    _api = api;
    _companyId = companyId;
    _inbox?.dispose();
    _mail?.dispose();
    _inbox = null;
    _mail = null;
    _repository = widget.repository ?? MessagesRepository(api ?? ApiClient());
    if (companyId == null) return;
    _inbox = InboxController(repository: _repository!)..load();
    if (_tab == InboxTab.externalMail) {
      _mail = ExternalMailController(
        repository: _repository!,
        companyId: companyId,
      )..load();
    }
  }

  @override
  void dispose() {
    _inbox?.dispose();
    _mail?.dispose();
    super.dispose();
  }

  void _switchTab(InboxTab tab) {
    if (tab == _tab) return;
    setState(() => _tab = tab);
    if (tab == InboxTab.externalMail && _mail == null && _companyId != null) {
      _mail = ExternalMailController(
        repository: _repository!,
        companyId: _companyId!,
      )..load();
    }
  }

  Future<void> _markAllRead() async {
    final controller = _inbox;
    if (controller == null) return;
    final updated = await controller.markAllRead();
    if (!mounted) return;
    NotificationBadgeScope.maybeOf(context)?.refresh();
    if (updated == null) {
      showAppToast(
        context,
        controller.actionError ?? '全部标为已读失败',
        type: ToastType.error,
      );
      controller.clearActionError();
      return;
    }
    showAppToast(
      context,
      updated > 0 ? '已将 $updated 条通知标为已读' : '当前没有未读通知',
    );
  }

  Future<void> _openNotification(CollabNotification item,
      {bool details = false}) async {
    final controller = _inbox;
    if (controller == null) return;
    await controller.markRead(item.id);
    if (!mounted) return;
    NotificationBadgeScope.maybeOf(context)?.refresh();
    if (controller.actionError != null) {
      showAppToast(context, controller.actionError!, type: ToastType.error);
      controller.clearActionError();
    }
    final target = notificationDestination(item);
    if (target != null && !details) {
      await target.push(context);
      return;
    }
    await showAppBottomSheet<void>(
      context: context,
      title: '通知详情',
      builder: (context) => NotificationDetailSheet(
        controller: controller,
        notification: item,
        onOpenTarget: target == null
            ? null
            : () {
                Navigator.of(context).pop();
                target.push(this.context);
              },
        onTaskDraft: () {
          Navigator.of(context).pop();
          openTaskDraft(this.context, item.bodyText, source: '协作通知');
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final inbox = _inbox;
    return AppScaffold(
      title: '通知与收件箱',
      actions: [
        if (_tab == InboxTab.notifications && inbox != null)
          Padding(
            padding: const EdgeInsets.only(right: AppSpacing.sm),
            child: TextButton(
              onPressed: inbox.markingAll ? null : _markAllRead,
              child: Text(
                inbox.markingAll ? '处理中…' : '全部已读',
                style:
                    const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
              ),
            ),
          ),
      ],
      body: _companyId == null
          ? const AppEmptyState(
              title: '尚未加入企业',
              description: '协作通知按企业发送，请先加入企业',
              icon: AppIcon('bell', size: 18, color: AppColors.textTertiary),
            )
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.lg,
                    AppSpacing.sm,
                    AppSpacing.lg,
                    AppSpacing.xs,
                  ),
                  child: AppSegmentedControl<InboxTab>(
                    segments: const {
                      InboxTab.notifications: '协作通知',
                      InboxTab.externalMail: '外部邮件',
                    },
                    selectedValue: _tab,
                    onValueChanged: _switchTab,
                  ),
                ),
                Expanded(
                  child: _tab == InboxTab.notifications
                      ? _notifications(context)
                      : (_mail == null
                          ? const Center(child: AppLoading(size: 26))
                          : ExternalMailView(controller: _mail!)),
                ),
              ],
            ),
    );
  }

  Widget _notifications(BuildContext context) {
    final controller = _inbox;
    if (controller == null) return const Center(child: AppLoading(size: 26));
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        if (controller.loading) {
          return const Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AppLoading(size: 26),
                SizedBox(height: AppSpacing.md),
                Text(
                  '获取站内通知…',
                  style:
                      TextStyle(fontSize: 13, color: AppColors.textSecondary),
                ),
              ],
            ),
          );
        }
        if (controller.error != null) {
          return AppErrorState(
            message: controller.error!,
            onRetry: controller.load,
          );
        }
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.sm,
                AppSpacing.lg,
                AppSpacing.xs,
              ),
              child: AppSegmentedControl<NotificationFilter>(
                segments: {
                  for (final filter in NotificationFilter.values)
                    filter: filter.label,
                },
                selectedValue: controller.filter,
                onValueChanged: (value) => controller.setFilter(value),
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: controller.load,
                child: controller.items.isEmpty
                    ? ListView(
                        children: [
                          SizedBox(
                            height: MediaQuery.sizeOf(context).height * 0.10,
                          ),
                          AppEmptyState(
                            title: '暂无通知',
                            description:
                                controller.filter == NotificationFilter.archived
                                    ? '无已归档通知'
                                    : '当前收件箱没有新的协作通知',
                            icon: const AppIcon(
                              'bell',
                              size: 18,
                              color: AppColors.textTertiary,
                            ),
                          ),
                        ],
                      )
                    : ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.only(bottom: AppSpacing.xl),
                        children: [
                          AppListSection(
                            children: [
                              for (final item in controller.items)
                                NotificationTile(
                                  item: item,
                                  onTap: () => _openNotification(item),
                                  onDetails: () =>
                                      _openNotification(item, details: true),
                                ),
                            ],
                          ),
                        ],
                      ),
              ),
            ),
          ],
        );
      },
    );
  }
}
