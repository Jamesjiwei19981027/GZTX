import 'package:flutter/material.dart';

import '../../../../core/auth/auth_state.dart';
import '../../../../design/design.dart';
import '../../appearance/me_appearance.dart';
import '../../data/me_api.dart';
import '../../data/me_models.dart';
import '../../state/me_admin.dart';
import '../../state/me_runtime.dart';
import '../../widgets/me_common.dart';

/// 企业 AI 模型配置（对应网页 `AdminLlmConfigScreen`，设计 ID 60）
///
/// 使用企业级接口 `GET/PUT /companies/{id}/llm` 与 `/llm/test`，
/// 密钥留空表示不修改，已保存的密钥永不下发明文。
class AdminLlmConfigScreen extends StatefulWidget {
  const AdminLlmConfigScreen({
    super.key,
    this.api,
    this.authState,
    this.appearance,
    this.companyIdOverride,
  });

  final MeApi? api;
  final AuthState? authState;
  final MeAppearanceController? appearance;
  final int? companyIdOverride;

  @override
  State<AdminLlmConfigScreen> createState() => _AdminLlmConfigScreenState();
}

class _AdminLlmConfigScreenState extends State<AdminLlmConfigScreen> {
  final _baseUrlController = TextEditingController();
  final _modelController = TextEditingController();
  final _apiKeyController = TextEditingController();

  bool _loading = true;
  Object? _error;
  MeAdminAccess _admin = MeAdminAccess.none;
  MeLlmConfig _config = const MeLlmConfig();
  String _provider = 'openai';
  bool _enabled = false;
  bool _useForJudge = false;
  bool _useForAgent = false;
  bool _saving = false;
  bool _testing = false;
  String? _errorMessage;
  String? _successMessage;

  MeApi get _api => resolveMeApi(context, widget.api);
  AuthState? get _auth => resolveMeAuthState(context, widget.authState);
  int? get _companyId => widget.companyIdOverride ?? _auth?.currentCompany?.id;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _baseUrlController.dispose();
    _modelController.dispose();
    _apiKeyController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    final companyId = _companyId;
    if (companyId == null) {
      setState(() => _loading = false);
      return;
    }
    try {
      final api = _api;
      final access = await loadMeAdminAccess(api, companyId: companyId);
      if (!mounted) return;
      if (!access.isAdmin) {
        setState(() {
          _admin = access;
          _loading = false;
        });
        return;
      }
      final config = await api.fetchCompanyLlm(companyId);
      if (!mounted) return;
      setState(() {
        _admin = access;
        _config = config;
        _provider = config.provider.isEmpty ? 'openai' : config.provider;
        _baseUrlController.text = config.baseUrl;
        _modelController.text = config.model;
        _enabled = config.enabled;
        _useForJudge = config.useForJudge;
        _useForAgent = config.useForAgent;
        _apiKeyController.clear();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  List<(String, String)> get _providerOptions {
    final presets = _config.presets;
    const fallback = [
      ('openai', 'OpenAI'),
      ('openai_compatible', 'OpenAI 兼容'),
      ('azure_openai', 'Azure OpenAI'),
      ('fake', '本地桩'),
    ];
    if (presets.isEmpty) return fallback;
    final list = <(String, String)>[];
    for (final entry in presets.entries) {
      final value = entry.value;
      final label = value is Map<String, dynamic>
          ? (value['label'] as String?) ?? entry.key
          : entry.key;
      list.add((entry.key, label));
    }
    return list.isEmpty ? fallback : list;
  }

  Future<void> _save() async {
    final companyId = _companyId;
    if (companyId == null) return;
    if (_modelController.text.trim().isEmpty) {
      setState(() => _errorMessage = '调用模型名称为必填项');
      return;
    }
    setState(() {
      _saving = true;
      _errorMessage = null;
      _successMessage = null;
    });
    try {
      final saved = await _api.saveCompanyLlm(
        companyId,
        provider: _provider,
        baseUrl: _baseUrlController.text,
        model: _modelController.text,
        // 留空表示不修改已保存的密钥：不传 api_key 字段
        apiKey: _apiKeyController.text,
        enabled: _enabled,
        useForJudge: _useForJudge,
        useForAgent: _useForAgent,
      );
      if (!mounted) return;
      setState(() {
        _config = saved;
        _apiKeyController.clear();
        _saving = false;
        _successMessage = 'AI 大模型接入参数已保存';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _errorMessage = '保存失败：${meErrorMessage(e)}';
      });
    }
  }

  Future<void> _test() async {
    final companyId = _companyId;
    if (companyId == null) return;
    setState(() {
      _testing = true;
      _errorMessage = null;
      _successMessage = null;
    });
    try {
      final content = await _api.testCompanyLlm(companyId);
      if (!mounted) return;
      setState(() {
        _testing = false;
        _successMessage = 'AI 模型连通性测试通过：$content';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _testing = false;
        _errorMessage = '连通性测试失败：${meErrorMessage(e)}';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MeScreenAppearance(
      controller: widget.appearance,
      child: AppScaffold(
        title: 'AI 模型配置',
        body: _companyId == null
            ? const MeNoCompanyNotice()
            : MeAdminGuard(
                isLoading: _loading,
                error: _error,
                isAdmin: _admin.isAdmin,
                onRetry: _load,
                child: MeKeyboardSafeBody(
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
                      MeCard(
                        title: '企业统一智能体与大模型',
                        footer: '支持 OpenAI 协议兼容端点（DeepSeek、Moonshot、本地 Ollama 等）。'
                            '密钥在服务端加密保存，前端不回显明文；留空表示不修改。',
                        children: [
                          Row(
                            children: [
                              const Expanded(
                                child: Text(
                                  '启用 AI 智能分析与汇报',
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                              AppSwitch(
                                value: _enabled,
                                onChanged: (value) =>
                                    setState(() => _enabled = value),
                              ),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.md),
                          const MeFieldLabel(label: '模型提供商'),
                          Wrap(
                            spacing: AppSpacing.sm,
                            runSpacing: AppSpacing.sm,
                            children: [
                              for (final (id, label) in _providerOptions)
                                GestureDetector(
                                  onTap: () => setState(() => _provider = id),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 7,
                                    ),
                                    decoration: BoxDecoration(
                                      color: _provider == id
                                          ? AppColors.primary
                                          : (isDarkMode(context)
                                              ? AppColors.darkSurfaceVariant
                                              : Colors.transparent),
                                      borderRadius: BorderRadius.circular(
                                        AppSpacing.radiusMd,
                                      ),
                                      border: Border.all(
                                        color: _provider == id
                                            ? AppColors.primary
                                            : (isDarkMode(context)
                                                ? AppColors.darkBorder
                                                : AppColors.border),
                                      ),
                                    ),
                                    child: Text(
                                      label,
                                      style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                        color: _provider == id
                                            ? Colors.white
                                            : (isDarkMode(context)
                                                ? AppColors.darkTextPrimary
                                                : AppColors.textPrimary),
                                      ),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.md),
                          const MeFieldLabel(
                            label: 'API Base URL',
                            helper: '留空则使用提供商官方接口地址',
                          ),
                          AppTextField(
                            key: const Key('admin-llm-base-url'),
                            controller: _baseUrlController,
                            placeholder: 'https://api.openai.com/v1',
                          ),
                          const SizedBox(height: AppSpacing.md),
                          const MeFieldLabel(label: '调用模型名称', required: true),
                          AppTextField(
                            key: const Key('admin-llm-model'),
                            controller: _modelController,
                            placeholder: 'gpt-4o / deepseek-chat',
                          ),
                          const SizedBox(height: AppSpacing.md),
                          MeFieldLabel(
                            label: 'API Key',
                            helper: _config.hasApiKey
                                ? '已配置 API Key（不回显明文，留空表示不修改）'
                                : '请输入提供商 API Key',
                          ),
                          AppTextField(
                            key: const Key('admin-llm-api-key'),
                            controller: _apiKeyController,
                            placeholder: _config.hasApiKey ? 'sk-••••••••' : 'sk-...',
                            obscureText: true,
                          ),
                          const SizedBox(height: AppSpacing.md),
                          Row(
                            children: [
                              Expanded(
                                child: Row(
                                  children: [
                                    AppSwitch(
                                      value: _useForJudge,
                                      onChanged: (value) => setState(
                                        () => _useForJudge = value,
                                      ),
                                    ),
                                    const SizedBox(width: AppSpacing.xs),
                                    const Flexible(
                                      child: Text(
                                        '用于判定',
                                        style: TextStyle(fontSize: 12.5),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Expanded(
                                child: Row(
                                  children: [
                                    AppSwitch(
                                      value: _useForAgent,
                                      onChanged: (value) => setState(
                                        () => _useForAgent = value,
                                      ),
                                    ),
                                    const SizedBox(width: AppSpacing.xs),
                                    const Flexible(
                                      child: Text(
                                        '用于智能体',
                                        style: TextStyle(fontSize: 12.5),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.lg),
                          AppButton(
                            label: '保存模型配置',
                            isFullWidth: true,
                            size: AppButtonSize.lg,
                            isLoading: _saving,
                            onPressed: _saving ? null : _save,
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          AppButton(
                            label: '连通性测试',
                            variant: AppButtonVariant.secondary,
                            isFullWidth: true,
                            isLoading: _testing,
                            onPressed: _testing ? null : _test,
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
