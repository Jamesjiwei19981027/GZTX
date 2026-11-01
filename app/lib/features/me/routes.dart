import 'package:go_router/go_router.dart';

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

/// T09「我的与管理」路由（Tab 4）
///
/// 路由名与网页 `mobileRoutes.ts` 的 screen id 对齐，便于跨端排查。
final List<RouteBase> meRoutes = [
  GoRoute(
    path: '/me',
    name: 'me-root',
    builder: (context, state) => const MeRootScreen(),
    routes: [
      GoRoute(
        path: 'account',
        name: 'me-account',
        builder: (context, state) => const MeAccountScreen(),
      ),
      GoRoute(
        path: 'profile',
        name: 'me-profile',
        builder: (context, state) => const MeProfileScreen(),
      ),
      GoRoute(
        path: 'security',
        name: 'me-security',
        builder: (context, state) => const MeSecurityScreen(),
      ),
      GoRoute(
        path: 'appearance',
        name: 'me-appearance',
        builder: (context, state) => const MeAppearanceScreen(),
      ),
      GoRoute(
        path: 'notifications',
        name: 'me-notifications',
        builder: (context, state) => const MeNotificationsScreen(),
      ),
      GoRoute(
        path: 'notify-logs',
        name: 'me-notify-logs',
        builder: (context, state) => const MeNotifyLogsScreen(),
      ),
      GoRoute(
        path: 'defaults',
        name: 'me-defaults',
        builder: (context, state) => const MeDefaultsScreen(),
      ),
      GoRoute(
        path: 'billing-help',
        name: 'me-billing-help',
        builder: (context, state) => const MeBillingHelpScreen(),
      ),
      GoRoute(
        path: 'help',
        name: 'me-help',
        builder: (context, state) => const MeHelpScreen(),
      ),
      GoRoute(
        path: 'about',
        name: 'me-about',
        builder: (context, state) => const MeAboutScreen(),
      ),
      GoRoute(
        path: 'integrations',
        name: 'me-integrations',
        builder: (context, state) => const MeIntegrationsScreen(),
      ),
      GoRoute(
        path: 'account-delete',
        name: 'me-account-delete',
        builder: (context, state) => const MeDeleteAccountScreen(),
      ),
      GoRoute(
        path: 'admin/notify-channels',
        name: 'admin-notify-channels',
        builder: (context, state) => const AdminNotifyChannelsScreen(),
      ),
      GoRoute(
        path: 'admin/llm',
        name: 'admin-llm-config',
        builder: (context, state) => const AdminLlmConfigScreen(),
      ),
      GoRoute(
        path: 'admin/model-keys',
        name: 'admin-model-keys',
        builder: (context, state) => const AdminModelKeysScreen(),
      ),
      GoRoute(
        path: 'admin/org-sso',
        name: 'admin-org-sso',
        builder: (context, state) => const AdminOrgSsoScreen(),
      ),
      GoRoute(
        path: 'admin/push-certs',
        name: 'admin-push-certs',
        builder: (context, state) => const AdminPushCertsScreen(),
      ),
      GoRoute(
        path: 'admin/asr',
        name: 'admin-asr-config',
        builder: (context, state) => const AdminAsrConfigScreen(),
      ),
      GoRoute(
        path: 'admin/sso',
        name: 'admin-sso-config',
        builder: (context, state) => const AdminSsoConfigScreen(),
      ),
    ],
  ),
];
