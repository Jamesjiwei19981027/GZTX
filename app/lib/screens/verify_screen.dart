import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../widgets/common.dart';

class VerifyScreen extends StatefulWidget {
  const VerifyScreen({super.key});

  @override
  State<VerifyScreen> createState() => _VerifyScreenState();
}

class _VerifyScreenState extends State<VerifyScreen> {
  final _email = TextEditingController();
  final _emailCode = TextEditingController();
  final _phone = TextEditingController();
  final _phoneCode = TextEditingController();
  bool _busy = false;
  Map<String, dynamic>? _status;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _email.dispose();
    _emailCode.dispose();
    _phone.dispose();
    _phoneCode.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final state = context.read<AppState>();
    _email.text = state.user?.email ?? '';
    _phone.text = state.user?.phone ?? '';
    try {
      final status = await state.auth.verificationStatus();
      if (mounted) setState(() => _status = status);
    } catch (e) {
      if (mounted) showApiError(context, e);
    }
  }

  Future<void> _send(String channel) async {
    final target = channel == 'email' ? _email.text : _phone.text;
    if (target.trim().isEmpty) return;
    setState(() => _busy = true);
    try {
      final res = await context.read<AppState>().auth.sendVerificationCode(
            channel: channel,
            target: target,
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
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirm(String channel) async {
    final target = channel == 'email' ? _email.text : _phone.text;
    final code = channel == 'email' ? _emailCode.text : _phoneCode.text;
    if (target.trim().isEmpty || code.trim().isEmpty) return;
    setState(() => _busy = true);
    try {
      final state = context.read<AppState>();
      await state.auth.confirmVerification(
        channel: channel,
        target: target,
        code: code,
      );
      await state.refreshMe();
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(channel == 'email' ? '邮箱已验证' : '手机已验证')),
      );
      if (!state.needsVerification) {
        Navigator.of(context).pop();
      }
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AppState>().user;
    return Scaffold(
      appBar: AppBar(title: const Text('账号验证')),
      body: BusyBarrier(
        busy: _busy,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              color: Theme.of(context).colorScheme.secondaryContainer,
              child: const ListTile(
                leading: Icon(Icons.info_outline),
                title: Text('创建任务、提交材料、智能体对话需要邮箱与手机均已验证'),
              ),
            ),
            const SectionHeader('当前状态'),
            Card(
              child: ListTile(
                title: Text(user?.displayName ?? ''),
                subtitle: Text([
                  '邮箱：${user?.email ?? '-'} '
                      '${user?.emailVerified == true ? '✓' : '未验证'}',
                  '手机：${user?.phone ?? '-'} '
                      '${user?.phoneVerified == true ? '✓' : '未验证'}',
                  if (_status != null) '接口：$_status',
                ].join('\n')),
                isThreeLine: true,
              ),
            ),
            const SectionHeader('绑定/验证邮箱'),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(
                labelText: '邮箱',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _emailCode,
                    decoration: const InputDecoration(
                      labelText: '验证码',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: () => _send('email'),
                  child: const Text('发送'),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: () => _confirm('email'),
                  child: const Text('确认'),
                ),
              ],
            ),
            const SectionHeader('绑定/验证手机'),
            TextField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: '手机号',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _phoneCode,
                    decoration: const InputDecoration(
                      labelText: '验证码',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: () => _send('sms'),
                  child: const Text('发送'),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: () => _confirm('sms'),
                  child: const Text('确认'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
