import 'package:flutter/material.dart';

import '../../../../core/auth/auth_state.dart';
import '../../../../design/design.dart';
import '../../appearance/me_appearance.dart';
import '../../data/me_api.dart';
import '../../data/me_models.dart';
import '../../state/me_admin.dart';
import '../../state/me_runtime.dart';
import '../../widgets/me_common.dart';

/// 企业模型密钥配置（对应网页 `AdminModelKeysScreen`，设计 ID 92）
///
/// 后端 `PUT /companies/{id}/llm` 只保存一套「生效配置」，且 `save_company_llm`
/// 会把不支持的 provider（deepseek / claude）改写为 `custom`。因此本页只做
/// 「轮换当前生效配置的密钥」：提交时不带 provider / base_url / model，
/// 由服务端沿用原配置；要换厂商必须到「AI 模型配置」页连同地址与模型一起提交。
class AdminModelKeysScreen extends StatefulWidget {
  const AdminModelKeysScreen({
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
  State<AdminModelKeysScreen> createState() => _AdminModelKeysScreenState();
}

class _AdminModelKeysScreenState extends State<AdminModelKeysScreen> {
  /// 后端预设缺失时的兜底名称（仅用于展示，不参与写接口）
  static const Map<String, String> _fallbackProviderLabels = {
    'fake': '本地桩（Fake）',
    'openai': 'OpenAI',
    'openai_compatible': 'OpenAI 兼容',
    'azure_openai': 'Azure OpenAI',
    'ollama': 'Ollama（本地）',
    'custom': '自定义',
  };

  final _keyController = TextEditingController();

  bool _loading = true;
  Object? _error;
  MeAdminAccess _admin = MeAdminAccess.none;
  MeLlmConfig _config = const MeLlmConfig();
  bool _saving = false;
  String? _errorMessage;
  String? _successMessage;

  MeApi get _api => resolveMeApi(context, widget.api);
  AuthState? get _auth => resolveMeAuthState(context, widget.authState);
  int? get _companyId => widget.companyIdOverride ?? _auth?.currentCompany?.id;

  /// 当前生效配置的厂商（后端保证一定是预设内的 id）
  String get _activeProvider =>
      _config.provider.isEmpty ? 'fake' : _config.provider;

  /// 当前厂商是否需要 API Key（fake / ollama 不需要）
  bool get _activeProviderNeedsKey {
    final preset = _config.presets[_activeProvider];
    if (preset is Map<String, dynamic> && preset['needs_key'] is bool) {
      return preset['needs_key'] as bool;
    }
    return _activeProvider != 'fake' && _activeProvider != 'ollama';
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _keyController.dispose();
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

  Future<void> _save() async {
    final companyId = _companyId;
    final key = _keyController.text.trim();
    if (companyId == null) return;
    if (!_activeProviderNeedsKey) {
      setState(() {
        _errorMessage = '当前提供商「${_providerDisplay(_activeProvider)}」无需 API Key';
        _successMessage = null;
      });
      return;
    }
    if (key.isEmpty) {
      setState(() {
        // 留空表示保持现有密钥不变，因此不发送请求
        _errorMessage = '新密钥不能为空（留空表示保持现有密钥不变）';
        _successMessage = null;
      });
      return;
    }
    setState(() {
      _saving = true;
      _errorMessage = null;
      _successMessage = null;
    });
    final providerLabel = _providerDisplay(_activeProvider);
    try {
      // 只提交密钥：provider / base_url / model 一律沿用当前生效配置
      final saved = await _api.saveCompanyLlm(companyId, apiKey: key);
      if (!mounted) return;
      setState(() {
        _config = saved;
        _keyController.clear();
        _saving = false;
        _successMessage = '$providerLabel 密钥已更新并加密存储';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _errorMessage = '更新密钥失败：${meErrorMessage(e)}';
      });
    }
  }

  String _providerDisplay(String id) {
    final preset = _config.presets[id];
    if (preset is Map<String, dynamic>) {
      final label = preset['label'];
      if (label is String && label.trim().isNotEmpty) return label.trim();
    }
    return _fallbackProviderLabels[id] ?? (id.isEmpty ? '未知' : id.toUpperCase());
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return MeScreenAppearance(
      controller: widget.appearance,
      child: AppScaffold(
        title: '模型密钥配置',
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
                        title: '当前生效配置的密钥',
                        footer: '企业只有一套生效的 AI 配置；本页只轮换它的密钥，'
                            '不会改动厂商、API 地址与模型。如需更换厂商，'
                            '请到「AI 模型配置」页同时填写新的 API 地址与调用模型。',
                        children: [
                          const MeFieldLabel(label: '当前提供商'),
                          _providerField(isDark),
                          const SizedBox(height: AppSpacing.md),
                          const MeFieldLabel(label: '当前配置状态'),
                          _statusField(),
                          const SizedBox(height: AppSpacing.md),
                          if (_activeProviderNeedsKey) ...[
                            const MeFieldLabel(
                              label: '输入新密钥',
                              helper: '留空则保持现有密钥不变',
                            ),
                            AppTextField(
                              key: const Key('admin-model-key'),
                              controller: _keyController,
                              placeholder: 'sk-...',
                              obscureText: true,
                              onChanged: (_) => setState(() {}),
                            ),
                            const SizedBox(height: AppSpacing.lg),
                            AppButton(
                              label: '保存密钥',
                              isFullWidth: true,
                              size: AppButtonSize.lg,
                              isLoading: _saving,
                              onPressed: _saving ? null : _save,
                            ),
                          ] else
                            const MeBanner(
                              message: '当前提供商无需 API Key（本地桩或本地 Ollama）。'
                                  '如需接入云端模型，请到「AI 模型配置」页选择厂商并填写地址与模型。',
                              tone: MeTone.warning,
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

  Widget _providerField(bool isDark) {
    final secondaryStyle = TextStyle(
      fontSize: 11.5,
      color: isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
    );
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurfaceVariant : const Color(0xFFF5F6F7),
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.border,
        ),
      ),
      // 厂商 / 地址 / 模型纵向排列：模型名可能很长（如
      // accounts/fireworks/models/llama-v3p1-405b-instruct），
      // 并排会挤爆 320 宽屏幕，这里限制在卡片宽度内换行、超出省略。
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _providerDisplay(_activeProvider),
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 2),
          Text(
            _config.baseUrl.isEmpty ? '未配置 API 地址' : _config.baseUrl,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: secondaryStyle,
          ),
          const SizedBox(height: 2),
          Text(
            _config.model.isEmpty ? '未填写模型' : '调用模型：${_config.model}',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: secondaryStyle,
          ),
        ],
      ),
    );
  }

  Widget _statusField() {
    final isDark = isDarkMode(context);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurfaceVariant : const Color(0xFFF5F6F7),
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.border,
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              _config.hasApiKey ? '••••••••••••••（已保存）' : '尚未配置密钥',
              style: const TextStyle(fontSize: 12.5, letterSpacing: 0.5),
            ),
          ),
          MeBadge(
            label: _config.hasApiKey ? 'AES-256' : '未配置',
            tone: _config.hasApiKey ? MeTone.success : MeTone.warning,
          ),
        ],
      ),
    );
  }
}
