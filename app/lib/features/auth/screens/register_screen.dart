import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_state.dart';
import '../../../design/design.dart';
import '../auth_paths.dart';
import '../data/auth_api.dart';
import '../data/auth_flow.dart';
import '../models/auth_models.dart';
import '../utils/auth_error_message.dart';
import '../utils/auth_validators.dart';
import '../utils/countdown_controller.dart';
import '../widgets/auth_message_banner.dart';
import '../widgets/code_field_row.dart';
import '../widgets/send_code_button.dart';
import '../../projects/invite_link.dart';

/// 注册页
///
/// 功能真源：`frontend/src/mobile/features/auth/MobileAuthScreens.tsx` 模式 02，
/// 并结合 `frontend/src/components/LoginGate.tsx` 的用户名校验规则。
///
/// 与移动网页版的差异（有意）：邮箱与邮箱验证码为必填。后端
/// `REGISTER_VERIFICATION_REQUIRED` 默认为 True，缺少邮箱验证码会直接 422 拒绝，
/// 因此原生端在表单层就要求填写，避免用户提交后才看到错误。
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key, this.api, this.inviteToken});

  final AuthApi? api;
  final String? inviteToken;

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final TextEditingController _username = TextEditingController();
  final TextEditingController _email = TextEditingController();
  final TextEditingController _emailCode = TextEditingController();
  final TextEditingController _phone = TextEditingController();
  final TextEditingController _phoneCode = TextEditingController();
  final TextEditingController _password = TextEditingController();
  final TextEditingController _confirm = TextEditingController();
  late final CountdownController _emailCountdown = CountdownController();
  late final CountdownController _phoneCountdown = CountdownController();

  bool _obscurePassword = true;
  bool _busy = false;
  String? _error;
  String? _hint;

  @override
  void initState() {
    super.initState();
    for (final c in [_username, _email, _emailCode, _phone, _phoneCode, _password, _confirm]) {
      c.addListener(_onFormChanged);
    }
  }

  @override
  void dispose() {
    _username.dispose();
    _email.dispose();
    _emailCode.dispose();
    _phone.dispose();
    _phoneCode.dispose();
    _password.dispose();
    _confirm.dispose();
    _emailCountdown.dispose();
    _phoneCountdown.dispose();
    super.dispose();
  }

  void _onFormChanged() {
    if (mounted) setState(() {});
  }

  AuthApi get _api => widget.api ?? AuthApi(context.read<AuthState>().api);

  String? _resolveInviteToken() {
    if (widget.inviteToken != null && widget.inviteToken!.trim().isNotEmpty) {
      return widget.inviteToken!.trim();
    }
    return PendingInviteHolder.token ??
        context.read<AuthState>().pendingInviteToken;
  }

  bool get _canSubmit =>
      !_busy &&
      _username.text.trim().isNotEmpty &&
      _email.text.trim().isNotEmpty &&
      _emailCode.text.trim().isNotEmpty &&
      _password.text.isNotEmpty &&
      _password.text == _confirm.text;

  Future<void> _sendCode(AuthChannel channel) async {
    final target =
        channel == AuthChannel.email ? _email.text.trim() : _phone.text.trim();
    setState(() {
      _error = null;
      _hint = null;
    });
    if (target.isEmpty) {
      setState(() {
        _error = channel == AuthChannel.email ? '请输入工作邮箱' : '请输入手机号';
      });
      return;
    }
    setState(() => _busy = true);
    try {
      final result = await _api.sendCode(
        channel: channel,
        target: target,
        purpose: SendCodePurpose.register,
        inviteToken: _resolveInviteToken(),
      );
      if (!mounted) return;
      if (channel == AuthChannel.email) {
        _emailCountdown.start(result.resendAfterSeconds);
      } else {
        _phoneCountdown.start(result.resendAfterSeconds);
      }
      setState(() {
        _hint = result.debugCode != null
            ? '${channel.label}验证码已发送（调试码: ${result.debugCode}）'
            : '${channel.label}验证码已发送';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = describeAuthError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String? _validateForm() {
    final usernameError = AuthValidators.validateUsername(_username.text);
    if (usernameError != null) return usernameError;

    final emailError = AuthValidators.validateEmail(_email.text);
    if (emailError != null) return emailError;

    if (_emailCode.text.trim().isEmpty) return '请输入邮箱验证码';

    final phoneError = AuthValidators.validateOptionalPhone(_phone.text);
    if (phoneError != null) return phoneError;

    final passwordError = AuthValidators.validatePassword(_password.text);
    if (passwordError != null) return passwordError;

    if (_password.text != _confirm.text) return '两次输入的密码不一致';
    return null;
  }

  Future<void> _submit() async {
    final validation = _validateForm();
    if (validation != null) {
      setState(() {
        _error = validation;
        _hint = null;
      });
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
      _hint = null;
    });
    try {
      final username = _username.text.trim();
      final session = await _api.register(
        username: username,
        password: _password.text,
        email: _email.text.trim(),
        emailCode: _emailCode.text.trim(),
        phone: _phone.text.trim(),
        phoneCode: _phoneCode.text.trim(),
        nickname: username,
        inviteToken: _resolveInviteToken(),
      );
      if (!mounted) return;
      await AuthFlow(context.read<AuthState>())
          .completeSignInAndEnter(context, session);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = describeAuthError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _backToLogin() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(AuthPaths.login);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return AppScaffold(
      title: '注册新账号',
      body: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.xl,
          AppSpacing.lg,
          AppSpacing.xl,
          AppSpacing.xl + bottomInset,
        ),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  '创建账号开启项目敏捷协同与智能汇报',
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark
                        ? AppColors.darkTextSecondary
                        : AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                if (_error != null)
                  AuthMessageBanner(
                    key: const ValueKey('register-error-banner'),
                    message: _error!,
                  ),
                if (_hint != null)
                  AuthMessageBanner(
                    key: const ValueKey('register-hint-banner'),
                    message: _hint!,
                    type: AuthBannerType.hint,
                  ),
                AppTextField(
                  key: const ValueKey('register-username'),
                  controller: _username,
                  label: '用户名',
                  placeholder: '字母、数字或下划线',
                  textInputAction: TextInputAction.next,
                  prefix: const AppIcon('user', size: 18),
                  enabled: !_busy,
                ),
                const SizedBox(height: AppSpacing.lg),
                CodeFieldRow(
                  field: AppTextField(
                    key: const ValueKey('register-email'),
                    controller: _email,
                    label: '工作邮箱',
                    placeholder: 'name@company.com',
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    prefix: const AppIcon('mail', size: 18),
                    enabled: !_busy,
                  ),
                  button: SendCodeButton(
                    key: const ValueKey('register-send-email-code'),
                    controller: _emailCountdown,
                    enabled: !_busy && _email.text.trim().isNotEmpty,
                    onPressed: () => _sendCode(AuthChannel.email),
                    idleLabel: '发验证码',
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                AppTextField(
                  key: const ValueKey('register-email-code'),
                  controller: _emailCode,
                  label: '邮箱验证码',
                  placeholder: '输入 6 位验证码',
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.next,
                  prefix: const AppIcon('lock', size: 18),
                  enabled: !_busy,
                ),
                const SizedBox(height: AppSpacing.lg),
                CodeFieldRow(
                  field: AppTextField(
                    key: const ValueKey('register-phone'),
                    controller: _phone,
                    label: '手机号（可选）',
                    placeholder: '手机号',
                    keyboardType: TextInputType.phone,
                    textInputAction: TextInputAction.next,
                    prefix: const AppIcon('phone', size: 18),
                    enabled: !_busy,
                  ),
                  button: SendCodeButton(
                    key: const ValueKey('register-send-phone-code'),
                    controller: _phoneCountdown,
                    enabled: !_busy && _phone.text.trim().isNotEmpty,
                    onPressed: () => _sendCode(AuthChannel.sms),
                    idleLabel: '发验证码',
                  ),
                ),
                if (_phone.text.trim().isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.lg),
                  AppTextField(
                    key: const ValueKey('register-phone-code'),
                    controller: _phoneCode,
                    label: '短信验证码',
                    placeholder: '输入短信验证码',
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.next,
                    prefix: const AppIcon('lock', size: 18),
                    enabled: !_busy,
                  ),
                ],
                const SizedBox(height: AppSpacing.lg),
                AppTextField(
                  key: const ValueKey('register-password'),
                  controller: _password,
                  label: '设置密码',
                  placeholder: '至少 6 位密码',
                  obscureText: _obscurePassword,
                  textInputAction: TextInputAction.next,
                  prefix: const AppIcon('lock', size: 18),
                  enabled: !_busy,
                  suffix: GestureDetector(
                    onTap: () =>
                        setState(() => _obscurePassword = !_obscurePassword),
                    child: Padding(
                      padding:
                          const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
                      child: AppIcon(
                        _obscurePassword ? 'eye' : 'eye-off',
                        size: 18,
                        color: AppColors.textTertiary,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                AppTextField(
                  key: const ValueKey('register-confirm'),
                  controller: _confirm,
                  label: '确认密码',
                  placeholder: '再次输入密码',
                  obscureText: _obscurePassword,
                  textInputAction: TextInputAction.done,
                  prefix: const AppIcon('lock', size: 18),
                  enabled: !_busy,
                ),
                const SizedBox(height: AppSpacing.xl),
                AppButton(
                  key: const ValueKey('register-submit'),
                  label: _busy ? '正在创建账号…' : '立即注册',
                  isFullWidth: true,
                  isLoading: _busy,
                  onPressed: _canSubmit ? _submit : null,
                ),
                const SizedBox(height: AppSpacing.md),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      '已有账号？',
                      style: TextStyle(
                        fontSize: 12,
                        color: isDark
                            ? AppColors.darkTextSecondary
                            : AppColors.textSecondary,
                      ),
                    ),
                    TextButton(
                      key: const ValueKey('register-to-login'),
                      onPressed: _backToLogin,
                      child: const Text('直接登录', style: TextStyle(fontSize: 12)),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
