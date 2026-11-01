/// 成员邀请（生成邀请凭证与专属链接）
///
/// 网页真源：`MobileProjectScreens.tsx` 中的 `MobileProjectInviteScreen`（11）。
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:worktodo_app/core/auth/auth_provider.dart';
import 'package:worktodo_app/core/time/time_utils.dart';
import 'package:worktodo_app/design/design.dart';

import '../data/projects_repository.dart';
import '../invite_link.dart';
import '../models/project_models.dart';
import '../widgets/project_error_view.dart';
import '../widgets/project_widgets.dart';

class ProjectInviteScreen extends StatefulWidget {
  const ProjectInviteScreen({
    super.key,
    required this.projectId,
    this.onShare,
  });

  final int projectId;

  /// 系统分享回调（iOS 分享面板 / 安卓分享）。底座尚未引入 `share_plus`，
  /// 默认不提供；依赖合入后由调用方注入即可复用整个页面。
  final Future<void> Function(String link, BuildContext context)? onShare;

  @override
  State<ProjectInviteScreen> createState() => _ProjectInviteScreenState();
}

class _ProjectInviteScreenState extends State<ProjectInviteScreen> {
  final _email = TextEditingController();

  ProjectInvitation? _invite;
  bool _busy = false;
  bool _copied = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  ProjectsRepository get _repo =>
      ProjectsRepository(context.authStateRead.api);

  Future<void> _submit() async {
    final email = _email.text.trim();
    if (!email.contains('@')) {
      setState(() => _error = '请输入有效的受邀人员工作邮箱');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _copied = false;
    });
    try {
      final invitation = await _repo.createInvitation(
        widget.projectId,
        email: email,
      );
      if (!mounted) return;
      setState(() {
        _busy = false;
        _invite = invitation;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = projectErrorMessage(error);
      });
    }
  }

  Future<void> _copyLink(String link) async {
    try {
      await Clipboard.setData(ClipboardData(text: link));
      if (!mounted) return;
      setState(() => _copied = true);
      showAppToast(context, '已复制邀请链接', type: ToastType.success);
    } on PlatformException catch (error) {
      if (!mounted) return;
      setState(() => _error = '复制失败：${error.message ?? '剪贴板不可用'}');
    }
  }

  @override
  Widget build(BuildContext context) {
    final invite = _invite;
    final link = invite == null ? null : buildInviteLink(invite.token);

    return AppScaffold(
      title: '成员邀请',
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.lg,
          AppSpacing.lg,
          AppSpacing.xxxl,
        ),
        children: [
          if (_error != null) ...[
            InfoBanner(
              message: _error!,
              tone: InfoBannerTone.danger,
              icon: 'alert',
            ),
            const SizedBox(height: AppSpacing.md),
          ],
          SectionCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '发送项目邀请',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: AppSpacing.xs),
                const Text(
                  '输入受邀同事的工作邮箱生成专属加入凭证。',
                  style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
                ),
                const SizedBox(height: AppSpacing.lg),
                AppTextField(
                  controller: _email,
                  label: '受邀人邮箱',
                  placeholder: 'colleague@company.com',
                  prefix: const AppIcon('mail', size: 18),
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.done,
                  onSubmitted: (_) => _submit(),
                ),
                const SizedBox(height: AppSpacing.lg),
                AppButton(
                  label: _busy ? '生成中…' : '生成邀请凭证',
                  size: AppButtonSize.lg,
                  isFullWidth: true,
                  isLoading: _busy,
                  onPressed: _busy ? null : _submit,
                ),
              ],
            ),
          ),
          if (invite != null && link != null) ...[
            const SizedBox(height: AppSpacing.lg),
            SectionCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      AppIcon('check-circle', size: 18, color: AppColors.success),
                      SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Text(
                          '邀请凭证已生成',
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: AppColors.success,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(AppSpacing.md),
                    decoration: BoxDecoration(
                      color: isDarkMode(context)
                          ? AppColors.darkSurfaceVariant
                          : AppColors.surfaceVariant,
                      borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
                    ),
                    child: SelectableText(
                      link,
                      style: TextStyle(
                        fontSize: 12,
                        height: 1.5,
                        fontFamily: 'monospace',
                        color: isDarkMode(context)
                            ? AppColors.darkTextSecondary
                            : AppColors.textSecondary,
                      ),
                    ),
                  ),
                  if (invite.expiresAt != null) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      '有效期至：${formatDisplayDateTime(parseApiDateTime(invite.expiresAt))}',
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textTertiary,
                      ),
                    ),
                  ],
                  const SizedBox(height: AppSpacing.md),
                  const InfoBanner(
                    message:
                        '提示：复制链接后请通过工作邮件或聊天工具发送给同事。系统不会自动往外部邮箱发送未经配置的邮件。',
                    tone: InfoBannerTone.warning,
                    icon: 'warning',
                  ),
                  const SizedBox(height: AppSpacing.md),
                  AppButton(
                    label: _copied ? '已复制邀请链接到剪贴板' : '复制专属邀请链接',
                    variant: AppButtonVariant.secondary,
                    size: AppButtonSize.lg,
                    isFullWidth: true,
                    icon: AppIcon(_copied ? 'check' : 'copy', size: 18),
                    onPressed: () => _copyLink(link),
                  ),
                  if (widget.onShare != null) ...[
                    const SizedBox(height: AppSpacing.sm),
                    AppButton(
                      label: '分享邀请链接',
                      variant: AppButtonVariant.secondary,
                      size: AppButtonSize.lg,
                      isFullWidth: true,
                      icon: const AppIcon('share', size: 18),
                      onPressed: () => widget.onShare!(link, context),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
