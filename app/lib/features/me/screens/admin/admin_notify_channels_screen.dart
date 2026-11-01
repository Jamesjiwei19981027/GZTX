import 'package:flutter/material.dart';

import '../../../../core/auth/auth_state.dart';
import '../../../../design/design.dart';
import '../../appearance/me_appearance.dart';
import '../../data/me_api.dart';
import '../../data/me_models.dart';
import '../../state/me_admin.dart';
import '../../state/me_runtime.dart';
import '../../widgets/me_common.dart';

/// 企业通知渠道配置（对应网页 `AdminNotifyChannelsScreen`，设计 ID 59）
///
/// 使用企业级接口 `GET/PUT /companies/{id}/smtp`（服务端 `require_super_admin` 兜底），
/// 与网页版误用「个人 SMTP」接口的差异已回传。
class AdminNotifyChannelsScreen extends StatefulWidget {
  const AdminNotifyChannelsScreen({
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
  State<AdminNotifyChannelsScreen> createState() =>
      _AdminNotifyChannelsScreenState();
}

class _AdminNotifyChannelsScreenState extends State<AdminNotifyChannelsScreen> {
  final _hostController = TextEditingController();
  final _portController = TextEditingController(text: '465');
  final _userController = TextEditingController();
  final _fromController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _loading = true;
  Object? _error;
  MeAdminAccess _admin = MeAdminAccess.none;
  MeSmtpConfig _config = const MeSmtpConfig();
  bool _saving = false;
  bool _testing = false;
  String? _errorMessage;
  String? _successMessage;

  MeApi get _api => resolveMeApi(context, widget.api);
  AuthState? get _auth => resolveMeAuthState(context, widget.authState);
  int? get _companyId =>
      widget.companyIdOverride ?? _auth?.currentCompany?.id;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _hostController.dispose();
    _portController.dispose();
    _userController.dispose();
    _fromController.dispose();
    _passwordController.dispose();
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
      final config = await api.fetchCompanySmtp(companyId);
      if (!mounted) return;
      setState(() {
        _admin = access;
        _config = config;
        _hostController.text = config.host;
        _portController.text = '${config.port}';
        _userController.text = config.user;
        _fromController.text = config.from;
        _passwordController.clear();
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
    final port = int.tryParse(_portController.text.trim());
    if (port == null || port <= 0 || port > 65535) {
      setState(() => _errorMessage = '服务器端口需为 1-65535 之间的数字');
      return;
    }
    if (_hostController.text.trim().isEmpty || _userController.text.trim().isEmpty) {
      setState(() => _errorMessage = '服务器地址与登录账号为必填项');
      return;
    }
    setState(() {
      _saving = true;
      _errorMessage = null;
      _successMessage = null;
    });
    try {
      final saved = await _api.saveCompanySmtp(
        companyId,
        host: _hostController.text,
        port: port,
        user: _userController.text,
        from: _fromController.text,
        password: _passwordController.text,
      );
      if (!mounted) return;
      setState(() {
        _config = saved;
        _passwordController.clear();
        _saving = false;
        _successMessage = '企业 SMTP 邮件渠道配置已保存';
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
      final message = await _api.testCompanySmtp(companyId);
      if (!mounted) return;
      setState(() {
        _testing = false;
        _successMessage = message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _testing = false;
        _errorMessage = '测试邮件发送失败：${meErrorMessage(e)}';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MeScreenAppearance(
      controller: widget.appearance,
      child: AppScaffold(
        title: '通知渠道配置',
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
                      const MeBanner(
                        message: '当前为企业超级管理员视图，可修改企业级配置。',
                        tone: MeTone.primary,
                      ),
                      if (_errorMessage != null)
                        Padding(
                          padding: const EdgeInsets.only(top: AppSpacing.md),
                          child: MeBanner(
                            message: _errorMessage!,
                            tone: MeTone.danger,
                          ),
                        ),
                      if (_successMessage != null)
                        Padding(
                          padding: const EdgeInsets.only(top: AppSpacing.md),
                          child: MeBanner(
                            message: _successMessage!,
                            tone: MeTone.success,
                          ),
                        ),
                      const SizedBox(height: AppSpacing.md),
                      MeCard(
                        title: 'SMTP 邮件发送服务',
                        footer: '用于任务逾期提醒、汇报摘要与验证邮件。密码在服务端加密存储且不回显，留空表示不修改。',
                        children: [
                          const MeFieldLabel(label: 'SMTP 服务器地址', required: true),
                          AppTextField(
                            controller: _hostController,
                            placeholder: 'smtp.example.com',
                          ),
                          const SizedBox(height: AppSpacing.md),
                          Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const MeFieldLabel(
                                      label: '服务器端口',
                                      required: true,
                                    ),
                                    AppTextField(
                                      controller: _portController,
                                      placeholder: '465 / 587',
                                      keyboardType: TextInputType.number,
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: AppSpacing.md),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const MeFieldLabel(label: '加密方式'),
                                    MeInfoRow(
                                      label: '协议',
                                      value: _portController.text.trim() == '465'
                                          ? 'SSL / TLS'
                                          : 'STARTTLS',
                                      showDivider: false,
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.md),
                          const MeFieldLabel(
                            label: '登录账号 / 用户名',
                            required: true,
                          ),
                          AppTextField(
                            controller: _userController,
                            placeholder: 'notifications@example.com',
                          ),
                          const SizedBox(height: AppSpacing.md),
                          const MeFieldLabel(label: '发件人显示地址'),
                          AppTextField(
                            controller: _fromController,
                            placeholder: 'worktodo-noreply@example.com',
                          ),
                          const SizedBox(height: AppSpacing.md),
                          MeFieldLabel(
                            label: 'SMTP 授权密码',
                            helper: _config.hasPassword
                                ? '已配置密码（出于安全规范不回显明文，留空保留原密码）'
                                : '请输入第三方邮箱授权密码',
                          ),
                          AppTextField(
                            controller: _passwordController,
                            placeholder:
                                _config.hasPassword ? '••••••••••••' : '请输入密码或授权码',
                            obscureText: true,
                          ),
                          const SizedBox(height: AppSpacing.md),
                          Row(
                            children: [
                              MeBadge(
                                label: _config.hasPassword ? '密码已配置' : '密码未配置',
                                tone: _config.hasPassword
                                    ? MeTone.success
                                    : MeTone.warning,
                              ),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.lg),
                          AppButton(
                            label: '保存 SMTP 配置',
                            isFullWidth: true,
                            size: AppButtonSize.lg,
                            isLoading: _saving,
                            onPressed: _saving ? null : _save,
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          AppButton(
                            label: '发送测试邮件',
                            variant: AppButtonVariant.secondary,
                            isFullWidth: true,
                            isLoading: _testing,
                            onPressed: _testing ? null : _test,
                          ),
                        ],
                      ),
                      const SizedBox(height: AppSpacing.md),
                      const MeCard(
                        title: '其他渠道概览',
                        children: [
                          MeInfoRow(
                            label: 'Web / APP 推送',
                            value: '见「推送证书状态」',
                          ),
                          MeInfoRow(
                            label: '微信模板消息',
                            value: '由服务端模板中心统一接入',
                            showDivider: false,
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
