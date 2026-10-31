import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/api_config.dart';
import '../config/brand.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  final _userCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _codeTarget = TextEditingController();
  final _codeCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _obscure = true;
  String _channel = 'email';
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    _userCtrl.dispose();
    _passCtrl.dispose();
    _codeTarget.dispose();
    _codeCtrl.dispose();
    super.dispose();
  }

  Future<void> _submitPassword() async {
    if (!_formKey.currentState!.validate()) return;
    final ok = await context.read<AppState>().login(
          _userCtrl.text,
          _passCtrl.text,
        );
    if (!ok && mounted) {
      showApiError(
        context,
        Exception(context.read<AppState>().error ?? '登录失败'),
      );
    }
  }

  Future<void> _sendLoginCode() async {
    if (_codeTarget.text.trim().isEmpty) return;
    setState(() => _sending = true);
    try {
      final res = await context.read<AppState>().auth.sendCode(
            channel: _channel,
            target: _codeTarget.text,
            purpose: 'login',
          );
      final debug = res['debug_code']?.toString();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              debug == null ? '验证码已发送' : '验证码已发送（开发码：$debug）',
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _submitCode() async {
    final ok = await context.read<AppState>().loginWithCode(
          channel: _channel,
          target: _codeTarget.text,
          code: _codeCtrl.text,
        );
    if (!ok && mounted) {
      showApiError(
        context,
        Exception(context.read<AppState>().error ?? '登录失败'),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final busy = context.watch<AppState>().busy;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              children: [
                const SizedBox(height: 24),
                const Icon(Icons.task_alt, size: 64, color: Color(0xFF2563EB)),
                const SizedBox(height: 12),
                Text(
                  Brand.name,
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 4),
                Text(
                  Brand.tagline,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
                const SizedBox(height: 16),
                TabBar(
                  controller: _tabs,
                  tabs: const [
                    Tab(text: '密码登录'),
                    Tab(text: '验证码登录'),
                  ],
                ),
                Expanded(
                  child: TabBarView(
                    controller: _tabs,
                    children: [
                      SingleChildScrollView(
                        padding: const EdgeInsets.all(24),
                        child: Form(
                          key: _formKey,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              TextFormField(
                                controller: _userCtrl,
                                textInputAction: TextInputAction.next,
                                decoration: const InputDecoration(
                                  labelText: '账号',
                                  hintText: '用户名 / 邮箱 / 手机号',
                                  border: OutlineInputBorder(),
                                ),
                                validator: (v) => (v == null || v.trim().isEmpty)
                                    ? '请输入账号'
                                    : null,
                              ),
                              const SizedBox(height: 16),
                              TextFormField(
                                controller: _passCtrl,
                                obscureText: _obscure,
                                onFieldSubmitted: (_) => _submitPassword(),
                                decoration: InputDecoration(
                                  labelText: '密码',
                                  border: const OutlineInputBorder(),
                                  suffixIcon: IconButton(
                                    icon: Icon(
                                      _obscure
                                          ? Icons.visibility
                                          : Icons.visibility_off,
                                    ),
                                    onPressed: () =>
                                        setState(() => _obscure = !_obscure),
                                  ),
                                ),
                                validator: (v) =>
                                    (v == null || v.isEmpty) ? '请输入密码' : null,
                              ),
                              const SizedBox(height: 24),
                              FilledButton(
                                onPressed: busy ? null : _submitPassword,
                                child: Padding(
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 12),
                                  child: busy
                                      ? const SizedBox(
                                          height: 20,
                                          width: 20,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                        )
                                      : const Text('登录'),
                                ),
                              ),
                              TextButton(
                                onPressed: () =>
                                    Navigator.of(context).pushNamed('/register'),
                                child: const Text('没有账号？去注册'),
                              ),
                            ],
                          ),
                        ),
                      ),
                      SingleChildScrollView(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            SegmentedButton<String>(
                              segments: const [
                                ButtonSegment(
                                  value: 'email',
                                  label: Text('邮箱'),
                                ),
                                ButtonSegment(
                                  value: 'sms',
                                  label: Text('手机'),
                                ),
                              ],
                              selected: {_channel},
                              onSelectionChanged: (s) =>
                                  setState(() => _channel = s.first),
                            ),
                            const SizedBox(height: 16),
                            TextField(
                              controller: _codeTarget,
                              decoration: InputDecoration(
                                labelText: _channel == 'email' ? '邮箱' : '手机号',
                                border: const OutlineInputBorder(),
                              ),
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: TextField(
                                    controller: _codeCtrl,
                                    decoration: const InputDecoration(
                                      labelText: '验证码',
                                      border: OutlineInputBorder(),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                OutlinedButton(
                                  onPressed: _sending ? null : _sendLoginCode,
                                  child: Text(_sending ? '发送中' : '发送'),
                                ),
                              ],
                            ),
                            const SizedBox(height: 24),
                            FilledButton(
                              onPressed: busy ? null : _submitCode,
                              child: Padding(
                                padding:
                                    const EdgeInsets.symmetric(vertical: 12),
                                child: Text(busy ? '登录中…' : '登录'),
                              ),
                            ),
                            TextButton(
                              onPressed: () =>
                                  Navigator.of(context).pushNamed('/register'),
                              child: const Text('没有账号？去注册'),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                // 后端地址属调试信息，不该展示给最终用户（还会暴露内网地址）。
                // 仅 debug 构建可见，release 包里不渲染。
                if (kDebugMode)
                  Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(
                      'API: ${ApiConfig.baseUrl}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
