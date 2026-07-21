import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../widgets/common.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _username = TextEditingController();
  final _nickname = TextEditingController();
  final _email = TextEditingController();
  final _emailCode = TextEditingController();
  final _phone = TextEditingController();
  final _phoneCode = TextEditingController();
  final _password = TextEditingController();
  final _password2 = TextEditingController();
  bool _obscure = true;
  bool _sendingEmail = false;
  bool _sendingPhone = false;
  String? _debugCode;

  @override
  void dispose() {
    _username.dispose();
    _nickname.dispose();
    _email.dispose();
    _emailCode.dispose();
    _phone.dispose();
    _phoneCode.dispose();
    _password.dispose();
    _password2.dispose();
    super.dispose();
  }

  Future<void> _sendEmailCode() async {
    if (_email.text.trim().isEmpty) return;
    setState(() => _sendingEmail = true);
    try {
      final res = await context.read<AppState>().auth.sendCode(
            channel: 'email',
            target: _email.text,
            purpose: 'register',
          );
      _debugCode = res['debug_code']?.toString();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _debugCode == null
                  ? '验证码已发送'
                  : '验证码已发送（开发码：$_debugCode）',
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _sendingEmail = false);
    }
  }

  Future<void> _sendPhoneCode() async {
    if (_phone.text.trim().isEmpty) return;
    setState(() => _sendingPhone = true);
    try {
      final res = await context.read<AppState>().auth.sendCode(
            channel: 'sms',
            target: _phone.text,
            purpose: 'register',
          );
      final debug = res['debug_code']?.toString();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              debug == null ? '短信验证码已发送' : '短信已发送（开发码：$debug）',
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _sendingPhone = false);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final ok = await context.read<AppState>().register(
          username: _username.text,
          password: _password.text,
          email: _email.text,
          emailCode: _emailCode.text,
          nickname: _nickname.text,
          phone: _phone.text.trim().isEmpty ? null : _phone.text,
          phoneCode: _phoneCode.text.trim().isEmpty ? null : _phoneCode.text,
        );
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).popUntil((r) => r.isFirst);
      if (context.read<AppState>().needsVerification) {
        Navigator.of(context).pushNamed('/verify');
      }
    } else {
      showApiError(
        context,
        Exception(context.read<AppState>().error ?? '注册失败'),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final busy = context.watch<AppState>().busy;
    return Scaffold(
      appBar: AppBar(title: const Text('注册')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextFormField(
                      controller: _username,
                      decoration: const InputDecoration(
                        labelText: '用户名',
                        border: OutlineInputBorder(),
                      ),
                      validator: (v) =>
                          (v == null || v.trim().isEmpty) ? '必填' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _nickname,
                      decoration: const InputDecoration(
                        labelText: '昵称（可选）',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(
                        labelText: '邮箱',
                        border: OutlineInputBorder(),
                      ),
                      validator: (v) =>
                          (v == null || v.trim().isEmpty) ? '必填' : null,
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _emailCode,
                            decoration: const InputDecoration(
                              labelText: '邮箱验证码',
                              border: OutlineInputBorder(),
                            ),
                            validator: (v) =>
                                (v == null || v.trim().isEmpty) ? '必填' : null,
                          ),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton(
                          onPressed: _sendingEmail ? null : _sendEmailCode,
                          child: Text(_sendingEmail ? '发送中' : '发送'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                        labelText: '手机号（可选，建议注册后绑定）',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: TextFormField(
                            controller: _phoneCode,
                            decoration: const InputDecoration(
                              labelText: '短信验证码',
                              border: OutlineInputBorder(),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton(
                          onPressed: _sendingPhone ? null : _sendPhoneCode,
                          child: Text(_sendingPhone ? '发送中' : '发送'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _password,
                      obscureText: _obscure,
                      decoration: InputDecoration(
                        labelText: '密码',
                        border: const OutlineInputBorder(),
                        suffixIcon: IconButton(
                          icon: Icon(
                            _obscure ? Icons.visibility : Icons.visibility_off,
                          ),
                          onPressed: () => setState(() => _obscure = !_obscure),
                        ),
                      ),
                      validator: (v) =>
                          (v == null || v.length < 6) ? '至少 6 位' : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _password2,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: '确认密码',
                        border: OutlineInputBorder(),
                      ),
                      validator: (v) =>
                          v != _password.text ? '两次密码不一致' : null,
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: busy ? null : _submit,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        child: Text(busy ? '提交中…' : '注册'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
