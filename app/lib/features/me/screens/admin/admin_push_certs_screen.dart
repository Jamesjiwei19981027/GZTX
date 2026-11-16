import 'package:flutter/material.dart';

import '../../../../core/auth/auth_state.dart';
import '../../../../design/design.dart';
import '../../../../push/push_service.dart';
import '../../appearance/me_appearance.dart';
import '../../data/me_api.dart';
import '../../state/me_admin.dart';
import '../../state/me_runtime.dart';
import '../../widgets/me_common.dart';

/// 极光推送设置。保留原页面类型与路由，兼容已有入口。
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
  bool? _pushEnabled;
  bool _pushFailed = false;

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
      _pushEnabled = null;
      _pushFailed = false;
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
      bool? enabled;
      var failed = false;
      try {
        enabled = await api.fetchPushEnabled();
      } catch (_) {
        failed = true;
      }
      if (!mounted) return;
      setState(() {
        _admin = access;
        _pushEnabled = enabled;
        _pushFailed = failed;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        // 不将服务端英文错误、字段或地址直接展示给用户。
        _error = StateError('管理权限读取失败');
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final push = PushService.instance;
    return MeScreenAppearance(
      controller: widget.appearance,
      child: AppScaffold(
        title: '推送设置',
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
                      title: '极光推送',
                      footer: _pushEnabled == null
                          ? null
                          : _pushEnabled!
                              ? '服务端已启用极光推送，可向已登记设备发送通知'
                              : '服务端尚未配置极光推送，暂只有站内通知',
                      trailing: MeInlineButton(label: '刷新', onPressed: _load),
                      children: [
                        MeInfoRow(
                          label: '服务端状态',
                          value: '',
                          valueWidget: MeBadge(
                            label: _pushEnabled == null
                                ? '暂无法确认'
                                : _pushEnabled!
                                    ? '已启用'
                                    : '未启用',
                            tone: _pushEnabled == true
                                ? MeTone.success
                                : MeTone.warning,
                          ),
                          showDivider: false,
                        ),
                        if (_pushFailed)
                          const Padding(
                            padding: EdgeInsets.only(top: AppSpacing.sm),
                            child: MeBanner(
                              message: '推送状态读取失败，请稍后刷新重试',
                              tone: MeTone.warning,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    MeCard(
                      title: '本机状态',
                      children: [
                        MeInfoRow(
                          label: '隐私授权',
                          value: push.consentGranted ? '已同意' : '未同意',
                        ),
                        MeInfoRow(
                          label: '本机推送配置',
                          value: push.configured ? '已配置' : '未配置',
                        ),
                        MeInfoRow(
                          label: '推送初始化',
                          value: push.initialized ? '已完成' : '尚未完成',
                        ),
                        // 现有服务只有设备标识，不能据此声称服务端登记成功。
                        MeInfoRow(
                          label: '设备标识',
                          value: push.registrationId?.isNotEmpty == true
                              ? '已获取'
                              : '尚未获取',
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
