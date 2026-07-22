import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _nick = TextEditingController();
  final _smtpHost = TextEditingController();
  final _smtpPort = TextEditingController(text: '465');
  final _smtpUser = TextEditingController();
  final _smtpFrom = TextEditingController();
  final _smtpPass = TextEditingController();
  final _llmProvider = TextEditingController(text: 'openai');
  final _llmBase = TextEditingController();
  final _llmModel = TextEditingController();
  final _llmKey = TextEditingController();
  final _agentName = TextEditingController();
  final _agentPrompt = TextEditingController();

  SmtpConfig? _smtp;
  LlmConfig? _llm;
  List<AgentItem> _agents = [];
  bool _loading = true;
  bool _busy = false;
  bool _llmEnabled = true;
  bool _useAgent = true;
  bool _useJudge = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _nick.dispose();
    _smtpHost.dispose();
    _smtpPort.dispose();
    _smtpUser.dispose();
    _smtpFrom.dispose();
    _smtpPass.dispose();
    _llmProvider.dispose();
    _llmBase.dispose();
    _llmModel.dispose();
    _llmKey.dispose();
    _agentName.dispose();
    _agentPrompt.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final state = context.read<AppState>();
    setState(() => _loading = true);
    try {
      _nick.text = state.user?.nickname ?? state.user?.username ?? '';
      final smtp = await state.notifications.getSmtp();
      final llm = await state.notifications.getLlm();
      List<AgentItem> agents = [];
      if (state.currentCompany != null) {
        agents = await state.collab.listAgents(state.currentCompany!.id);
      }
      _smtp = smtp;
      _llm = llm;
      _agents = agents;
      _smtpHost.text = smtp.host;
      _smtpPort.text = '${smtp.port}';
      _smtpUser.text = smtp.user;
      _smtpFrom.text = smtp.from;
      _llmProvider.text = llm.provider;
      _llmBase.text = llm.baseUrl;
      _llmModel.text = llm.model;
      _llmEnabled = llm.enabled;
      _useAgent = llm.useForAgent;
      _useJudge = llm.useForJudge;
    } catch (e) {
      if (mounted) showApiError(context, e, '加载设置失败');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _saveProfile() async {
    setState(() => _busy = true);
    final state = context.read<AppState>();
    try {
      await state.auth.updateProfile(nickname: _nick.text);
      await state.refreshMe();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('资料已保存')),
      );
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _saveSmtp() async {
    setState(() => _busy = true);
    try {
      _smtp = await context.read<AppState>().notifications.saveSmtp(
            host: _smtpHost.text,
            port: int.tryParse(_smtpPort.text) ?? 465,
            user: _smtpUser.text,
            from: _smtpFrom.text,
            password: _smtpPass.text,
          );
      _smtpPass.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('邮件配置已保存')),
        );
      }
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _testSmtp() async {
    setState(() => _busy = true);
    try {
      await context.read<AppState>().notifications.testEmail();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('测试邮件已发送')),
        );
      }
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _saveLlm() async {
    setState(() => _busy = true);
    try {
      _llm = await context.read<AppState>().notifications.saveLlm(
            provider: _llmProvider.text,
            baseUrl: _llmBase.text,
            model: _llmModel.text,
            enabled: _llmEnabled,
            useForAgent: _useAgent,
            useForJudge: _useJudge,
            apiKey: _llmKey.text,
          );
      _llmKey.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('大模型配置已保存')),
        );
      }
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _testLlm() async {
    setState(() => _busy = true);
    try {
      final res = await context.read<AppState>().notifications.testLlm();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(res['content']?.toString() ?? '大模型测试成功')),
        );
      }
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _createAgent() async {
    final company = context.read<AppState>().currentCompany;
    if (company == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('请先选择公司')),
      );
      return;
    }
    final name = _agentName.text.trim();
    if (name.isEmpty) return;
    setState(() => _busy = true);
    try {
      final agent = await context.read<AppState>().collab.createAgent(
            companyId: company.id,
            name: name,
            systemPrompt: _agentPrompt.text,
          );
      _agentName.clear();
      _agentPrompt.clear();
      setState(() => _agents = [..._agents, agent]);
    } catch (e) {
      if (mounted) {
        showApiError(context, e);
        await maybeOpenVerify(context, e);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _deleteAgent(AgentItem agent) async {
    try {
      await context.read<AppState>().collab.deleteAgent(agent.id);
      setState(() => _agents = _agents.where((a) => a.id != agent.id).toList());
    } catch (e) {
      if (mounted) showApiError(context, e);
    }
  }

  Future<void> _changePassword() async {
    final oldCtrl = TextEditingController();
    final newCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('修改密码'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: oldCtrl,
              obscureText: true,
              decoration: const InputDecoration(labelText: '原密码'),
            ),
            TextField(
              controller: newCtrl,
              obscureText: true,
              decoration: const InputDecoration(labelText: '新密码'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('确定')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await context.read<AppState>().auth.changePassword(
            oldPassword: oldCtrl.text,
            newPassword: newCtrl.text,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('密码已更新')),
        );
      }
    } catch (e) {
      if (mounted) showApiError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final personalAgents =
        _agents.where((a) => a.kind == 'user_created').toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('设置'),
        actions: [
          IconButton(onPressed: _busy ? null : _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : BusyBarrier(
              busy: _busy,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                children: [
                  const SectionHeader('账号'),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        children: [
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(state.user?.username ?? ''),
                            subtitle: Text([
                              if (state.user?.email != null) state.user!.email!,
                              if (state.user?.phone != null) state.user!.phone!,
                              state.user?.emailVerified == true ? '邮箱已验证' : '邮箱未验证',
                              state.user?.phoneVerified == true ? '手机已验证' : '手机未验证',
                            ].join(' · ')),
                          ),
                          TextField(
                            controller: _nick,
                            decoration: const InputDecoration(
                              labelText: '昵称',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              FilledButton(
                                onPressed: _saveProfile,
                                child: const Text('保存资料'),
                              ),
                              const SizedBox(width: 8),
                              OutlinedButton(
                                onPressed: _changePassword,
                                child: const Text('改密码'),
                              ),
                              const SizedBox(width: 8),
                              OutlinedButton(
                                onPressed: () =>
                                    Navigator.of(context).pushNamed('/verify'),
                                child: const Text('验证'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SectionHeader('公司'),
                  Card(
                    child: Column(
                      children: [
                        if (state.companies.isEmpty)
                          const ListTile(title: Text('暂无公司成员身份'))
                        else
                          ...state.companies.map(
                            (c) => ListTile(
                              leading: Icon(
                                state.currentCompany?.id == c.id
                                    ? Icons.radio_button_checked
                                    : Icons.radio_button_off,
                              ),
                              title: Text(c.name),
                              subtitle: Text(c.slug ?? ''),
                              onTap: () => state.selectCompany(c),
                            ),
                          ),
                        ListTile(
                          leading: const Icon(Icons.business),
                          title: const Text('公司设置'),
                          trailing: const Icon(Icons.chevron_right),
                          onTap: () => Navigator.of(context).pushNamed('/company'),
                        ),
                      ],
                    ),
                  ),
                  const SectionHeader('个人邮件（SMTP）'),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        children: [
                          TextField(
                            controller: _smtpHost,
                            decoration: const InputDecoration(
                              labelText: '服务器地址',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _smtpPort,
                            keyboardType: TextInputType.number,
                            decoration: const InputDecoration(
                              labelText: '端口',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _smtpUser,
                            decoration: const InputDecoration(
                              labelText: '用户名',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _smtpFrom,
                            decoration: const InputDecoration(
                              labelText: '发件人',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _smtpPass,
                            obscureText: true,
                            decoration: InputDecoration(
                              labelText: _smtp?.hasPassword == true
                                  ? '密码（留空保持）'
                                  : '密码',
                              border: const OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              FilledButton(
                                onPressed: _saveSmtp,
                                child: const Text('保存'),
                              ),
                              const SizedBox(width: 8),
                              OutlinedButton(
                                onPressed: _testSmtp,
                                child: const Text('发测试邮件'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SectionHeader('个人大模型'),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        children: [
                          SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            title: const Text('启用'),
                            value: _llmEnabled,
                            onChanged: (v) => setState(() => _llmEnabled = v),
                          ),
                          TextField(
                            controller: _llmProvider,
                            decoration: const InputDecoration(
                              labelText: '服务商',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _llmBase,
                            decoration: const InputDecoration(
                              labelText: '接口地址',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _llmModel,
                            decoration: const InputDecoration(
                              labelText: '模型',
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _llmKey,
                            obscureText: true,
                            decoration: InputDecoration(
                              labelText: _llm?.hasApiKey == true
                                  ? '密钥（留空则保持原值）'
                                  : '接口密钥',
                              border: const OutlineInputBorder(),
                            ),
                          ),
                          SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            title: const Text('用于智能体'),
                            value: _useAgent,
                            onChanged: (v) => setState(() => _useAgent = v),
                          ),
                          SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            title: const Text('用于评判'),
                            value: _useJudge,
                            onChanged: (v) => setState(() => _useJudge = v),
                          ),
                          Row(
                            children: [
                              FilledButton(
                                onPressed: _saveLlm,
                                child: const Text('保存'),
                              ),
                              const SizedBox(width: 8),
                              OutlinedButton(
                                onPressed: _testLlm,
                                child: const Text('测试'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SectionHeader('个人智能体'),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (state.currentCompany == null)
                            const Text('选择公司后可管理个人智能体')
                          else ...[
                            TextField(
                              controller: _agentName,
                              decoration: const InputDecoration(
                                labelText: '名称',
                                border: OutlineInputBorder(),
                              ),
                            ),
                            const SizedBox(height: 8),
                            TextField(
                              controller: _agentPrompt,
                              maxLines: 3,
                              decoration: const InputDecoration(
                                labelText: '系统提示词',
                                border: OutlineInputBorder(),
                              ),
                            ),
                            const SizedBox(height: 8),
                            FilledButton(
                              onPressed: _createAgent,
                              child: const Text('创建智能体'),
                            ),
                            const Divider(),
                            if (personalAgents.isEmpty)
                              const Text('暂无个人智能体')
                            else
                              ...personalAgents.map(
                                (a) => ListTile(
                                  contentPadding: EdgeInsets.zero,
                                  title: Text(a.name),
                                  subtitle: Text(a.scene),
                                  trailing: IconButton(
                                    icon: const Icon(Icons.delete_outline),
                                    onPressed: () => _deleteAgent(a),
                                  ),
                                  onTap: () => Navigator.of(context).pushNamed(
                                    '/agents/chat',
                                    arguments: {
                                      'agentId': a.id,
                                      'agentName': a.name,
                                    },
                                  ),
                                ),
                              ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: () => state.logout(),
                    icon: const Icon(Icons.logout),
                    label: const Text('退出登录'),
                  ),
                ],
              ),
            ),
    );
  }
}
