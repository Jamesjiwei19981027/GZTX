import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../config/brand.dart';
import '../../../core/auth/auth_state.dart';
import '../../../design/design.dart';
import '../auth_paths.dart';
import '../data/auth_api.dart';
import '../data/auth_flow.dart';
import '../data/native_sso.dart';
import '../models/auth_models.dart';
import '../utils/auth_error_message.dart';
import '../utils/auth_validators.dart';
import '../utils/countdown_controller.dart';
import '../widgets/auth_message_banner.dart';
import '../widgets/code_field_row.dart';
import '../widgets/send_code_button.dart';
import '../../projects/invite_link.dart';

/// 登录方式
enum LoginKind { password, code }

/// 登录页（账号密码登录 / 验证码免密登录）
///
/// 与网页正式 LoginGate 共用认证接口与企业登录开关。
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.api, this.companyId, this.sso});

  /// 测试注入用；生产从 `context.apiClient` 获取
  final AuthApi? api;
  final int? companyId;
  final NativeSso? sso;

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
  RegistrationConfig _regConfig = const RegistrationConfig();
  bool _obscurePassword = true;
  bool _busy = false;
  String? _error;
  String? _hint;
  bool _configLoading = false;
  String? _configError;
  bool _configPrepared = false;
  int _configRequest = 0;
  int? _dingtalkCompanyId;

  bool get _passwordAllowed =>
      !_configLoading && _configError == null && _regConfig.passwordEnabled;
  bool get _codeAllowed =>
      !_configLoading && _configError == null && _regConfig.codeEnabled;

  @override
  void initState() {
    super.initState();
    _username.addListener(_onFormChanged);
    _password.addListener(_onFormChanged);
    _target.addListener(_onFormChanged);
    _code.addListener(_onFormChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadRegistrationConfig();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_configPrepared) {
      _configPrepared = true;
      _configLoading = _api != null;
    }
  }

  @override
  void didUpdateWidget(covariant LoginScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.companyId != widget.companyId ||
        oldWidget.api != widget.api) {
      _loadRegistrationConfig();
    }
  }

  Future<void> _loadRegistrationConfig() async {
    final version = ++_configRequest;
    final api = _api;
    if (api == null) return;
    setState(() {
      _configLoading = true;
      _configError = null;
      _dingtalkCompanyId = null;
    });
    try {
      final cfg = await api.fetchRegistrationConfig(
          companyId: widget.companyId ?? _authState?.currentCompany?.id);
      int? dingtalkCompany;
      if (cfg.loginMethods['dingtalk'] == true) {
        try {
          dingtalkCompany = await api.availableDingtalkCompany(
              companyId: widget.companyId ?? _authState?.currentCompany?.id);
        } catch (_) {/* 配置不可用时隐藏企业入口，保留其他可用登录方式。 */}
      }
      if (!mounted || version != _configRequest) return;
      setState(() {
        _regConfig = cfg;
        _dingtalkCompanyId = dingtalkCompany;
        _configLoading = false;
        if (!cfg.passwordEnabled && cfg.codeEnabled) _kind = LoginKind.code;
        if (!cfg.codeEnabled && cfg.passwordEnabled) _kind = LoginKind.password;
      });
    } catch (e) {
      if (!mounted || version != _configRequest) return;
      setState(() {
        _configLoading = false;
        _configError = '无法读取企业登录方式，请重试或联系管理员';
      });
    }
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

  AuthState? get _authState {
    try {
      return Provider.of<AuthState>(context, listen: false);
    } catch (_) {
      return null;
    }
  }

  AuthApi? get _api {
    if (widget.api != null) return widget.api;
    final auth = _authState;
    if (auth != null) return AuthApi(auth.api);
    return null;
  }

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
    if (!_passwordAllowed || _busy) return;
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
    final api = _api;
    if (api == null) return;
    try {
      final session = await api.loginWithPassword(
        username: username,
        password: password,
      );
      if (!mounted) return;
      final auth = _authState;
      if (auth != null) {
        await AuthFlow(auth).completeSignInAndEnter(context, session);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = describeAuthError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitCode() async {
    if (!_codeAllowed || _busy) return;
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
    final api = _api;
    if (api == null) return;
    try {
      final session = await api.loginWithCode(
        channel: channel,
        target: target,
        code: code,
      );
      if (!mounted) return;
      final auth = _authState;
      if (auth != null) {
        await AuthFlow(auth).completeSignInAndEnter(context, session);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = describeAuthError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendLoginCode() async {
    if (!_codeAllowed || _busy) return;
    _clearMessages();
    final target = _target.text.trim();
    final channel = AuthValidators.detectChannel(target);
    if (channel == null) {
      setState(() => _error = '请输入有效的手机号或邮箱后再获取验证码');
      return;
    }
    final api = _api;
    if (api == null) return;
    setState(() => _busy = true);
    try {
      final result = await api.sendCode(
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
    if ((kind == LoginKind.password && !_passwordAllowed) ||
        (kind == LoginKind.code && !_codeAllowed)) {
      return;
    }
    if (_kind == kind) return;
    setState(() {
      _kind = kind;
      _error = null;
      _hint = null;
    });
  }

  String? _resolveInviteToken() {
    return PendingInviteHolder.token ?? _authState?.pendingInviteToken;
  }

  void _openRegister() {
    final invite = _resolveInviteToken();
    if (invite != null && invite.isNotEmpty) {
      context.push('${AuthPaths.register}?invite=$invite');
    } else {
      context.push(AuthPaths.register);
    }
  }

  Future<void> _openForgotHelp() async {
    final result = await context.push<String>(Uri(
        path: AuthPaths.resetPassword,
        queryParameters: {'target': _username.text.trim()}).toString());
    if (!mounted || result == null) return;
    setState(() {
      _username.text = result;
      _password.clear();
      _kind = LoginKind.password;
      _error = null;
      _hint = '密码已重置，请使用新密码登录';
    });
  }

  Future<void> _startDingtalk() async {
    if (_busy || _dingtalkCompanyId == null || _api == null) return;
    setState(() {
      _busy = true;
      _error = null;
      _hint = null;
    });
    try {
      await (widget.sso ?? NativeSso(_api!)).begin(_dingtalkCompanyId!);
      if (mounted) setState(() => _hint = '请在系统浏览器完成钉钉授权，然后返回应用');
    } catch (error) {
      if (mounted) setState(() => _error = describeAuthError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return AppScaffold(
      // 登录页不显示导航栏标题：页面中部已有品牌大标题，顶部再放一个
      // “烂笔头” 会重复。不传 title 即不渲染导航栏（AppScaffold 的约定）。
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
                if (_configLoading) const Center(child: AppLoading()),
                if (_configError != null) ...[
                  AuthMessageBanner(
                      message: _configError!, type: AuthBannerType.error),
                  AppButton(
                      label: '重新读取登录方式', onPressed: _loadRegistrationConfig),
                ],
                if (_passwordAllowed && _codeAllowed)
                  AppSegmentedControl<LoginKind>(
                    segments: const {
                      LoginKind.password: '账号密码登录',
                      LoginKind.code: '验证码免密登录',
                    },
                    selectedValue: _kind,
                    onValueChanged: _switchKind,
                  ),
                const SizedBox(height: AppSpacing.xl),
                if (_kind == LoginKind.password && _passwordAllowed)
                  _buildPasswordForm(context)
                else if (_kind == LoginKind.code && _codeAllowed)
                  _buildCodeForm(context),
                if (!_configLoading &&
                    _configError == null &&
                    !_passwordAllowed &&
                    !_codeAllowed &&
                    _dingtalkCompanyId == null)
                  const AuthMessageBanner(
                      message: '当前企业未开放本页支持的登录方式，请联系管理员使用企业登录入口',
                      type: AuthBannerType.hint),
                if (_dingtalkCompanyId != null) ...[
                  const SizedBox(height: AppSpacing.lg),
                  AppButton(
                      key: const ValueKey('login-dingtalk'),
                      label: '钉钉登录',
                      isFullWidth: true,
                      isLoading: _busy,
                      onPressed: _busy ? null : _startDingtalk),
                ],
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
              color: isDark
                  ? AppColors.darkTextSecondary
                  : AppColors.textSecondary,
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
          onSubmitted: (_) =>
              _canSubmitPassword && !_busy ? _submitPassword() : null,
          prefix: const AppIcon('lock', size: 18),
          enabled: !_busy,
          suffix: _buildEyeToggle(),
        ),
        const SizedBox(height: AppSpacing.xs),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: _openForgotHelp,
            child: const Text('忘记密码', style: TextStyle(fontSize: 12)),
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
    final inviteToken = _resolveInviteToken();
    final bool isInviteOnly = _regConfig.isInviteOnly;
    final bool canRegister =
        !isInviteOnly || (inviteToken != null && inviteToken.isNotEmpty);

    if (!canRegister) {
      return Text(
        '仅限受邀注册，请向管理员索取邀请链接',
        key: const ValueKey('login-invite-only-hint'),
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 12,
          color: isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
        ),
      );
    }

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(
          '还没有账号？',
          style: TextStyle(
            fontSize: 12,
            color:
                isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
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
