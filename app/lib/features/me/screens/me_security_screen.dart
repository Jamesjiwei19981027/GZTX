import 'dart:async';

import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/auth/auth_state.dart';
import '../../../core/models/user.dart';
import '../../../design/design.dart';
import '../appearance/me_appearance.dart';
import '../data/me_api.dart';
import '../data/me_models.dart';
import '../state/me_runtime.dart';
import '../widgets/me_common.dart';

/// 账号与安全（对应网页 `MobileSecurityScreen`，设计 ID 55）
class MeSecurityScreen extends StatefulWidget {
  const MeSecurityScreen({
    super.key,
    this.api,
    this.authState,
    this.appearance,
    this.userOverride,
  });

  final MeApi? api;
  final AuthState? authState;
  final MeAppearanceController? appearance;
  final User? userOverride;

  @override
  State<MeSecurityScreen> createState() => _MeSecurityScreenState();
}

class _MeSecurityScreenState extends State<MeSecurityScreen> {
  final _oldPasswordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();

  bool _loading = true;
  Object? _loadError;
  MeVerificationStatus? _verification;
  bool _showPassword = false;
  bool _changing = false;
  String? _errorMessage;
  String? _successMessage;

  MeApi get _api => resolveMeApi(context, widget.api);
  AuthState? get _auth => resolveMeAuthState(context, widget.authState);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _oldPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final status = await _api.fetchVerification();
      if (!mounted) return;
      setState(() {
        _verification = status;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = e;
        _loading = false;
      });
    }
  }

  Future<void> _changePassword() async {
    final oldPassword = _oldPasswordController.text;
    final newPassword = _newPasswordController.text;
    final confirm = _confirmPasswordController.text;

    if (oldPassword.isEmpty) {
      setState(() => _errorMessage = '请输入当前原密码');
      return;
    }
    if (newPassword.length < 6) {
      setState(() => _errorMessage = '新密码长度不能少于 6 位');
      return;
    }
    if (newPassword != confirm) {
      setState(() => _errorMessage = '两次输入的新密码不一致');
      return;
    }

    setState(() {
      _changing = true;
      _errorMessage = null;
      _successMessage = null;
    });
    try {
      await _api.changePassword(
        oldPassword: oldPassword,
        newPassword: newPassword,
      );
      if (!mounted) return;
      _oldPasswordController.clear();
      _newPasswordController.clear();
      _confirmPasswordController.clear();
      setState(() {
        _changing = false;
        _successMessage = '密码修改成功，下次请使用新密码登录';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _changing = false;
        _errorMessage = meErrorMessage(e);
      });
    }
  }

  Future<void> _openBindSheet(String channel) async {
    final isEmail = channel == 'email';
    final targetController = TextEditingController(
      text: isEmail
          ? (_verification?.email ?? '').trim()
          : (_verification?.phone ?? '').trim(),
    );
    final codeController = TextEditingController();
    var sending = false;
    var confirming = false;
    var cooldown = 0;
    String? sheetError;
    String? sheetSuccess;
    Timer? timer;

    final callerTheme = Theme.of(context);
    final callerCupertino = CupertinoTheme.of(context);

    await showAppBottomSheet<void>(
      context: context,
      title: isEmail ? '绑定/验证邮箱' : '绑定/验证手机',
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            Future<void> sendCode() async {
              final target = targetController.text.trim();
              if (target.isEmpty) {
                setSheetState(() => sheetError = '请输入有效的手机号或邮箱');
                return;
              }
              setSheetState(() {
                sending = true;
                sheetError = null;
              });
              try {
                final result = await _api.sendBindCode(
                  channel: channel,
                  target: target,
                );
                if (!context.mounted) return;
                timer?.cancel();
                timer = Timer.periodic(const Duration(seconds: 1), (t) {
                  if (!context.mounted) {
                    t.cancel();
                    return;
                  }
                  setSheetState(() {
                    cooldown = (cooldown - 1).clamp(0, 600);
                    if (cooldown == 0) t.cancel();
                  });
                });
                setSheetState(() {
                  sending = false;
                  cooldown = result.cooldownSeconds;
                  sheetSuccess = '验证码已发送至 $target';
                });
              } catch (e) {
                if (!context.mounted) return;
                setSheetState(() {
                  sending = false;
                  sheetError = meErrorMessage(e);
                });
              }
            }

            Future<void> confirm() async {
              final target = targetController.text.trim();
              final code = codeController.text.trim();
              if (target.isEmpty || code.isEmpty) {
                setSheetState(() => sheetError = '请输入完整的目标与验证码');
                return;
              }
              setSheetState(() {
                confirming = true;
                sheetError = null;
              });
              try {
                final updated = await _api.confirmBindCode(
                  channel: channel,
                  target: target,
                  code: code,
                );
                if (!context.mounted) return;
                setSheetState(() {
                  confirming = false;
                  sheetSuccess = '绑定验证成功';
                });
                if (!mounted) return;
                setState(() {
                  _verification = updated;
                  _successMessage = '绑定验证成功';
                });
                timer?.cancel();
                Navigator.of(context).pop();
              } catch (e) {
                if (!context.mounted) return;
                setSheetState(() {
                  confirming = false;
                  sheetError = meErrorMessage(e);
                });
              }
            }

            return Theme(
              data: callerTheme,
              child: CupertinoTheme(
                data: callerCupertino,
                child: Material(
                  color: Colors.transparent,
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(
                      AppSpacing.pageHorizontal,
                      AppSpacing.sm,
                      AppSpacing.pageHorizontal,
                      AppSpacing.lg +
                          MediaQuery.viewInsetsOf(context).bottom,
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        MeFieldLabel(
                          label: isEmail ? '邮箱地址' : '手机号',
                          required: true,
                        ),
                        AppTextField(
                          controller: targetController,
                          placeholder: isEmail ? 'name@company.com' : '13800000000',
                          keyboardType: isEmail
                              ? TextInputType.emailAddress
                              : TextInputType.phone,
                          onChanged: (_) => setSheetState(() {}),
                        ),
                        const SizedBox(height: AppSpacing.md),
                        const MeFieldLabel(label: '验证码', required: true),
                        Row(
                          children: [
                            Expanded(
                              child: AppTextField(
                                controller: codeController,
                                placeholder: '6 位数字验证码',
                                keyboardType: TextInputType.number,
                                onChanged: (_) => setSheetState(() {}),
                              ),
                            ),
                            const SizedBox(width: AppSpacing.sm),
                            MeInlineButton(
                              label: cooldown > 0
                                  ? '${cooldown}s'
                                  : (sending ? '发送中…' : '获取验证码'),
                              isLoading: sending,
                              onPressed: cooldown > 0 || sending
                                  ? null
                                  : () => unawaited(sendCode()),
                            ),
                          ],
                        ),
                        if (sheetError != null)
                          Padding(
                            padding: const EdgeInsets.only(top: AppSpacing.md),
                            child: MeBanner(
                              message: sheetError!,
                              tone: MeTone.danger,
                            ),
                          ),
                        if (sheetSuccess != null)
                          Padding(
                            padding: const EdgeInsets.only(top: AppSpacing.md),
                            child: MeBanner(
                              message: sheetSuccess!,
                              tone: MeTone.success,
                            ),
                          ),
                        const SizedBox(height: AppSpacing.md),
                        AppButton(
                          label: '确认绑定',
                          isFullWidth: true,
                          isLoading: confirming,
                          onPressed:
                              confirming ? null : () => unawaited(confirm()),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        );
      },
    );
    timer?.cancel();
    targetController.dispose();
    codeController.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MeScreenAppearance(
      controller: widget.appearance,
      child: AppScaffold(
        title: '账号与安全',
        body: _loading
            ? const MeLoadingState(message: '正在加载安全信息…')
            : _loadError != null
                ? MeErrorState(
                    message: meErrorMessage(_loadError!),
                    onRetry: _load,
                  )
                : MeKeyboardSafeBody(
                    child: MePageBody(
                      children: [
                        if (_errorMessage != null)
                          Padding(
                            padding: const EdgeInsets.only(bottom: AppSpacing.md),
                            child: MeBanner(
                              message: _errorMessage!,
                              tone: MeTone.danger,
                            ),
                          ),
                        if (_successMessage != null)
                          Padding(
                            padding: const EdgeInsets.only(bottom: AppSpacing.md),
                            child: MeBanner(
                              message: _successMessage!,
                              tone: MeTone.success,
                            ),
                          ),
                        _passwordCard(),
                        const SizedBox(height: AppSpacing.md),
                        _verificationCard(),
                        const SizedBox(height: AppSpacing.md),
                        _devicesCard(),
                        const SizedBox(height: AppSpacing.md),
                        _dangerCard(),
                      ],
                    ),
                  ),
      ),
    );
  }

  Widget _passwordCard() {
    return MeCard(
      title: '登录密码',
      children: [
        const MeFieldLabel(label: '当前原密码', required: true),
        AppTextField(
          controller: _oldPasswordController,
          placeholder: '请输入原密码',
          obscureText: !_showPassword,
          onChanged: (_) => setState(() {}),
          suffix: _eyeToggle(),
        ),
        const SizedBox(height: AppSpacing.md),
        const MeFieldLabel(
          label: '新密码',
          required: true,
          helper: '至少 6 位字符，推荐包含数字和英文字母',
        ),
        AppTextField(
          controller: _newPasswordController,
          placeholder: '请输入新密码',
          obscureText: !_showPassword,
          onChanged: (_) => setState(() {}),
          suffix: _eyeToggle(),
        ),
        const SizedBox(height: AppSpacing.md),
        const MeFieldLabel(label: '确认新密码', required: true),
        AppTextField(
          controller: _confirmPasswordController,
          placeholder: '请再次输入新密码',
          obscureText: !_showPassword,
          onChanged: (_) => setState(() {}),
          suffix: _eyeToggle(),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppButton(
          label: '更新密码',
          isFullWidth: true,
          isLoading: _changing,
          onPressed: _changing ? null : _changePassword,
        ),
      ],
    );
  }

  Widget _eyeToggle() {
    return GestureDetector(
      onTap: () => setState(() => _showPassword = !_showPassword),
      child: AppIcon(
        _showPassword ? 'eye-off' : 'eye',
        size: 18,
        color: AppColors.textTertiary,
      ),
    );
  }

  Widget _verificationCard() {
    final emailVerified = _verification?.emailVerified == true;
    final phoneVerified = _verification?.phoneVerified == true;
    final email = (_verification?.email ?? '').trim();
    final phone = (_verification?.phone ?? '').trim();

    return MeCard(
      title: '安全验证与绑定',
      footer: '已验证的邮箱与手机将显示为绿色徽标；未验证为灰色。',
      children: [
        Row(
          children: [
            const AppIcon('mail', size: 18, color: Color(0xFF1E88E5)),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '工作邮箱验证',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    email.isEmpty ? '尚未绑定邮箱' : email,
                    style: TextStyle(
                      fontSize: 12,
                      color: isDarkMode(context)
                          ? AppColors.darkTextSecondary
                          : AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            MeBadge(
              label: emailVerified ? '已验证' : '未验证',
              tone: emailVerified ? MeTone.success : MeTone.neutral,
            ),
            const SizedBox(width: AppSpacing.sm),
            MeInlineButton(
              label: emailVerified ? '换绑' : '验证',
              onPressed: () => _openBindSheet('email'),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        Row(
          children: [
            AppIcon(
              'phone',
              size: 18,
              color: phoneVerified ? AppColors.success : AppColors.textTertiary,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '手机安全验证',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    phone.isEmpty ? '尚未绑定手机' : phone,
                    style: TextStyle(
                      fontSize: 12,
                      color: isDarkMode(context)
                          ? AppColors.darkTextSecondary
                          : AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            MeBadge(
              label: phoneVerified ? '已验证' : '未验证',
              tone: phoneVerified ? MeTone.success : MeTone.neutral,
            ),
            const SizedBox(width: AppSpacing.sm),
            MeInlineButton(
              label: phoneVerified ? '换绑' : '验证',
              onPressed: () => _openBindSheet('sms'),
            ),
          ],
        ),
      ],
    );
  }

  Widget _devicesCard() {
    final platformLabel = switch (defaultTargetPlatform) {
      TargetPlatform.android => 'Android',
      TargetPlatform.iOS => 'iOS',
      TargetPlatform.macOS => 'macOS',
      TargetPlatform.windows => 'Windows',
      TargetPlatform.linux => 'Linux',
      TargetPlatform.fuchsia => 'Fuchsia',
    };
    return MeCard(
      title: '登录设备',
      footer: '服务端当前未提供登录设备列表接口（已上报总控）；此处仅展示本机信息。',
      children: [
        MeInfoRow(label: '本机平台', value: platformLabel),
        MeInfoRow(
          label: '登录账号',
          value: widget.userOverride?.username ??
              _auth?.currentUser?.username ??
              '—',
        ),
        MeInfoRow(
          label: '会话状态',
          value: (_auth?.isAuthenticated ?? true) ? '已登录' : '未登录',
          showDivider: false,
        ),
        const SizedBox(height: AppSpacing.md),
        AppButton(
          label: '退出当前登录',
          variant: AppButtonVariant.secondary,
          isFullWidth: true,
          onPressed: () async {
            final confirmed = await showAppConfirmDialog(
              context: context,
              title: '确认退出登录？',
              message: '退出后本地草稿将被安全清理，下次登录需要重新输入身份凭据。',
              confirmLabel: '确认退出',
              isDestructive: true,
            );
            if (!confirmed) return;
            await _auth?.logout();
          },
        ),
      ],
    );
  }

  Widget _dangerCard() {
    return MeCard(
      title: '高风险操作',
      footer: '注销账号将永久清除所有个人数据与权限，操作不可逆。',
      children: [
        MeListRow(
          title: '注销此账号',
          subtitle: '删除账号并吊销所有访问凭证',
          icon: 'alert',
          iconColor: AppColors.danger,
          onTap: () => context.push('/me/account-delete'),
        ),
      ],
    );
  }
}

