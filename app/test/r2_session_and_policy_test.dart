import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/features/auth/data/auth_api.dart';
import 'package:worktodo_app/features/auth/screens/login_screen.dart';
import 'package:worktodo_app/features/me/appearance/me_appearance.dart';
import 'package:worktodo_app/features/me/screens/me_integrations_screen.dart';
import 'package:worktodo_app/features/me/screens/me_notifications_screen.dart';
import 'package:worktodo_app/design/design.dart';

import 'features/me/me_test_harness.dart';
import 'helpers/mock_api_client.dart';

void main() {
  testWidgets('WR-41 恢复登录会话时读取云端主题，重新登录再次读取', (tester) async {
    final h = await MeTestHarness.create();
    final appearance = MeAppearanceController();
    final sync = MeAppearanceSessionSync(h.authState, appearance);
    addTearDown(sync.dispose);
    await tester.pumpAndSettle();
    expect(appearance.themeMode, MeThemeMode.light);
    h.helper.whenGet('/users/me/ui-prefs', {
      'ui': {'theme_mode': 'dark'}
    });
    await h.authState.bootstrap();
    await tester.pumpAndSettle();
    expect(appearance.themeMode, MeThemeMode.dark);
    expect(
        h.helper.history.where((r) => r.url.path.endsWith('/ui-prefs')).length,
        2);
  });

  testWidgets('WR-41 换账号后旧会话迟到的主题不能覆盖新账号', (tester) async {
    final h = await MeTestHarness.create();
    final appearance = MeAppearanceController();
    h.helper.register(
        'GET',
        '/users/me/ui-prefs',
        {
          'ui': {'theme_mode': 'dark'}
        },
        delay: const Duration(seconds: 2));
    final sync = MeAppearanceSessionSync(h.authState, appearance);
    addTearDown(sync.dispose);
    await tester.pump();
    h.helper.whenGet('/users/me', {...MeTestHarness.userJson, 'id': 22});
    h.helper.whenGet('/users/me/ui-prefs', {
      'ui': {'theme_mode': 'light'}
    });
    await h.authState.api.tokens.save(access: 'second-user');
    await h.authState.bootstrap();
    await tester.pumpAndSettle();
    expect(appearance.themeMode, MeThemeMode.light);
    await tester.pump(const Duration(seconds: 3));
    expect(appearance.themeMode, MeThemeMode.light);
    expect(
        (await SharedPreferences.getInstance())
            .getString(MeAppearanceController.themeModeKey),
        'light');
  });

  testWidgets('WR-26 ASR查询失败时不勾选暂不启用', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final h = await MeTestHarness.create();
    h.helper.whenGet(
        '/users/me/bindings/asr', {'code': 404, 'message': '尚未提供接口'},
        statusCode: 404);
    await tester.pumpWidget(
        h.wrap(MeIntegrationsScreen(api: h.api, authState: h.authState)));
    await tester.pumpAndSettle();
    expect(find.textContaining('无法读取已保存的个人语音识别设置'), findsOneWidget);
    expect(find.text('未设置个人偏好，沿用企业默认语音服务'), findsNothing);
  });

  testWidgets('WR-26 初始读取期间不允许保存以免迟到读取覆盖新选择', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final h = await MeTestHarness.create();
    h.helper.register(
        'GET', '/users/me/bindings/asr', {'provider_id': 'cloud:whisper'},
        delay: const Duration(seconds: 2));
    h.helper
        .whenPut('/users/me/bindings/asr', {'provider_id': 'customer:whisper'});
    await tester.pumpWidget(
        h.wrap(MeIntegrationsScreen(api: h.api, authState: h.authState)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    await tester.tap(find.text('自有语音服务'));
    await tester.pump();
    expect(h.hasRequest('PUT', '/users/me/bindings/asr'), isFalse);
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
    await tester.tap(find.text('自有语音服务'));
    await tester.pumpAndSettle();
    final row = find
        .ancestor(of: find.text('自有语音服务'), matching: find.byType(InkWell))
        .first;
    expect(
        find.descendant(
            of: row,
            matching: find
                .byWidgetPredicate((w) => w is AppIcon && w.name == 'check')),
        findsOneWidget);
  });

  testWidgets('WR-29 旧后端不支持站内测试时说明原因且不报告发送成功', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final h = await MeTestHarness.create();
    h.helper.whenPost('/notify/test-send', {'detail': 'unsupported channel'},
        statusCode: 422);
    await tester.pumpWidget(h.wrap(MeNotificationsScreen(api: h.api)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('发送测试站内通知'));
    await tester.pumpAndSettle();
    expect(find.textContaining('服务端暂不支持站内通知测试'), findsOneWidget);
    expect(find.textContaining('测试站内通知已发送'), findsNothing);
  });

  for (final companyId in [null, 7]) {
    testWidgets('WR-36 企业$companyId禁用验证码时不显示验证码表单和帮助旁路', (tester) async {
      final helper = MockApiClientHelper();
      helper.whenGet('/auth/registration-config', {
        'login_methods': {'password': true, 'code': false}
      });
      await tester.pumpWidget(MaterialApp(
          home: LoginScreen(
              api: AuthApi(helper.buildClient()), companyId: companyId)));
      await tester.pumpAndSettle();
      expect(find.text('验证码免密登录'), findsNothing);
      expect(find.byKey(const ValueKey('login-target')), findsNothing);
      await tester.tap(find.text('找回密码帮助'));
      await tester.pumpAndSettle();
      expect(find.text('使用验证码直接登录'), findsNothing);
      expect(find.text('免密验证码登录：'), findsNothing);
      if (companyId != null) {
        expect(helper.history.single.url.queryParameters, {'company_id': '7'});
      }
    });
  }

  testWidgets('WR-36 企业配置缺失时不开放未经确认的登录入口', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/auth/registration-config', {'mode': 'open'});
    await tester.pumpWidget(MaterialApp(
        home: LoginScreen(api: AuthApi(helper.buildClient()), companyId: 7)));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('login-username')), findsNothing);
    expect(find.byKey(const ValueKey('login-target')), findsNothing);
    expect(find.text('重新读取登录方式'), findsOneWidget);
  });

  testWidgets('WR-36 两种本地登录方式均关闭时显示联系管理员', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/auth/registration-config', {
      'login_methods': {'password': false, 'code': false}
    });
    await tester.pumpWidget(
        MaterialApp(home: LoginScreen(api: AuthApi(helper.buildClient()))));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('login-username')), findsNothing);
    expect(find.byKey(const ValueKey('login-target')), findsNothing);
    expect(find.textContaining('请联系管理员使用企业登录入口'), findsOneWidget);
  });

  testWidgets('WR-36 读取企业配置期间不闪现密码入口', (tester) async {
    final helper = MockApiClientHelper();
    helper.register(
        'GET',
        '/auth/registration-config',
        {
          'login_methods': {'password': false, 'code': true}
        },
        delay: const Duration(seconds: 1));
    await tester.pumpWidget(MaterialApp(
        home: LoginScreen(api: AuthApi(helper.buildClient()), companyId: 7)));
    expect(find.byKey(const ValueKey('login-username')), findsNothing);
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('login-target')), findsOneWidget);
  });

  testWidgets('WR-36 切换企业后旧策略响应不能覆盖新策略', (tester) async {
    final helper = MockApiClientHelper();
    helper.register(
        'GET',
        '/auth/registration-config',
        {
          'login_methods': {'password': true, 'code': false}
        },
        query: {'company_id': '7'},
        delay: const Duration(seconds: 2));
    helper.whenGet('/auth/registration-config', {
      'login_methods': {'password': false, 'code': true}
    }, query: {
      'company_id': '8'
    });
    final api = AuthApi(helper.buildClient());
    await tester
        .pumpWidget(MaterialApp(home: LoginScreen(api: api, companyId: 7)));
    await tester
        .pumpWidget(MaterialApp(home: LoginScreen(api: api, companyId: 8)));
    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('login-username')), findsNothing);
    expect(find.byKey(const ValueKey('login-target')), findsOneWidget);
  });
}
