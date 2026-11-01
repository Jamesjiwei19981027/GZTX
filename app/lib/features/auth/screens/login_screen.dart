import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../config/brand.dart';
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

/// 登录方式
enum LoginKind { password, code }

/// 登录页（账号密码登录 / 验证码免密登录）
///
/// 功能真源：`frontend/src/mobile/features/auth/MobileAuthScreens.tsx` 模式 01 与 79。
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.api});

  /// 测试注入用；生产从 `context.apiClient` 获取
  final AuthApi? api;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final TextEditingController _username = TextEditingController();
  final TextEditingController _password = TextEditingController();
  final TextEditingController _target = TextEditingController();
  final TextEditingController _code = TextEditingController();
  late final CountdownController _countdown = CountdownController();

  LoginKind _kind = LoginKind.password;
  bool _obscurePassword = true;
  bool _busy = false;
  String? _error;
  String? _hint;

  @override
  void initState() {
    super.initState();
    _username.addListener(_onFormChanged);
    _password.addListener(_onFormChanged);
    _target.addListener(_onFormChanged);
    _code.addListener(_onFormChanged);
  }

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    _target.dispose();
    _code.dispose();
    _countdown.dispose();
    super.dispose();
  }

  void _onFormChanged() {
    if (mounted) setState(() {});
  }

  AuthApi get _api => widget.api ?? AuthApi(context.read<AuthState>().api);

  void _clearMessages() {
    setState(() {
      _error = null;
      _hint = null;
    });
  }

  bool get _canSubmitPassword =>
      _username.text.trim().isNotEmpty && _password.text.isNotEmpty;

  bool get _canSubmitCode =>
      _target.text.trim().isNotEmpty && _code.text.trim().isNotEmpty;

  Future<void> _submitPassword() async {
    final username = _username.text.trim();
    final password = _password.text;
    if (username.isEmpty || password.isEmpty) {
      setState(() => _error = '请输入账号和密码');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _hint = null;
    });
    try {
      final session = await _api.loginWithPassword(
        username: username,
        password: password,
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

  Future<void> _submitCode() async {
    final target = _target.text.trim();
    final code = _code.text.trim();
    final channel = AuthValidators.detectChannel(target);
    if (channel == null) {
      setState(() => _error = '请输入有效的手机号或工作邮箱');
      return;
    }
    if (code.isEmpty) {
      setState(() => _error = '请输入验证码');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _hint = null;
    });
    try {
      final session = await _api.loginWithCode(
        channel: channel,
        target: target,
        code: code,
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

  Future<void> _sendLoginCode() async {
    _clearMessages();
    final target = _target.text.trim();
    final channel = AuthValidators.detectChannel(target);
    if (channel == null) {
      setState(() => _error = '请输入有效的手机号或邮箱后再获取验证码');
      return;
    }
    setState(() => _busy = true);
    try {
      final result = await _api.sendCode(
        channel: channel,
        target: target,
        purpose: SendCodePurpose.login,
      );
      if (!mounted) return;
      _countdown.start(result.resendAfterSeconds);
      setState(() {
        _hint = result.debugCode != null
            ? '验证码已发送（调试码: ${result.debugCode}）'
            : '验证码已发送至您的手机/邮箱';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = describeAuthError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _switchKind(LoginKind kind) {
    if (_kind == kind) return;
    setState(() {
      _kind = kind;
      _error = null;
      _hint = null;
    });
  }

  void _openRegister() {
    context.push(AuthPaths.register);
  }

  Future<void> _openForgotHelp() async {
    await showAppBottomSheet<void>(
      context: context,
      title: '找回密码说明',
      builder: (ctx) => SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.xl,
          AppSpacing.md,
          AppSpacing.xl,
          AppSpacing.xl,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              '当前系统支持以下重置或登录渠道：',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: AppSpacing.md),
            _helpItem(
              ctx,
              '免密验证码登录：',
              '如果您的账号已绑定手机号或工作邮箱，可直接通过「验证码登录」快捷进入工作区。',
            ),
            _helpItem(
              ctx,
              '管理员密码重置：',
              '企业或私有化部署环境下，系统管理员可在管理后台为您重置登录凭证。',
            ),
            _helpItem(
              ctx,
              '安全提示：',
              '平台不会通过不可信链接请求您提供明文密码。',
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              label: '使用验证码直接登录',
              isFullWidth: true,
              onPressed: () {
                Navigator.of(ctx).pop();
                _switchKind(LoginKind.code);
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _helpItem(BuildContext context, String title, String body) {
    final isDark = isDarkMode(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            body,
            style: TextStyle(
              fontSize: 13,
              height: 1.45,
              color: isDark
                  ? AppColors.darkTextSecondary
                  : AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return AppScaffold(
      title: Brand.name,
      body: SingleChildScrollView(
        // 键盘弹出时把内容顶起来，保证输入框不被遮挡
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
                _buildBrandHeader(context, isDark),
                if (_error != null)
                  AuthMessageBanner(
                    key: const ValueKey('login-error-banner'),
                    message: _error!,
                    type: AuthBannerType.error,
                  ),
                if (_hint != null)
                  AuthMessageBanner(
                    key: const ValueKey('login-hint-banner'),
                    message: _hint!,
                    type: AuthBannerType.hint,
                  ),
                const Text(
                  '欢迎回来',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  '登录后继续管理你的项目与任务',
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark
                        ? AppColors.darkTextSecondary
                        : AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                AppSegmentedControl<LoginKind>(
                  segments: const {
                    LoginKind.password: '账号密码登录',
                    LoginKind.code: '验证码免密登录',
                  },
                  selectedValue: _kind,
                  onValueChanged: _switchKind,
                ),
                const SizedBox(height: AppSpacing.xl),
                if (_kind == LoginKind.password)
                  _buildPasswordForm(context)
                else
                  _buildCodeForm(context),
                const SizedBox(height: AppSpacing.xl),
                _buildRegisterEntry(context, isDark),
                const SizedBox(height: AppSpacing.lg),
                Text(
                  '继续操作即代表您已同意使用规范与工作数据保护声明',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 11,
                    color: isDark
                        ? AppColors.darkTextTertiary
                        : AppColors.textTertiary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBrandHeader(BuildContext context, bool isDark) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xl),
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(AppSpacing.radiusLg),
            ),
            child: const Center(
              child: AppIcon('work', size: 30, color: AppColors.primary),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            Brand.name,
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w700,
              color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            Brand.tagline,
            style: TextStyle(
              fontSize: 12,
              color:
                  isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPasswordForm(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppTextField(
          key: const ValueKey('login-username'),
          controller: _username,
          label: '用户名 / 邮箱 / 手机号',
          placeholder: '请输入用户名、邮箱或手机号',
          keyboardType: TextInputType.text,
          textInputAction: TextInputAction.next,
          prefix: const AppIcon('user', size: 18),
          enabled: !_busy,
        ),
        const SizedBox(height: AppSpacing.lg),
        AppTextField(
          key: const ValueKey('login-password'),
          controller: _password,
          label: '登录密码',
          placeholder: '请输入登录密码',
          obscureText: _obscurePassword,
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _canSubmitPassword && !_busy
              ? _submitPassword()
              : null,
          prefix: const AppIcon('lock', size: 18),
          enabled: !_busy,
          suffix: _buildEyeToggle(),
        ),
        const SizedBox(height: AppSpacing.xs),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: _openForgotHelp,
            child: const Text('找回密码帮助', style: TextStyle(fontSize: 12)),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        AppButton(
          key: const ValueKey('login-submit-password'),
          label: _busy ? '正在登录…' : '登 录',
          isFullWidth: true,
          isLoading: _busy,
          onPressed: (_canSubmitPassword && !_busy) ? _submitPassword : null,
        ),
      ],
    );
  }

  Widget _buildCodeForm(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppTextField(
          key: const ValueKey('login-target'),
          controller: _target,
          label: '手机号 / 工作邮箱',
          placeholder: '例如 13800000000 或 work@corp.com',
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.next,
          prefix: const AppIcon('mail', size: 18),
          enabled: !_busy,
        ),
        const SizedBox(height: AppSpacing.lg),
        CodeFieldRow(
          field: AppTextField(
            key: const ValueKey('login-code'),
            controller: _code,
            label: '动态验证码',
            placeholder: '6 位数字验证码',
            keyboardType: TextInputType.number,
            textInputAction: TextInputAction.done,
            prefix: const AppIcon('lock', size: 18),
            enabled: !_busy,
          ),
          button: SendCodeButton(
            key: const ValueKey('login-send-code'),
            controller: _countdown,
            enabled: !_busy && _target.text.trim().isNotEmpty,
            onPressed: _sendLoginCode,
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        AppButton(
          key: const ValueKey('login-submit-code'),
          label: _busy ? '验证中…' : '验证并登录',
          isFullWidth: true,
          isLoading: _busy,
          onPressed: (_canSubmitCode && !_busy) ? _submitCode : null,
        ),
      ],
    );
  }

  Widget _buildEyeToggle() {
    return GestureDetector(
      onTap: () => setState(() => _obscurePassword = !_obscurePassword),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
        child: AppIcon(
          _obscurePassword ? 'eye' : 'eye-off',
          size: 18,
          color: AppColors.textTertiary,
        ),
      ),
    );
  }

  Widget _buildRegisterEntry(BuildContext context, bool isDark) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(
          '还没有账号？',
          style: TextStyle(
            fontSize: 12,
            color: isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
          ),
        ),
        TextButton(
          key: const ValueKey('login-to-register'),
          onPressed: _openRegister,
          child: const Text('立即注册新账号', style: TextStyle(fontSize: 12)),
        ),
      ],
    );
  }
}
