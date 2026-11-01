import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import 'appearance/me_appearance.dart';
import 'screens/admin/admin_asr_config_screen.dart';
import 'screens/admin/admin_llm_config_screen.dart';
import 'screens/admin/admin_model_keys_screen.dart';
import 'screens/admin/admin_notify_channels_screen.dart';
import 'screens/admin/admin_org_sso_screen.dart';
import 'screens/admin/admin_push_certs_screen.dart';
import 'screens/admin/admin_sso_config_screen.dart';
import 'screens/me_about_screen.dart';
import 'screens/me_account_screen.dart';
import 'screens/me_appearance_screen.dart';
import 'screens/me_billing_help_screen.dart';
import 'screens/me_defaults_screen.dart';
import 'screens/me_delete_account_screen.dart';
import 'screens/me_help_screen.dart';
import 'screens/me_integrations_screen.dart';
import 'screens/me_notifications_screen.dart';
import 'screens/me_notify_logs_screen.dart';
import 'screens/me_profile_screen.dart';
import 'screens/me_root_screen.dart';
import 'screens/me_security_screen.dart';

/// 统一在路由层包一层外观作用域：页面 State 的 context 因此处于主题之内，
/// 深色模式下页面内取色（`isDarkMode`）才能拿到正确亮度。
Widget _meAppearance(Widget screen) => MeScreenAppearance(child: screen);

/// T09「我的与管理」路由（Tab 4）
///
/// 路由名与网页 `mobileRoutes.ts` 的 screen id 对齐，便于跨端排查。
final List<RouteBase> meRoutes = [
  GoRoute(
    path: '/me',
    name: 'me-root',
    builder: (context, state) => _meAppearance(const MeRootScreen()),
    routes: [
      GoRoute(
        path: 'account',
        name: 'me-account',
        builder: (context, state) => _meAppearance(const MeAccountScreen()),
      ),
      GoRoute(
        path: 'profile',
        name: 'me-profile',
        builder: (context, state) => _meAppearance(const MeProfileScreen()),
      ),
      GoRoute(
        path: 'security',
        name: 'me-security',
        builder: (context, state) => _meAppearance(const MeSecurityScreen()),
      ),
      GoRoute(
        path: 'appearance',
        name: 'me-appearance',
        builder: (context, state) => _meAppearance(const MeAppearanceScreen()),
      ),
      GoRoute(
        path: 'notifications',
        name: 'me-notifications',
        builder: (context, state) =>
            _meAppearance(const MeNotificationsScreen()),
      ),
      GoRoute(
        path: 'notify-logs',
        name: 'me-notify-logs',
        builder: (context, state) => _meAppearance(const MeNotifyLogsScreen()),
      ),
      GoRoute(
        path: 'defaults',
        name: 'me-defaults',
        builder: (context, state) => _meAppearance(const MeDefaultsScreen()),
      ),
      GoRoute(
        path: 'billing-help',
        name: 'me-billing-help',
        builder: (context, state) => _meAppearance(const MeBillingHelpScreen()),
      ),
      GoRoute(
        path: 'help',
        name: 'me-help',
        builder: (context, state) => _meAppearance(const MeHelpScreen()),
      ),
      GoRoute(
        path: 'about',
        name: 'me-about',
        builder: (context, state) => _meAppearance(const MeAboutScreen()),
      ),
      GoRoute(
        path: 'integrations',
        name: 'me-integrations',
        builder: (context, state) => _meAppearance(const MeIntegrationsScreen()),
      ),
      GoRoute(
        path: 'account-delete',
        name: 'me-account-delete',
        builder: (context, state) =>
            _meAppearance(const MeDeleteAccountScreen()),
      ),
      GoRoute(
        path: 'admin/notify-channels',
        name: 'admin-notify-channels',
        builder: (context, state) =>
            _meAppearance(const AdminNotifyChannelsScreen()),
      ),
      GoRoute(
        path: 'admin/llm',
        name: 'admin-llm-config',
        builder: (context, state) => _meAppearance(const AdminLlmConfigScreen()),
      ),
      GoRoute(
        path: 'admin/model-keys',
        name: 'admin-model-keys',
        builder: (context, state) => _meAppearance(const AdminModelKeysScreen()),
      ),
      GoRoute(
        path: 'admin/org-sso',
        name: 'admin-org-sso',
        builder: (context, state) => _meAppearance(const AdminOrgSsoScreen()),
      ),
      GoRoute(
        path: 'admin/push-certs',
        name: 'admin-push-certs',
        builder: (context, state) => _meAppearance(const AdminPushCertsScreen()),
      ),
      GoRoute(
        path: 'admin/asr',
        name: 'admin-asr-config',
        builder: (context, state) => _meAppearance(const AdminAsrConfigScreen()),
      ),
      GoRoute(
        path: 'admin/sso',
        name: 'admin-sso-config',
        builder: (context, state) => _meAppearance(const AdminSsoConfigScreen()),
      ),
    ],
  ),
];
