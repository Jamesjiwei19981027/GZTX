import 'package:flutter/material.dart';

import '../../../../core/auth/auth_state.dart';
import '../../../../core/time/time_utils.dart';
import '../../../../design/design.dart';
import '../../appearance/me_appearance.dart';
import '../../data/me_api.dart';
import '../../data/me_models.dart';
import '../../state/me_admin.dart';
import '../../state/me_runtime.dart';
import '../../widgets/me_common.dart';

/// 组织与登录集成（对应网页 `AdminOrgSsoScreen`，设计 ID 61）
class AdminOrgSsoScreen extends StatefulWidget {
  const AdminOrgSsoScreen({
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
  State<AdminOrgSsoScreen> createState() => _AdminOrgSsoScreenState();
}

class _AdminOrgSsoScreenState extends State<AdminOrgSsoScreen> {
  bool _loading = true;
  Object? _error;
  MeAdminAccess _admin = MeAdminAccess.none;
  List<MeIntegration> _integrations = const [];
  MeLoginMethods _loginMethods = const MeLoginMethods();
  bool _syncing = false;
  bool _savingLogin = false;
  String? _errorMessage;
  String? _successMessage;

  MeApi get _api => resolveMeApi(context, widget.api);
  AuthState? get _auth => resolveMeAuthState(context, widget.authState);
  int? get _companyId => widget.companyIdOverride ?? _auth?.currentCompany?.id;

  /// 可用于组织同步的集成：优先已配置账号，避免选中空壳账号
  MeIntegration? get _syncTarget {
    final syncable =
        _integrations.where((item) => item.supportsOrgSync).toList();
    if (syncable.isEmpty) return null;
    final configured = syncable.where((item) => item.isConfigured).toList();
    return (configured.isNotEmpty ? configured : syncable).first;
  }

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
      final companyContext = await api.fetchCompanyContext(companyId);
      List<MeIntegration> integrations = const [];
      Object? integrationError;
      try {
        integrations = await api.listIntegrations(companyId);
      } catch (e) {
        integrationError = e;
      }
      if (!mounted) return;
      setState(() {
        _admin = access;
        _loginMethods = companyContext.loginMethods;
        _integrations = integrations;
        _loading = false;
        if (integrationError != null) {
          _errorMessage = '组织集成列表读取失败：${meErrorMessage(integrationError)}';
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  Future<void> _triggerSync() async {
    final companyId = _companyId;
    if (companyId == null) return;
    final target = _syncTarget;
    if (target == null) {
      setState(() {
        _errorMessage = '尚未配置可同步的组织集成（企业微信 / 钉钉 / 飞书），请先完成授权配置';
        _successMessage = null;
      });
      return;
    }
    setState(() {
      _syncing = true;
      _errorMessage = null;
      _successMessage = null;
    });
    try {
      await _api.triggerOrgSync(companyId, provider: target.provider);
      if (!mounted) return;
      setState(() {
        _syncing = false;
        _successMessage = '${target.displayName} 组织架构同步任务已触发，正在后台拉取人员与部门';
      });
      await _load();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _syncing = false;
        _errorMessage = '组织同步失败：${meErrorMessage(e)}';
      });
    }
  }

  Future<void> _updateLoginMethod({
    bool? password,
    bool? wechat,
    bool? wecom,
    bool? dingtalk,
    bool? feishu,
  }) async {
    final companyId = _companyId;
    if (companyId == null) return;
    setState(() {
      _savingLogin = true;
      _errorMessage = null;
      _successMessage = null;
    });
    try {
      final updated = await _api.updateLoginMethods(
        companyId,
        password: password,
        wechat: wechat,
        wecom: wecom,
        dingtalk: dingtalk,
        feishu: feishu,
      );
      if (!mounted) return;
      setState(() {
        _loginMethods = updated;
        _savingLogin = false;
        _successMessage = '登录方式已更新';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _savingLogin = false;
        _errorMessage = '登录方式保存失败：${meErrorMessage(e)}';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final syncTarget = _syncTarget;
    return MeScreenAppearance(
      controller: widget.appearance,
      child: AppScaffold(
        title: '组织与登录集成',
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
                      title: '全量组织架构同步',
                      footer: '从企业微信 / 钉钉 / 飞书自动对齐部门与人员，仅同步已加入企业的成员',
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                syncTarget == null
                                    ? '尚未配置可同步的组织集成（企业微信 / 钉钉 / 飞书）'
                                    : '从${syncTarget.displayName}拉取最新组织架构',
                                style: const TextStyle(fontSize: 13),
                              ),
                            ),
                            MeInlineButton(
                              label: _syncing ? '同步中…' : '立即同步',
                              isLoading: _syncing,
                              onPressed: _syncing || syncTarget == null
                                  ? null
                                  : _triggerSync,
                            ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    MeCard(
                      title: '已支持的协同办公服务',
                      footer: '集成账号需在企业微信 / 钉钉 / 飞书后台授权后由管理员配置，密钥不下发明文',
                      children: [
                        if (_integrations.isEmpty)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            child: Text(
                              '尚未配置任何组织集成',
                              style: TextStyle(
                                fontSize: 13,
                                color: isDarkMode(context)
                                    ? AppColors.darkTextSecondary
                                    : AppColors.textSecondary,
                              ),
                            ),
                          )
                        else
                          for (final item in _integrations)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 8),
                              child: Row(
                                children: [
                                  const AppIcon(
                                    'work',
                                    size: 18,
                                  ),
                                  const SizedBox(width: AppSpacing.sm),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          item.displayName,
                                          style: const TextStyle(
                                            fontSize: 14,
                                            fontWeight: FontWeight.w500,
                                          ),
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                          item.lastSyncAt != null
                                              ? '上次同步：${formatDisplayDateTime(item.lastSyncAt)}'
                                              : item.createdAt != null
                                                  ? '配置于 ${formatDisplayDateTime(item.createdAt)}（尚未同步）'
                                                  : '尚未建立同步',
                                          style: TextStyle(
                                            fontSize: 12,
                                            color: isDarkMode(context)
                                                ? AppColors.darkTextSecondary
                                                : AppColors.textSecondary,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  MeBadge(
                                    label: item.lastSyncAt != null
                                        ? '已同步'
                                        : item.isConfigured
                                            ? '已配置'
                                            : '待配置',
                                    tone: item.isConfigured
                                        ? MeTone.success
                                        : MeTone.warning,
                                  ),
                                ],
                              ),
                            ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    MeCard(
                      title: '可用登录方式',
                      footer: '关闭某方式后，成员将无法使用该方式登录本企业（已登录会话仍有效）',
                      children: [
                        _loginSwitch(
                          title: '账号密码登录',
                          value: _loginMethods.password,
                          onChanged: (value) =>
                              _updateLoginMethod(password: value),
                        ),
                        _loginSwitch(
                          title: '微信登录',
                          value: _loginMethods.wechat,
                          onChanged: (value) =>
                              _updateLoginMethod(wechat: value),
                        ),
                        _loginSwitch(
                          title: '企业微信登录',
                          value: _loginMethods.wecom,
                          onChanged: (value) =>
                              _updateLoginMethod(wecom: value),
                        ),
                        _loginSwitch(
                          title: '钉钉登录',
                          value: _loginMethods.dingtalk,
                          onChanged: (value) =>
                              _updateLoginMethod(dingtalk: value),
                        ),
                        _loginSwitch(
                          title: '飞书登录',
                          value: _loginMethods.feishu,
                          onChanged: (value) =>
                              _updateLoginMethod(feishu: value),
                          showDivider: false,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _loginSwitch({
    required String title,
    required bool value,
    required Future<void> Function(bool) onChanged,
    bool showDivider = true,
  }) {
    final isDark = isDarkMode(context);
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      decoration: showDivider
          ? BoxDecoration(
              border: Border(
                bottom: BorderSide(
                  color: isDark ? AppColors.darkBorder : AppColors.borderLight,
                  width: 0.5,
                ),
              ),
            )
          : null,
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
            ),
          ),
          AppSwitch(
            value: value,
            onChanged: _savingLogin ? null : onChanged,
          ),
        ],
      ),
    );
  }
}
