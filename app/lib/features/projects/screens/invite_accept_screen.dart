/// 接受项目邀请（含深链接入口处理）
///
/// 网页真源：`MobileProjectScreens.tsx` 中的 `MobileInviteAcceptScreen`（81）
/// 与 `frontend/src/App.tsx` 中的邀请自动接受逻辑。
/// 深链接 `?invite={token}` 的解析与路由地址由 `invite_link.dart` 提供；
/// 系统级链接注册（iOS Universal Links / 安卓 App Links）由 T10 统一完成。
library;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:worktodo_app/core/auth/auth_provider.dart';
import 'package:worktodo_app/core/errors/app_error.dart';
import 'package:worktodo_app/design/design.dart';

import '../data/projects_repository.dart';
import '../models/project_models.dart';
import '../widgets/project_error_view.dart';
import '../widgets/project_widgets.dart';

class InviteAcceptScreen extends StatefulWidget {
  const InviteAcceptScreen({super.key, this.initialToken});

  final String? initialToken;

  @override
  State<InviteAcceptScreen> createState() => _InviteAcceptScreenState();
}

class _InviteAcceptScreenState extends State<InviteAcceptScreen> {
  late final TextEditingController _token =
      TextEditingController(text: widget.initialToken ?? '');

  bool _busy = false;
  bool _needPhoneVerify = false;
  String? _error;

  @override
  void dispose() {
    _token.dispose();
    super.dispose();
  }

  ProjectsRepository get _repo =>
      ProjectsRepository(context.authStateRead.api);

  Future<void> _accept() async {
    final token = _token.text.trim();
    if (token.isEmpty) {
      setState(() => _error = '请输入或粘贴邀请令牌');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _needPhoneVerify = false;
    });

    final auth = context.authStateRead;
    try {
      final result = await _repo.acceptInvitation(token);
      await auth.refreshProjects();
      ProjectDetail? detail;
      try {
        detail = await _repo.fetchProject(result.projectId);
      } catch (error) {
        // 项目详情拉取失败不影响「已加入」这一结果，但要给出可见提示
        if (mounted) {
          showAppToast(
            context,
            '已加入项目，但项目详情加载失败：${projectErrorMessage(error)}',
            type: ToastType.warning,
          );
        }
      }
      if (!mounted) return;
      final matched = auth.projects
          .where((item) => item.id == result.projectId)
          .toList();
      if (matched.isNotEmpty) {
        auth.selectProject(matched.first);
      }
      setState(() => _busy = false);
      final name = detail?.name;
      showAppToast(
        context,
        name == null ? '已加入受邀项目' : '已加入「$name」',
        type: ToastType.success,
      );
      context.pushReplacement('/projects/${result.projectId}/team');
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _needPhoneVerify = _isPhoneGate(error);
        _error = _mapAcceptError(error);
      });
    }
  }

  /// 后端 `40320` / 文案含「验证」视为手机验证门禁
  bool _isPhoneGate(Object error) {
    if (error is ApiException) {
      if (error.code == 40320) return true;
      final text = '${error.message} ${error.detail ?? ''}';
      return text.contains('手机') || text.contains('验证');
    }
    return false;
  }

  String _mapAcceptError(Object error) {
    if (_isPhoneGate(error)) {
      return '当前项目要求完成手机号实名验证后方可加入';
    }
    if (error is ApiException) {
      final message = error.message;
      if (message.contains('过期')) {
        return '该邀请链接已过期，请让项目负责人重新生成';
      }
      if (message.contains('无效')) {
        return '该邀请链接已失效或已被使用';
      }
      if (message.contains('不匹配')) {
        return '该邀请与当前登录账号不匹配，请使用受邀邮箱对应的账号登录';
      }
      if (message.contains('不存在')) {
        return '受邀项目不存在或已被归档';
      }
    }
    return projectErrorMessage(error);
  }

  @override
  Widget build(BuildContext context) {
    return AppScaffold(
      title: '接受项目协同邀请',
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.xxl,
          AppSpacing.xxl,
          AppSpacing.xxl,
          AppSpacing.xxxl,
        ),
        children: [
          Center(
            child: Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
              ),
              alignment: Alignment.center,
              child: const AppIcon('share', size: 32, color: AppColors.primary),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          const Text(
            '加入项目团队',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 19, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: AppSpacing.xs),
          const Text(
            '接受邀请后，您将获得该项目的任务协同与人轴汇报权限',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.xl),
          if (_error != null) ...[
            InfoBanner(
              message: _error!,
              tone: InfoBannerTone.danger,
              icon: 'alert',
            ),
            const SizedBox(height: AppSpacing.md),
          ],
          if (_needPhoneVerify) ...[
            AppButton(
              label: '前往验证手机号后继续加入',
              variant: AppButtonVariant.secondary,
              size: AppButtonSize.lg,
              isFullWidth: true,
              icon: const AppIcon('phone', size: 16),
              onPressed: () => context.push('/me/security'),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
          AppTextField(
            controller: _token,
            label: '邀请令牌 Token',
            placeholder: '粘贴或输入收到的邀请 Token',
            prefix: const AppIcon('lock', size: 18),
            autofocus: widget.initialToken == null,
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _accept(),
          ),
          const SizedBox(height: AppSpacing.xl),
          AppButton(
            label: _busy ? '正在加入…' : '接受并进入项目',
            size: AppButtonSize.lg,
            isFullWidth: true,
            isLoading: _busy,
            onPressed: _busy ? null : _accept,
          ),
          const SizedBox(height: AppSpacing.lg),
          const InfoBanner(
            message: '邀请链接由项目负责人生成，仅能使用一次；同一邮箱的邀请需用该邮箱对应的账号接受。',
            tone: InfoBannerTone.info,
            icon: 'info',
          ),
        ],
      ),
    );
  }
}
