import 'package:flutter/material.dart';

import '../../../core/api/api_client.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../core/time/time_utils.dart';
import '../../../design/design.dart';
import '../../../router/app_destination.dart';
import 'package:go_router/go_router.dart';
import '../controllers/inbox_controller.dart';
import '../data/messages_repository.dart';
import '../models/messages_models.dart';

/// 外部邮件视图：未配置时展示真实未配置原因，绝不伪造邮件或假成功。
class ExternalMailView extends StatelessWidget {
  const ExternalMailView({super.key, required this.controller});

  final ExternalMailController controller;

  @override
  Widget build(BuildContext context) {
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
                  '检测外部邮件服务状态…',
                  style:
                      TextStyle(fontSize: 13, color: AppColors.textSecondary),
                ),
              ],
            ),
          );
        }
        if (controller.error != null) {
          return AppErrorState(
            title: '外部邮件状态查询失败',
            message: controller.error!,
            onRetry: controller.load,
          );
        }
        final status = controller.status;
        if (status == null || !status.configured) {
          return _notConfigured(context, status);
        }
        return _configured(context, status);
      },
    );
  }

  Widget _notConfigured(BuildContext context, ExternalMailStatus? status) {
    final isDark = isDarkMode(context);
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.xxl),
      children: [
        const SizedBox(height: AppSpacing.xl),
        const AppIcon('mail', size: 52, color: AppColors.textTertiary),
        const SizedBox(height: AppSpacing.lg),
        Text(
          '外部邮箱未配置',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          '当前企业工作区未配置 IMAP 外部邮件服务器，无法接收外部邮件。',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 13,
            height: 1.5,
            color:
                isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: AppColors.warningLight,
            borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
            border: Border.all(color: const Color(0xFFF4D9A4)),
          ),
          child: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '真实连接状态：未就绪',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: Color(0xFF7A4E00),
                ),
              ),
              SizedBox(height: AppSpacing.xs),
              Text(
                '若需关联外部客户邮件，请由管理员在管理后台配置企业邮件网关。',
                style: TextStyle(
                  fontSize: 12,
                  height: 1.5,
                  color: Color(0xFF7A4E00),
                ),
              ),
            ],
          ),
        ),
        if ((status?.reason ?? '').isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            '诊断信息：服务端未配置 IMAP 账号（${status!.reason}）',
            style: const TextStyle(fontSize: 11, color: AppColors.textTertiary),
          ),
        ],
      ],
    );
  }

  Widget _configured(BuildContext context, ExternalMailStatus status) {
    final items = controller.items;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.sm,
            AppSpacing.lg,
            AppSpacing.sm,
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  '连接账户：${status.username ?? status.host ?? '未知'}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textTertiary,
                  ),
                ),
              ),
              AppButton(
                label: controller.syncing ? '同步中…' : '立即拉取邮件',
                size: AppButtonSize.sm,
                isLoading: controller.syncing,
                onPressed: controller.syncing ? null : () => controller.sync(),
              ),
            ],
          ),
        ),
        if (controller.notice != null)
          _banner(context, controller.notice!, isError: false),
        if (controller.actionError != null)
          _banner(context, controller.actionError!, isError: true),
        Expanded(
          child: items.isEmpty
              ? const AppEmptyState(
                  title: '外部邮箱暂无新信件',
                  description: '可点击上方「立即拉取邮件」从服务器同步。',
                  icon:
                      AppIcon('mail', size: 42, color: AppColors.textTertiary),
                )
              : ListView(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xl),
                  children: [
                    AppListSection(
                      header: '收件箱邮件 (${items.length})',
                      children: [
                        for (final mail in items)
                          AppListTile(
                            leading: const AppIcon('mail',
                                size: 18, color: AppColors.primary),
                            title: mail.subjectLabel,
                            subtitle: '发件人：${mail.fromAddress}'
                                '${mail.receivedAt == null ? '' : ' · ${formatRelativeDate(mail.receivedAt)}'}',
                            onTap: () => _openDetail(context, mail),
                          ),
                      ],
                    ),
                  ],
                ),
        ),
      ],
    );
  }

  Future<void> _openDetail(BuildContext context, ExternalMailItem mail) async {
    final router = GoRouter.maybeOf(context);
    await showAppBottomSheet<void>(
      context: context,
      title: '邮件详情',
      builder: (sheetContext) => _MailDetailSheet(
        controller: controller,
        mail: mail,
        onTaskDraft: router == null
            ? null
            : (detail) {
                Navigator.of(sheetContext).pop();
                router.pushNamed('work-task-edit',
                    extra: TaskDraft.fromText(
                        '${detail.subjectLabel}\n${detail.bodyText ?? ''}',
                        source: '外部邮件 · ${detail.fromAddress}'));
              },
      ),
    );
  }

  Widget _banner(BuildContext context, String message,
      {required bool isError}) {
    final background =
        isError ? AppColors.dangerContainerOf(isDarkMode(context)) : AppColors.infoContainerOf(isDarkMode(context));
    final color = isError ? AppColors.onDangerContainerOf(isDarkMode(context)) : AppColors.onInfoContainerOf(isDarkMode(context));
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.sm,
      ),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
      ),
      child: Text(
        message,
        style: TextStyle(fontSize: 12, color: color),
      ),
    );
  }
}

class _MailDetailSheet extends StatefulWidget {
  const _MailDetailSheet(
      {required this.controller, required this.mail, this.onTaskDraft});

  final ExternalMailController controller;
  final ExternalMailItem mail;
  final ValueChanged<ExternalMailItem>? onTaskDraft;

  @override
  State<_MailDetailSheet> createState() => _MailDetailSheetState();
}

class _MailDetailSheetState extends State<_MailDetailSheet> {
  ExternalMailItem? _detail;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final detail = await widget.controller.openDetail(widget.mail);
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _error = null;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = friendlyMessage(error);
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.all(AppSpacing.xxl),
        child: Center(child: AppLoading(size: 24)),
      );
    }
    if (_error != null) {
      return Padding(
        padding: const EdgeInsets.all(AppSpacing.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              _error!,
              style: const TextStyle(fontSize: 13, color: AppColors.danger),
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(label: '重试', size: AppButtonSize.sm, onPressed: _load),
          ],
        ),
      );
    }

    final detail = _detail!;
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
          Text(
            detail.subjectLabel,
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            '发件人：${detail.fromAddress}',
            style:
                const TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
          if (detail.receivedAt != null)
            Text(
              '接收时间：${formatDisplayDateTime(detail.receivedAt)}',
              style:
                  const TextStyle(fontSize: 12, color: AppColors.textTertiary),
            ),
          const SizedBox(height: AppSpacing.md),
          Container(
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: AppColors.background,
              borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
            ),
            child: Text(
              (detail.bodyText ?? '').trim().isEmpty
                  ? '（邮件正文为空）'
                  : detail.bodyText!,
              style: const TextStyle(fontSize: 13, height: 1.6),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          if (widget.onTaskDraft != null)
            AppButton(
                label: '转为任务草稿', onPressed: () => widget.onTaskDraft!(detail)),
          AppButton(
            label: '归档这封邮件',
            variant: AppButtonVariant.secondary,
            onPressed: () async {
              final ok = await widget.controller.archive(detail);
              if (!context.mounted) return;
              Navigator.of(context).pop();
              showAppToast(
                context,
                ok ? '邮件已归档' : (widget.controller.actionError ?? '归档失败'),
                type: ok ? ToastType.info : ToastType.error,
              );
            },
          ),
        ],
      ),
    );
  }
}

/// 外部邮件独立页（screen 名 messages-external-mail）
class ExternalMailScreen extends StatefulWidget {
  const ExternalMailScreen({
    super.key,
    this.repository,
    this.companyId,
  });

  final MessagesRepository? repository;
  final int? companyId;

  @override
  State<ExternalMailScreen> createState() => _ExternalMailScreenState();
}

class _ExternalMailScreenState extends State<ExternalMailScreen> {
  ExternalMailController? _controller;
  ApiClient? _api;
  int? _companyId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    var companyId = widget.companyId;
    ApiClient? api;
    if (widget.repository == null) {
      final auth = context.authStateRead;
      api = auth.api;
      companyId ??= auth.currentCompany?.id;
    }
    if (_controller != null && api == _api && companyId == _companyId) return;
    _controller?.dispose();
    _controller = null;
    _api = api;
    _companyId = companyId;
    if (companyId == null) return;
    final repository =
        widget.repository ?? MessagesRepository(api ?? ApiClient());
    _controller = ExternalMailController(
      repository: repository,
      companyId: companyId,
    )..load();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    return AppScaffold(
      title: '外部邮件',
      body: controller == null
          ? const AppEmptyState(
              title: '尚未加入企业',
              description: '外部邮件按企业配置，请先加入企业。',
              icon: AppIcon('mail', size: 44, color: AppColors.textTertiary),
            )
          : ExternalMailView(controller: controller),
    );
  }
}

