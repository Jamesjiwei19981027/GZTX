import 'package:flutter/material.dart';

import '../../../../core/auth/auth_state.dart';
import '../../../../design/design.dart';
import '../../appearance/me_appearance.dart';
import '../../data/me_api.dart';
import '../../state/me_admin.dart';
import '../../state/me_runtime.dart';
import '../../widgets/me_common.dart';

/// 推送证书状态（对应网页 `AdminPushCertsScreen`，设计 ID 91）
///
/// 仅 WebPush 有真实接口（`GET /notifications/vapid-public-key`，未配置时后端 503）；
/// APNs / FCM 证书由服务端环境变量配置，没有查询接口，因此只做诚实的只读说明。
class AdminPushCertsScreen extends StatefulWidget {
  const AdminPushCertsScreen({
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
  State<AdminPushCertsScreen> createState() => _AdminPushCertsScreenState();
}

class _AdminPushCertsScreenState extends State<AdminPushCertsScreen> {
  bool _loading = true;
  Object? _error;
  MeAdminAccess _admin = MeAdminAccess.none;
  String? _vapidKey;
  Object? _vapidError;

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
      _vapidError = null;
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
      String? key;
      Object? vapidError;
      try {
        key = await api.fetchVapidPublicKey();
      } catch (e) {
        vapidError = e;
      }
      if (!mounted) return;
      setState(() {
        _admin = access;
        _vapidKey = key;
        _vapidError = vapidError;
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

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    return MeScreenAppearance(
      controller: widget.appearance,
      child: AppScaffold(
        title: '推送证书状态',
        body: _companyId == null
            ? const MeNoCompanyNotice()
            : MeAdminGuard(
                isLoading: _loading,
                error: _error,
                isAdmin: _admin.isAdmin,
                onRetry: _load,
                child: MePageBody(
                  children: [
                    MeCard(
                      title: 'WebPush（VAPID）',
                      footer: '用于桌面浏览器与 PWA 离线推送；公钥由服务端环境变量下发。',
                      trailing: MeInlineButton(
                        label: '刷新',
                        onPressed: _load,
                      ),
                      children: [
                        MeInfoRow(
                          label: '公钥状态',
                          valueWidget: MeBadge(
                            label: _vapidKey != null ? '已部署' : '待配置',
                            tone: _vapidKey != null
                                ? MeTone.success
                                : MeTone.warning,
                          ),
                          value: '',
                        ),
                        if (_vapidError != null)
                          Padding(
                            padding: const EdgeInsets.only(top: AppSpacing.sm),
                            child: MeBanner(
                              message:
                                  '公钥读取失败：${meErrorMessage(_vapidError!)}',
                              tone: MeTone.warning,
                            ),
                          ),
                        if (_vapidKey != null)
                          Padding(
                            padding: const EdgeInsets.only(top: AppSpacing.sm),
                            child: Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(AppSpacing.sm),
                              decoration: BoxDecoration(
                                color: isDark
                                    ? AppColors.darkSurfaceVariant
                                    : const Color(0xFFF5F6F7),
                                borderRadius: BorderRadius.circular(
                                  AppSpacing.radiusMd,
                                ),
                              ),
                              child: Text(
                                _vapidKey!,
                                style: TextStyle(
                                  fontSize: 10.5,
                                  height: 1.4,
                                  fontFamily: 'monospace',
                                  color: isDark
                                      ? AppColors.darkTextSecondary
                                      : AppColors.textSecondary,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    const MeCard(
                      title: 'iOS APNs 推送证书',
                      footer: '证书路径与团队 ID 由服务端环境变量配置，当前版本没有查询证书有效期的接口（已上报）。',
                      children: [
                        MeInfoRow(
                          label: 'Apple Push Notification',
                          value: '由服务端配置',
                        ),
                        MeInfoRow(
                          label: '证书有效期',
                          value: '无查询接口',
                          showDivider: false,
                        ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    const MeCard(
                      title: 'Android FCM 推送通道',
                      footer: 'FCM 服务账号凭据由服务端环境变量配置，当前版本没有查询接口（已上报）。',
                      children: [
                        MeInfoRow(
                          label: 'Firebase Cloud Messaging',
                          value: '由服务端配置',
                        ),
                        MeInfoRow(
                          label: '服务账号状态',
                          value: '无查询接口',
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
}
