import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../../core/auth/auth_state.dart';
import '../../../design/design.dart';
import '../auth_paths.dart';
import '../data/auth_api.dart';
import '../models/auth_models.dart';
import '../utils/auth_error_message.dart';
import '../utils/auth_validators.dart';
import '../utils/countdown_controller.dart';
import '../widgets/auth_message_banner.dart';
import '../widgets/code_field_row.dart';
import '../widgets/send_code_button.dart';

class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen(
      {super.key, this.api, this.initialTarget = '', this.onReset});
  final AuthApi? api;
  final String initialTarget;
  final ValueChanged<String>? onReset;

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  late final _target = TextEditingController(text: widget.initialTarget);
  final _code = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  final _countdown = CountdownController();
  bool _busy = false;
  String? _error;
  String? _hint;
  AuthApi get _api => widget.api ?? AuthApi(context.read<AuthState>().api);

  @override
  void dispose() {
    _target.dispose();
    _code.dispose();
    _password.dispose();
    _confirm.dispose();
    _countdown.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    if (_busy) return;
    final channel = AuthValidators.detectChannel(_target.text);
    if (channel == null) {
      setState(() => _error = '请输入注册时使用的邮箱或手机号');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _hint = null;
    });
    try {
      final result = await _api.sendCode(
          channel: channel,
          target: _target.text.trim(),
          purpose: SendCodePurpose.resetPassword);
      if (!mounted) return;
      _countdown.start(result.resendAfterSeconds);
      setState(() => _hint = '如果该账号存在，验证码已发送，请查收');
    } catch (error) {
      if (mounted) setState(() => _error = describeAuthError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    if (_busy) return;
    final channel = AuthValidators.detectChannel(_target.text);
    final error = channel == null
        ? '请输入注册时使用的邮箱或手机号'
        : _code.text.trim().isEmpty
            ? '请输入验证码'
            : AuthValidators.validatePassword(_password.text) ??
                (_password.text != _confirm.text ? '两次输入的密码不一致' : null);
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _hint = null;
    });
    try {
      await _api.resetPassword(
          channel: channel!,
          target: _target.text,
          code: _code.text,
          newPassword: _password.text);
      if (!mounted) return;
      if (widget.onReset != null) {
        widget.onReset!(_target.text.trim());
      } else if (context.canPop()) {
        context.pop(_target.text.trim());
      } else {
        context.go(AuthPaths.login);
      }
    } catch (error) {
      if (mounted) setState(() => _error = describeAuthError(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AppScaffold(
        title: '重置密码',
        body: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
              AppSpacing.xl,
              AppSpacing.lg,
              AppSpacing.xl,
              AppSpacing.xl + MediaQuery.viewInsetsOf(context).bottom),
          child: Center(
              child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 460),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('验证注册邮箱或手机号后设置新密码'),
                  const SizedBox(height: AppSpacing.lg),
                  if (_error != null) AuthMessageBanner(message: _error!),
                  if (_hint != null)
                    AuthMessageBanner(
                        message: _hint!, type: AuthBannerType.hint),
                  AppTextField(
                      key: const ValueKey('reset-target'),
                      controller: _target,
                      label: '邮箱 / 手机号',
                      keyboardType: TextInputType.emailAddress,
                      enabled: !_busy),
                  const SizedBox(height: AppSpacing.lg),
                  CodeFieldRow(
                      field: AppTextField(
                          key: const ValueKey('reset-code'),
                          controller: _code,
                          label: '验证码',
                          keyboardType: TextInputType.number,
                          enabled: !_busy),
                      button: SendCodeButton(
                          key: const ValueKey('reset-send-code'),
                          controller: _countdown,
                          enabled: !_busy,
                          onPressed: _sendCode)),
                  const SizedBox(height: AppSpacing.lg),
                  AppTextField(
                      key: const ValueKey('reset-new-password'),
                      controller: _password,
                      label: '新密码',
                      obscureText: true,
                      enabled: !_busy),
                  const SizedBox(height: AppSpacing.lg),
                  AppTextField(
                      key: const ValueKey('reset-confirm-password'),
                      controller: _confirm,
                      label: '确认新密码',
                      obscureText: true,
                      enabled: !_busy),
                  const SizedBox(height: AppSpacing.xl),
                  AppButton(
                      key: const ValueKey('reset-submit'),
                      label: '重置密码',
                      isFullWidth: true,
                      isLoading: _busy,
                      onPressed: _busy ? null : _submit),
                ]),
          )),
        ),
      );
}
