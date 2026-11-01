import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/api/api_client.dart';
import '../../../core/auth/auth_provider.dart';
import '../../../design/design.dart';
import '../controllers/messages_home_controller.dart';
import '../data/messages_repository.dart';
import '../models/messages_models.dart';
import '../widgets/message_avatar.dart';

/// 工作联系人页（与项目页分开的独立页）。
///
/// 对齐 `components/WorkContactPicker.tsx`：说明、搜索、联系人列表、发起私聊失败提示。
class WorkContactsScreen extends StatefulWidget {
  const WorkContactsScreen({
    super.key,
    this.repository,
    this.companyId,
    this.projectId,
  });

  final MessagesRepository? repository;
  final int? companyId;
  final int? projectId;

  @override
  State<WorkContactsScreen> createState() => _WorkContactsScreenState();
}

class _WorkContactsScreenState extends State<WorkContactsScreen> {
  WorkContactsController? _controller;
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
    final repository = widget.repository ?? MessagesRepository(api ?? ApiClient());
    _controller = WorkContactsController(
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

  Future<void> _start(WorkContact contact) async {
    final controller = _controller;
    if (controller == null) return;
    final id = await controller.startChat(contact);
    if (!mounted) return;
    final error = controller.actionError;
    if (id == null) {
      if (error != null) {
        showAppToast(context, error, type: ToastType.error);
      }
      return;
    }
    context.pushReplacement(
      '/messages/chat/$id?type=direct&name=${Uri.encodeComponent(contact.name)}',
    );
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    return AppScaffold(
      title: '工作联系人',
      actions: [
        if (controller != null)
          IconButton(
            tooltip: '刷新联系人',
            onPressed: controller.loading ? null : controller.load,
            icon: const AppIcon('refresh', size: 20),
          ),
      ],
      body: _companyId == null
          ? const AppEmptyState(
              title: '尚未加入企业',
              description: '请先加入公司和项目。',
              icon: AppIcon('team', size: 44, color: AppColors.textTertiary),
            )
          : controller == null
              ? const Center(child: AppLoading(size: 26))
              : AnimatedBuilder(
                  animation: controller,
                  builder: (context, _) => _body(context, controller),
                ),
    );
  }

  Widget _body(BuildContext context, WorkContactsController controller) {
    if (controller.loading) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            AppLoading(size: 26),
            SizedBox(height: AppSpacing.md),
            Text(
              '正在加载联系人…',
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
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
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.md,
            AppSpacing.lg,
            AppSpacing.sm,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppTextField(
                placeholder: '搜索工作联系人',
                prefix: const AppIcon('search', size: 18),
                onChanged: controller.setQuery,
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                '工作联系人包含直属上下级及同级同事，项目经理可主动联系项目成员。其他协作请使用项目频道。',
                style: TextStyle(
                  fontSize: 12,
                  height: 1.5,
                  color: isDarkMode(context)
                      ? AppColors.darkTextSecondary
                      : AppColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
        if (controller.creating)
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: Row(
              children: [
                AppLoading(size: 16),
                SizedBox(width: AppSpacing.sm),
                Text(
                  '正在创建会话…',
                  style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
              ],
            ),
          ),
        Expanded(
          child: controller.filtered.isEmpty
              ? AppEmptyState(
                  title: controller.query.trim().isEmpty ? '暂无可联系人员' : '没有匹配的联系人',
                  description: controller.query.trim().isEmpty
                      ? '可通过项目频道与同事沟通，或请项目经理邀请成员。'
                      : '换个姓名关键字再试试。',
                  icon: const AppIcon('team', size: 42, color: AppColors.textTertiary),
                )
              : ListView(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xl),
                  children: [
                    AppListSection(
                      header: '联系人 (${controller.filtered.length})',
                      children: [
                        for (final contact in controller.filtered)
                          AppListTile(
                            leading: MessageAvatar(label: contact.name, size: 36),
                            title: contact.name,
                            subtitle: '点击发起私聊',
                            onTap: controller.creating ? null : () => _start(contact),
                          ),
                      ],
                    ),
                  ],
                ),
        ),
      ],
    );
  }
}
