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
/// 通过企业级 `PUT /companies/{id}/llm` 更新指定提供商密钥；留空不修改。
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
  static const List<(String, String)> _providers = [
    ('openai', 'OpenAI'),
    ('deepseek', 'DeepSeek'),
    ('claude', 'Claude'),
  ];

  final _keyController = TextEditingController();

  bool _loading = true;
  Object? _error;
  MeAdminAccess _admin = MeAdminAccess.none;
  MeLlmConfig _config = const MeLlmConfig();
  String _provider = 'openai';
  bool _saving = false;
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
        if (_providers.any((p) => p.$1 == config.provider)) {
          _provider = config.provider;
        }
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
    try {
      final saved = await _api.saveCompanyLlm(
        companyId,
        provider: _provider,
        apiKey: key,
      );
      if (!mounted) return;
      setState(() {
        _config = saved;
        _keyController.clear();
        _saving = false;
        _successMessage = '${_providerDisplay(_provider)} 密钥已更新并加密存储';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _errorMessage = '更新密钥失败：${meErrorMessage(e)}';
      });
    }
  }

  static String _providerDisplay(String id) {
    for (final (value, label) in _providers) {
      if (value == id) return label;
    }
    return id;
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
                        title: '多厂商模型密钥管理',
                        footer: '已保存的密钥前端不回显明文，服务端加密存储；更换新密钥将立即覆盖生效。',
                        children: [
                          const MeFieldLabel(label: '选择提供商'),
                          Row(
                            children: [
                              for (final (id, label) in _providers) ...[
                                Expanded(
                                  child: GestureDetector(
                                    onTap: () =>
                                        setState(() => _provider = id),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                        vertical: 9,
                                      ),
                                      alignment: Alignment.center,
                                      decoration: BoxDecoration(
                                        color: _provider == id
                                            ? AppColors.primary
                                            : Colors.transparent,
                                        borderRadius: BorderRadius.circular(
                                          AppSpacing.radiusMd,
                                        ),
                                        border: Border.all(
                                          color: _provider == id
                                              ? AppColors.primary
                                              : (isDark
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
                                              : (isDark
                                                  ? AppColors.darkTextPrimary
                                                  : AppColors.textPrimary),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                                if (id != _providers.last.$1)
                                  const SizedBox(width: AppSpacing.sm),
                              ],
                            ],
                          ),
                          const SizedBox(height: AppSpacing.md),
                          const MeFieldLabel(label: '当前配置状态'),
                          _statusField(),
                          const SizedBox(height: AppSpacing.md),
                          const MeFieldLabel(
                            label: '输入新密钥',
                            helper: '留空则保持现有密钥不变',
                          ),
                          AppTextField(
                            controller: _keyController,
                            placeholder: 'sk-...',
                            obscureText: true,
                            onChanged: (_) => setState(() {}),
                          ),
                          const SizedBox(height: AppSpacing.lg),
                          AppButton(
                            label: '更新密钥并加密入库',
                            isFullWidth: true,
                            size: AppButtonSize.lg,
                            isLoading: _saving,
                            onPressed: _saving ? null : _save,
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
