import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/common.dart';

class CompanySettingsScreen extends StatefulWidget {
  const CompanySettingsScreen({super.key});

  @override
  State<CompanySettingsScreen> createState() => _CompanySettingsScreenState();
}

class _CompanySettingsScreenState extends State<CompanySettingsScreen> {
  final _smtpHost = TextEditingController();
  final _smtpPort = TextEditingController(text: '465');
  final _smtpUser = TextEditingController();
  final _smtpFrom = TextEditingController();
  final _smtpPass = TextEditingController();
  final _llmProvider = TextEditingController();
  final _llmBase = TextEditingController();
  final _llmModel = TextEditingController();
  final _llmKey = TextEditingController();

  Map<String, dynamic>? _raw;
  Map<String, dynamic>? _features;
  Map<String, dynamic>? _org;
  Map<String, dynamic>? _bindings;
  SmtpConfig? _smtp;
  LlmConfig? _llm;
  Map<String, bool> _loginMethods = {};
  bool _loading = true;
  bool _busy = false;
  bool _llmEnabled = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _smtpHost.dispose();
    _smtpPort.dispose();
    _smtpUser.dispose();
    _smtpFrom.dispose();
    _smtpPass.dispose();
    _llmProvider.dispose();
    _llmBase.dispose();
    _llmModel.dispose();
    _llmKey.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final state = context.read<AppState>();
    final company = state.currentCompany;
    if (company == null) {
      setState(() => _loading = false);
      return;
    }
    setState(() => _loading = true);
    try {
      final raw = await state.collab.getCompanyRaw(company.id);
      final smtp = await state.collab.getCompanySmtp(company.id);
      final llm = await state.collab.getCompanyLlm(company.id);
      Map<String, dynamic>? features;
      Map<String, dynamic>? org;
      Map<String, dynamic>? bindings;
      try {
        features = await state.collab.companyFeatures(company.id);
      } catch (_) {}
      try {
        org = await state.collab.orgTree(company.id);
      } catch (_) {}
      try {
        bindings = await state.collab.bindings(company.id);
      } catch (_) {}

      final methods = <String, bool>{};
      final lm = raw['login_methods'];
      if (lm is Map) {
        lm.forEach((k, v) => methods['$k'] = v == true);
      }

      _raw = raw;
      _smtp = smtp;
      _llm = llm;
      _features = features;
      _org = org;
      _bindings = bindings;
      _loginMethods = methods;
      _smtpHost.text = smtp.host;
      _smtpPort.text = '${smtp.port}';
      _smtpUser.text = smtp.user;
      _smtpFrom.text = smtp.from;
      _llmProvider.text = llm.provider;
      _llmBase.text = llm.baseUrl;
      _llmModel.text = llm.model;
      _llmEnabled = llm.enabled;
    } catch (e) {
      if (mounted) showApiError(context, e, '加载公司设置失败');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _saveSmtp() async {
    final company = context.read<AppState>().currentCompany;
    if (company == null) return;
    setState(() => _busy = true);
    try {
      _smtp = await context.read<AppState>().collab.saveCompanySmtp(
            company.id,
            host: _smtpHost.text,
            port: int.tryParse(_smtpPort.text) ?? 465,
            user: _smtpUser.text,
            from: _smtpFrom.text,
            password: _smtpPass.text,
          );
      _smtpPass.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('公司邮件配置已保存')),
        );
      }
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _testSmtp() async {
    final company = context.read<AppState>().currentCompany;
    if (company == null) return;
    setState(() => _busy = true);
    try {
      await context.read<AppState>().collab.testCompanySmtp(company.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('公司邮件测试成功')),
        );
      }
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _saveLlm() async {
    final company = context.read<AppState>().currentCompany;
    if (company == null) return;
    setState(() => _busy = true);
    try {
      _llm = await context.read<AppState>().collab.saveCompanyLlm(
            company.id,
            provider: _llmProvider.text,
            baseUrl: _llmBase.text,
            model: _llmModel.text,
            enabled: _llmEnabled,
            apiKey: _llmKey.text,
          );
      _llmKey.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('公司大模型已保存')),
        );
      }
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _testLlm() async {
    final company = context.read<AppState>().currentCompany;
    if (company == null) return;
    setState(() => _busy = true);
    try {
      final res = await context.read<AppState>().collab.testCompanyLlm(company.id);
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

  Future<void> _saveLoginMethods() async {
    final company = context.read<AppState>().currentCompany;
    if (company == null) return;
    setState(() => _busy = true);
    try {
      await context.read<AppState>().collab.patchLoginMethods(
            company.id,
            _loginMethods,
          );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('登录方式已保存')),
        );
      }
    } catch (e) {
      if (mounted) showApiError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final company = context.watch<AppState>().currentCompany;
    return Scaffold(
      appBar: AppBar(
        title: Text(company == null ? '公司设置' : '公司 · ${company.name}'),
        actions: [
          IconButton(onPressed: _busy ? null : _load, icon: const Icon(Icons.refresh)),
        ],
      ),
      body: company == null
          ? const EmptyHint('请先在设置中选择公司')
          : _loading
              ? const Center(child: CircularProgressIndicator())
              : BusyBarrier(
                  busy: _busy,
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
                    children: [
                      const SectionHeader('基本信息'),
                      Card(
                        child: ListTile(
                          title: Text((_raw?['name'] ?? company.name).toString()),
                          subtitle: Text([
                            '标识：${_raw?['slug'] ?? company.slug ?? '-'}',
                            '状态：${_zhStatus(_raw?['status'])}',
                            if (_raw?['policy_preset'] != null)
                              '策略：${_zhPolicy(_raw!['policy_preset'])}',
                          ].join('\n')),
                          isThreeLine: true,
                        ),
                      ),
                      if (_features != null) ...[
                        const SectionHeader('功能权益'),
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('状态：${_zhStatus(_features!['status'])}'),
                                Text(
                                  '已解锁：${_zhBool(_features!['unlocked'])}',
                                ),
                                const SizedBox(height: 8),
                                const Text('功能：'),
                                const SizedBox(height: 6),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: _featureChips(_features!['features']),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                      if (_loginMethods.isNotEmpty) ...[
                        const SectionHeader('登录方式'),
                        Card(
                          child: Column(
                            children: [
                              ..._loginMethods.entries.map(
                                (e) => SwitchListTile(
                                  title: Text(_zhLoginMethod(e.key)),
                                  value: e.value,
                                  onChanged: (v) => setState(
                                    () => _loginMethods[e.key] = v,
                                  ),
                                ),
                              ),
                              Padding(
                                padding: const EdgeInsets.all(12),
                                child: Align(
                                  alignment: Alignment.centerLeft,
                                  child: FilledButton(
                                    onPressed: _saveLoginMethods,
                                    child: const Text('保存登录方式'),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                      const SectionHeader('公司邮件（SMTP）'),
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
                                    child: const Text('测试'),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SectionHeader('公司大模型'),
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            children: [
                              SwitchListTile(
                                contentPadding: EdgeInsets.zero,
                                title: const Text('启用'),
                                value: _llmEnabled,
                                onChanged: (v) =>
                                    setState(() => _llmEnabled = v),
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
                      if (_org != null) ...[
                        const SectionHeader('组织树'),
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Text(
                              ((_org!['nodes'] as List?) ?? [])
                                  .map((n) => n is Map
                                      ? '- ${n['name'] ?? n['title'] ?? n}'
                                      : '- $n')
                                  .join('\n')
                                  .ifEmpty('（空）'),
                            ),
                          ),
                        ),
                      ],
                      if (_bindings != null) ...[
                        const SectionHeader('能力绑定'),
                        Card(
                          child: Column(
                            children: _bindingTiles(_bindings!),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
    );
  }
}

extension on String {
  String ifEmpty(String fallback) => trim().isEmpty ? fallback : this;
}

String _zhStatus(Object? raw) {
  switch ('$raw') {
    case 'active':
      return '生效中';
    case 'inactive':
      return '已停用';
    case 'pending':
      return '待启用';
    case 'suspended':
      return '已暂停';
    case 'null':
    case '':
      return '-';
    default:
      return '$raw';
  }
}

String _zhPolicy(Object? raw) {
  switch ('$raw') {
    case 'standard':
      return '标准';
    case 'strict':
      return '严格';
    case 'relaxed':
      return '宽松';
    default:
      return '$raw';
  }
}

String _zhBool(Object? raw) {
  if (raw == true || '$raw' == 'true') return '是';
  if (raw == false || '$raw' == 'false') return '否';
  return '$raw';
}

String _zhLoginMethod(String key) {
  switch (key) {
    case 'password':
      return '账号密码';
    case 'wechat':
      return '微信';
    case 'wecom':
      return '企业微信';
    case 'dingtalk':
      return '钉钉';
    case 'feishu':
      return '飞书';
    case 'email':
      return '邮箱';
    case 'phone':
      return '手机号';
    default:
      return key;
  }
}

String _zhFeatureKey(String key) {
  switch (key) {
    case 'project_tree':
      return '项目树';
    case 'agents':
      return '智能体';
    case 'org_sync':
      return '组织同步';
    case 'policy_isolated':
      return '策略隔离';
    case 'asr':
      return '语音识别';
    case 'custom_storage':
      return '自定义存储';
    default:
      return key;
  }
}

List<Widget> _featureChips(Object? raw) {
  if (raw is! Map) {
    return [Text('$raw')];
  }
  final entries = raw.entries.toList();
  if (entries.isEmpty) {
    return [const Text('（无）')];
  }
  return [
    for (final e in entries)
      Chip(
        label: Text(
          '${_zhFeatureKey('${e.key}')} · ${_zhBool(e.value)}',
          style: const TextStyle(fontSize: 12),
        ),
        visualDensity: VisualDensity.compact,
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
  ];
}

String _zhCapability(String key) {
  switch (key) {
    case 'storage':
      return '存储';
    case 'asr':
      return '语音识别';
    case 'model':
      return '大模型';
    default:
      return key;
  }
}

String _zhProvider(String? id) {
  if (id == null || id.isEmpty) return '未配置';
  switch (id) {
    case 'local':
      return '本地';
    case 'builtin':
      return '内置';
    case 'fake':
      return '模拟';
    case 's3':
      return '对象存储（S3）';
    default:
      return id;
  }
}

String _zhNullable(Object? raw) {
  if (raw == null) return '无';
  return '$raw';
}

List<Widget> _bindingTiles(Map<String, dynamic> bindings) {
  if (bindings.isEmpty) {
    return [const ListTile(title: Text('（无绑定）'))];
  }
  final tiles = <Widget>[];
  for (final e in bindings.entries) {
    final value = e.value;
    if (value is! Map) {
      tiles.add(
        ListTile(
          title: Text(_zhCapability(e.key)),
          subtitle: Text('$value'),
        ),
      );
      continue;
    }
    final provider = value['provider_id']?.toString();
    final isDefault = value['is_default'];
    final config = value['config_json'];
    tiles.add(
      ListTile(
        title: Text(_zhCapability(e.key)),
        subtitle: Text(
          [
            '提供方：${_zhProvider(provider)}',
            '默认：${_zhBool(isDefault)}',
            '附加配置：${_zhNullable(config)}',
          ].join('\n'),
        ),
        isThreeLine: true,
      ),
    );
  }
  return tiles;
}
