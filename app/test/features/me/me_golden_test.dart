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

import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/features/me/appearance/me_appearance.dart';

import '../../helpers/golden_test_helper.dart';
import 'me_test_harness.dart';

/// T09 全部页面的 iOS / 安卓双平台截图对比
///
/// 在 Windows 上执行 `flutter test test/features/me/me_golden_test.dart --update-goldens`
/// 生成基准图；CI 默认 `--exclude-tags golden` 跳过像素比对。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<MeTestHarness> harnessFor({bool isAdmin = false}) async {
    return MeTestHarness.create(isAdmin: isAdmin);
  }

  testWidgets(
    '我的首页双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await harnessFor(isAdmin: true);
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          MeRootScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'me_root',
      );
    },
  );

  testWidgets(
    '账号信息页双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await harnessFor();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          MeAccountScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'me_account',
      );
    },
  );

  testWidgets(
    '个人资料页双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await harnessFor();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          MeProfileScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'me_profile',
      );
    },
  );

  testWidgets(
    '账号与安全页双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await harnessFor();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          MeSecurityScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'me_security',
      );
    },
  );

  testWidgets(
    '外观与语言页双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await harnessFor();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          MeAppearanceScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'me_appearance',
      );
    },
  );

  testWidgets(
    '通知与免打扰页双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await harnessFor();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          MeNotificationsScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'me_notifications',
      );
    },
  );

  testWidgets(
    '通知发送记录页双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await harnessFor();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          MeNotifyLogsScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'me_notify_logs',
      );
    },
  );

  testWidgets(
    '任务默认值页双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await harnessFor();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          MeDefaultsScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'me_defaults',
      );
    },
  );

  testWidgets(
    '套餐隐私与帮助页双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await harnessFor();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          MeBillingHelpScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'me_billing_help',
      );
    },
  );

  testWidgets(
    '帮助中心页双平台截图',
    tags: ['golden'],
    (tester) async {
      await testAdaptiveGolden(
        tester: tester,
        widget: const MeHelpScreen(),
        goldenFileNamePrefix: 'me_help',
      );
    },
  );

  testWidgets(
    '关于与版本页双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await harnessFor();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          MeAboutScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'me_about',
      );
    },
  );

  testWidgets(
    '第三方服务绑定页双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await harnessFor();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          MeIntegrationsScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'me_integrations',
      );
    },
  );

  testWidgets(
    '注销账号页双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await harnessFor();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          MeDeleteAccountScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'me_delete_account',
      );
    },
  );

  testWidgets(
    '管理员-通知渠道配置页双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await harnessFor(isAdmin: true);
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          AdminNotifyChannelsScreen(
            api: harness.api,
            authState: harness.authState,
          ),
        ),
        goldenFileNamePrefix: 'admin_notify_channels',
      );
    },
  );

  testWidgets(
    '管理员-AI 模型配置页双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await harnessFor(isAdmin: true);
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          AdminLlmConfigScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'admin_llm_config',
      );
    },
  );

  testWidgets(
    '管理员-模型密钥配置页双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await harnessFor(isAdmin: true);
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          AdminModelKeysScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'admin_model_keys',
      );
    },
  );

  testWidgets(
    '管理员-组织与登录集成页双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await harnessFor(isAdmin: true);
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          AdminOrgSsoScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'admin_org_sso',
      );
    },
  );

  testWidgets(
    '管理员-推送证书状态页双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await harnessFor(isAdmin: true);
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          AdminPushCertsScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'admin_push_certs',
      );
    },
  );

  testWidgets(
    '管理员-语音识别配置页双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await harnessFor(isAdmin: true);
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          AdminAsrConfigScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'admin_asr_config',
      );
    },
  );

  testWidgets(
    '管理员-单点登录配置页双平台截图',
    tags: ['golden'],
    (tester) async {
      final harness = await harnessFor(isAdmin: true);
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          AdminSsoConfigScreen(api: harness.api, authState: harness.authState),
        ),
        goldenFileNamePrefix: 'admin_sso_config',
      );
    },
  );

  testWidgets(
    '我的首页深色模式双平台截图',
    tags: ['golden'],
    (tester) async {
      SharedPreferences.setMockInitialValues({
        MeAppearanceController.themeModeKey: 'dark',
      });
      final appearance = MeAppearanceController();
      await appearance.ensureLoaded();
      final harness = await harnessFor(isAdmin: true);
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          MeScreenAppearance(
            controller: appearance,
            child: MeRootScreen(
              api: harness.api,
              authState: harness.authState,
              appearance: appearance,
            ),
          ),
        ),
        goldenFileNamePrefix: 'me_root_dark',
      );
      appearance.resetForTest();
      SharedPreferences.setMockInitialValues({});
    },
  );
}
