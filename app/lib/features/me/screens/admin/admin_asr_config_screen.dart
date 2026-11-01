import 'package:flutter/material.dart';

import '../../../../core/auth/auth_state.dart';
import '../../../../design/design.dart';
import '../../appearance/me_appearance.dart';
import '../../data/me_api.dart';
import '../../data/me_models.dart';
import '../../state/me_admin.dart';
import '../../state/me_runtime.dart';
import '../../widgets/me_common.dart';

/// 企业语音识别配置（对应网页 `AdminAsrConfigScreen`，设计 ID 93）
///
/// 使用 `GET/PUT /companies/{id}/bindings`、`/bindings/asr`；密钥留空不修改。
class AdminAsrConfigScreen extends StatefulWidget {
  const AdminAsrConfigScreen({
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
  State<AdminAsrConfigScreen> createState() => _AdminAsrConfigScreenState();
}

class _AdminAsrConfigScreenState extends State<AdminAsrConfigScreen> {
  static const List<(String, String)> _engines = [
    ('cloud:whisper', 'Whisper 兼容服务'),
    ('customer:whisper', '自有语音服务'),
    ('builtin', '暂不启用'),
  ];

  final _baseUrlController = TextEditingController();
  final _modelController = TextEditingController(text: 'whisper-1');
  final _apiKeyController = TextEditingController();

  bool _loading = true;
  Object? _error;
  MeAdminAccess _admin = MeAdminAccess.none;
  MeAsrBinding _binding = const MeAsrBinding();
  String _engine = 'builtin';
  String _language = 'zh';
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
      final binding = await api.fetchCompanyAsr(companyId);
      if (!mounted) return;
      setState(() {
        _admin = access;
        _binding = binding;
        _engine = binding.providerId.isEmpty ? 'builtin' : binding.providerId;
        _baseUrlController.text = binding.baseUrl;
        _modelController.text = binding.model;
        _language = binding.language;
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

  Future<void> _save() async {
    final companyId = _companyId;
    if (companyId == null) return;
    if (_engine != 'builtin' &&
        (_baseUrlController.text.trim().isEmpty ||
            _modelController.text.trim().isEmpty)) {
      setState(() => _errorMessage = '启用外部语音服务时，服务地址与模型名称均为必填');
      return;
    }
    setState(() {
      _saving = true;
      _errorMessage = null;
      _successMessage = null;
    });
    try {
      final saved = await _api.saveCompanyAsr(
        companyId,
        providerId: _engine,
        baseUrl: _baseUrlController.text,
        model: _modelController.text,
        language: _language,
        apiKey: _apiKeyController.text,
      );
      if (!mounted) return;
      setState(() {
        _binding = saved;
        _apiKeyController.clear();
        _saving = false;
        _successMessage = '语音识别引擎参数已更新';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _errorMessage = '保存失败：${meErrorMessage(e)}';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return MeScreenAppearance(
      controller: widget.appearance,
      child: AppScaffold(
        title: '语音识别配置',
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
                        title: 'ASR 转写引擎',
                        footer: '用于会议语音记录与汇报录音转写；前端按需申请麦克风权限，录音结束后才上传音频。',
                        children: [
                          const MeFieldLabel(label: '选择转写模型提供商'),
                          for (final (id, label) in _engines)
                            InkWell(
                              onTap: () => setState(() => _engine = id),
                              borderRadius:
                                  BorderRadius.circular(AppSpacing.radiusMd),
                              child: Padding(
                                padding:
                                    const EdgeInsets.symmetric(vertical: 10),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        label,
                                        style: TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w600,
                                          color: isDark
                                              ? AppColors.darkTextPrimary
                                              : AppColors.textPrimary,
                                        ),
                                      ),
                                    ),
                                    if (_engine == id)
                                      const AppIcon(
                                        'check',
                                        size: 18,
                                        color: AppColors.primary,
                                      )
                                    else
                                      const SizedBox(width: 18),
                                  ],
                                ),
                              ),
                            ),
                          if (_engine != 'builtin') ...[
                            const SizedBox(height: AppSpacing.md),
                            const MeFieldLabel(
                              label: '语音服务地址',
                              required: true,
                            ),
                            AppTextField(
                              key: const Key('admin-asr-base-url'),
                              controller: _baseUrlController,
                              placeholder: 'https://asr.example.com/v1',
                            ),
                            const SizedBox(height: AppSpacing.md),
                            const MeFieldLabel(
                              label: '转写模型名称',
                              required: true,
                            ),
                            AppTextField(
                              key: const Key('admin-asr-model'),
                              controller: _modelController,
                              placeholder: 'whisper-1',
                            ),
                            const SizedBox(height: AppSpacing.md),
                            MeFieldLabel(
                              label: '语音服务密钥',
                              helper: _binding.hasApiKey
                                  ? '已配置密钥（留空保留原密钥）'
                                  : '自有服务若无需密钥可留空',
                            ),
                            AppTextField(
                              key: const Key('admin-asr-api-key'),
                              controller: _apiKeyController,
                              placeholder:
                                  _binding.hasApiKey ? '••••••••' : 'sk-...',
                              obscureText: true,
                            ),
                          ],
                          const SizedBox(height: AppSpacing.md),
                          const MeFieldLabel(label: '主语言偏好'),
                          Row(
                            children: [
                              Expanded(
                                child: _languageOption('zh', '中文普通话 (zh)'),
                              ),
                              const SizedBox(width: AppSpacing.sm),
                              Expanded(
                                child: _languageOption('en', 'English (en)'),
                              ),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.md),
                          const MeFieldLabel(label: '音频采样率'),
                          Text(
                            '小程序优先 16000 Hz 单声道；Web 与 APP 由设备选择录音编码。',
                            style: TextStyle(
                              fontSize: 12,
                              height: 1.5,
                              color: isDark
                                  ? AppColors.darkTextSecondary
                                  : AppColors.textSecondary,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.lg),
                          AppButton(
                            label: '保存语音识别配置',
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

  Widget _languageOption(String value, String label) {
    final selected = _language == value;
    final isDark = isDarkMode(context);
    return GestureDetector(
      onTap: () => setState(() => _language = value),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 9),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? AppColors.primary : Colors.transparent,
          borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
          border: Border.all(
            color: selected
                ? AppColors.primary
                : (isDark ? AppColors.darkBorder : AppColors.border),
          ),
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: selected
                ? Colors.white
                : (isDark ? AppColors.darkTextPrimary : AppColors.textPrimary),
          ),
        ),
      ),
    );
  }
}
