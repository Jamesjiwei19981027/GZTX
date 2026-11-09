import 'package:flutter/material.dart';

import '../../../../core/auth/auth_state.dart';
import '../../../../design/design.dart';
import '../../appearance/me_appearance.dart';
import '../../data/me_api.dart';
import '../../data/me_models.dart';
import '../../state/me_admin.dart';
import '../../state/me_runtime.dart';
import '../../widgets/me_common.dart';

/// 单点登录配置（对应网页 `AdminSsoConfigScreen`，设计 ID 94）
///
/// 后端没有 OIDC/SAML 参数写入接口（只有 `/sso/{provider}/start|callback` 与
/// `PATCH /companies/{id}/login-methods`），因此这里只做两件真实的事：
/// 1. 开关企业是否允许 SSO 登录（真实保存）；
/// 2. 展示服务端所需的配置项清单（只读，参数由服务端环境变量提供）。
/// 网页版该页的「保存」是纯前端假成功，原生版不提供假保存（已回传）。
class AdminSsoConfigScreen extends StatefulWidget {
  const AdminSsoConfigScreen({
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
  State<AdminSsoConfigScreen> createState() => _AdminSsoConfigScreenState();
}

class _AdminSsoConfigScreenState extends State<AdminSsoConfigScreen> {
  bool _loading = true;
  Object? _error;
  MeAdminAccess _admin = MeAdminAccess.none;
  MeLoginMethods _loginMethods = const MeLoginMethods();
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
      final access = await loadMeAdminAccess(_api, companyId: companyId);
      if (!mounted) return;
      if (!access.isAdmin) {
        setState(() {
          _admin = access;
          _loading = false;
        });
        return;
      }
      final context = await _api.fetchCompanyContext(companyId);
      if (!mounted) return;
      setState(() {
        _admin = access;
        _loginMethods = context.loginMethods;
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

  Future<void> _toggleOidc(bool enabled) async {
    final companyId = _companyId;
    if (companyId == null) return;
    setState(() {
      _saving = true;
      _errorMessage = null;
      _successMessage = null;
    });
    try {
      final updated = await _api.updateLoginMethods(companyId, oidc: enabled);
      if (!mounted) return;
      setState(() {
        _loginMethods = updated;
        _saving = false;
        _successMessage = enabled ? '已允许 OIDC 单点登录' : '已关闭 OIDC 单点登录';
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
        title: '单点登录配置',
        body: _companyId == null
            ? const MeNoCompanyNotice()
            : MeAdminGuard(
                isLoading: _loading,
                error: _error,
                isAdmin: _admin.isAdmin,
                onRetry: _load,
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
                      title: 'SSO 登录开关',
                      footer: '开关保存到企业登录方式（服务端 require_super_admin 校验）',
                      children: [
                        Row(
                          children: [
                            const Expanded(
                              child: Text(
                                '允许成员使用 OIDC 单点登录',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                            AppSwitch(
                              value: _loginMethods.oidc,
                              onChanged: _saving ? null : _toggleOidc,
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        MeBanner(
                          message:
                              _loginMethods.oidc ? 'OIDC 登录已启用' : 'OIDC 登录未启用',
                          tone: _loginMethods.oidc
                              ? MeTone.success
                              : MeTone.neutral,
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    const MeCard(
                      title: '服务端需配置的参数（只读）',
                      footer: '这些参数由服务端环境变量与 IdP 元数据提供，当前版本后端未开放写入接口，'
                          '因此 APP 内只展示清单，不提供假保存（已上报）',
                      children: [
                        MeInfoRow(
                          label: 'Issuer URL',
                          value: '服务端环境变量',
                        ),
                        MeInfoRow(label: 'Client ID', value: '服务端环境变量'),
                        MeInfoRow(
                          label: 'Client Secret',
                          value: '服务端加密存储',
                        ),
                        MeInfoRow(
                          label: '授权回调地址',
                          value: '/api/v1/sso/{provider}/callback',
                        ),
                        MeInfoRow(
                          label: 'SAML Entity ID',
                          value: '服务端环境变量',
                        ),
                        MeInfoRow(
                          label: 'SAML SSO URL',
                          value: '服务端环境变量',
                          showDivider: false,
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    MeCard(
                      title: '当前企业登录方式',
                      children: [
                        MeInfoRow(
                          label: '账号密码',
                          value: _loginMethods.password ? '允许' : '已关闭',
                        ),
                        MeInfoRow(
                          label: '微信',
                          value: _loginMethods.wechat ? '允许' : '已关闭',
                        ),
                        MeInfoRow(
                          label: '企业微信',
                          value: _loginMethods.wecom ? '允许' : '已关闭',
                        ),
                        MeInfoRow(
                          label: '钉钉',
                          value: _loginMethods.dingtalk ? '允许' : '已关闭',
                        ),
                        MeInfoRow(
                          label: '飞书',
                          value: _loginMethods.feishu ? '允许' : '已关闭',
                          showDivider: false,
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    Text(
                      '提示：登录方式总开关集中在「组织与登录集成」页面统一管理',
                      style: TextStyle(
                        fontSize: 12,
                        color: isDark
                            ? AppColors.darkTextTertiary
                            : AppColors.textTertiary,
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}
