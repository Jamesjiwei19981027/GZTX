import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/me/screens/admin/admin_asr_config_screen.dart';
import 'package:worktodo_app/features/me/screens/admin/admin_llm_config_screen.dart';
import 'package:worktodo_app/features/me/screens/admin/admin_model_keys_screen.dart';
import 'package:worktodo_app/features/me/screens/admin/admin_notify_channels_screen.dart';
import 'package:worktodo_app/features/me/screens/admin/admin_org_sso_screen.dart';
import 'package:worktodo_app/features/me/screens/admin/admin_push_certs_screen.dart';
import 'package:worktodo_app/features/me/screens/admin/admin_sso_config_screen.dart';
import 'package:worktodo_app/features/me/screens/me_about_screen.dart';
import 'package:worktodo_app/features/me/screens/me_account_screen.dart';
import 'package:worktodo_app/features/me/screens/me_appearance_screen.dart';
import 'package:worktodo_app/features/me/screens/me_billing_help_screen.dart';
import 'package:worktodo_app/features/me/screens/me_defaults_screen.dart';
import 'package:worktodo_app/features/me/screens/me_delete_account_screen.dart';
import 'package:worktodo_app/features/me/screens/me_help_screen.dart';
import 'package:worktodo_app/features/me/screens/me_integrations_screen.dart';
import 'package:worktodo_app/features/me/screens/me_notifications_screen.dart';
import 'package:worktodo_app/features/me/screens/me_notify_logs_screen.dart';
import 'package:worktodo_app/features/me/screens/me_profile_screen.dart';
import 'package:worktodo_app/features/me/screens/me_root_screen.dart';
import 'package:worktodo_app/features/me/screens/me_security_screen.dart';

import '../../helpers/responsive_checker.dart';
import 'me_test_harness.dart';

/// 总计划第六节适配要求：320 窄屏 / 430 宽屏 / 系统字号 200% / 深色模式，
/// iOS 与安卓两种风格都必须无布局溢出。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final pages = <String, Widget Function(MeTestHarness)>{
    '我的首页': (h) => MeRootScreen(api: h.api, authState: h.authState),
    '账号信息': (h) => MeAccountScreen(api: h.api, authState: h.authState),
    '个人资料': (h) => MeProfileScreen(api: h.api, authState: h.authState),
    '账号与安全': (h) => MeSecurityScreen(api: h.api, authState: h.authState),
    '外观与语言': (h) => MeAppearanceScreen(api: h.api, authState: h.authState),
    '通知与免打扰': (h) =>
        MeNotificationsScreen(api: h.api, authState: h.authState),
    '通知发送记录': (h) =>
        MeNotifyLogsScreen(api: h.api, authState: h.authState),
    '任务默认值': (h) => MeDefaultsScreen(api: h.api, authState: h.authState),
    '套餐隐私帮助': (h) =>
        MeBillingHelpScreen(api: h.api, authState: h.authState),
    '帮助中心': (h) => const MeHelpScreen(),
    '关于与版本': (h) => MeAboutScreen(api: h.api, authState: h.authState),
    '第三方绑定': (h) =>
        MeIntegrationsScreen(api: h.api, authState: h.authState),
    '注销账号': (h) =>
        MeDeleteAccountScreen(api: h.api, authState: h.authState),
    '管理员通知渠道': (h) =>
        AdminNotifyChannelsScreen(api: h.api, authState: h.authState),
    '管理员AI模型': (h) =>
        AdminLlmConfigScreen(api: h.api, authState: h.authState),
    '管理员模型密钥': (h) =>
        AdminModelKeysScreen(api: h.api, authState: h.authState),
    '管理员组织集成': (h) =>
        AdminOrgSsoScreen(api: h.api, authState: h.authState),
    '管理员推送证书': (h) =>
        AdminPushCertsScreen(api: h.api, authState: h.authState),
    '管理员语音识别': (h) =>
        AdminAsrConfigScreen(api: h.api, authState: h.authState),
    '管理员单点登录': (h) =>
        AdminSsoConfigScreen(api: h.api, authState: h.authState),
  };

  for (final entry in pages.entries) {
    testWidgets('适配检查：${entry.key} 在 320/430/字号200%/深色双平台无溢出', (tester) async {
      final harness = await MeTestHarness.create(isAdmin: true);
      await ResponsiveChecker.checkAdaptiveLayout(
        tester: tester,
        widget: entry.value(harness),
      );
      await tester.pumpAndSettle();
    });
  }

  testWidgets('键盘弹出时输入表单仍可滚动到保存按钮', (tester) async {
    final harness = await MeTestHarness.create();
    tester.view.physicalSize = const Size(390, 700);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(
            size: Size(390, 700),
            viewInsets: EdgeInsets.only(bottom: 320),
          ),
          child: MeProfileScreen(
            api: harness.api,
            authState: harness.authState,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // 键盘占去大半屏时，保存按钮仍可通过滚动到达
    await tester.scrollUntilVisible(
      find.text('保存修改'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.pumpAndSettle();
    expect(find.text('保存修改'), findsOneWidget);
  });

  testWidgets('字号 200% 时首页关键文案完整可见（未被截断成省略号）', (tester) async {
    final harness = await MeTestHarness.create(isAdmin: true);
    tester.view.physicalSize = const Size(390, 1200);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      harness.wrap(
        MeRootScreen(api: harness.api, authState: harness.authState),
        textScaler: const TextScaler.linear(2.0),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('个人资料'), findsOneWidget);
    expect(find.text('账号与安全'), findsOneWidget);
    expect(find.text('第三方服务绑定'), findsOneWidget);
    expect(find.textContaining('…'), findsNothing);
  });
}
