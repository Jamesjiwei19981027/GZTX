import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/features/auth/data/auth_api.dart';
import 'package:worktodo_app/features/auth/data/native_sso.dart';
import 'package:worktodo_app/features/auth/models/auth_models.dart';
import 'package:worktodo_app/features/auth/screens/login_screen.dart';
import 'package:worktodo_app/features/auth/screens/reset_password_screen.dart';
import 'package:worktodo_app/features/projects/invite_link.dart';
import 'package:worktodo_app/router/app_links.dart';
import '../../helpers/mock_api_client.dart';
import 'helpers/auth_test_app.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    resetAuthModuleState();
    PendingInviteHolder.clear();
  });
  test('企业关闭密码时验证码登录也同步关闭', () {
    final config = RegistrationConfig.fromJson({
      'login_methods': {'password': false}
    });
    expect(config.passwordEnabled, isFalse);
    expect(config.codeEnabled, isFalse);
  });

  test('PKCE 使用 RFC7636 S256，不包含明文 verifier', () {
    expect(
        NativeSso.challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
        'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  test('原生 SSO 安全存储跨实例恢复且通过 verifier 换票一次', () async {
    final helper = MockApiClientHelper();
    helper.whenPost('/sso/complete',
        {'access_token': 'signed-access', 'refresh_token': 'signed-refresh'});
    final api =
        AuthApi(helper.buildClient(tokenStorage: InMemoryTokenStorage()));
    Uri? launched;
    await NativeSso(api, launch: (uri) async {
      launched = uri;
      return true;
    }).begin(31);
    final raw =
        await const FlutterSecureStorage().read(key: NativeSso.storageKey);
    final stored = jsonDecode(raw!) as Map;
    expect(launched!.path, '/api/v1/sso/dingtalk');
    expect(launched!.queryParameters['company_id'], '31');
    expect(launched!.queryParameters['return_to'], 'worktodo://sso/callback');
    expect(launched!.queryParameters['code_challenge_method'], 'S256');
    expect(launched.toString(), isNot(contains(stored['verifier'])));
    expect(launched!.queryParameters['code_challenge'],
        NativeSso.challengeFor(stored['verifier'] as String));
    final session = await NativeSso(api).complete('t' * 43);
    expect(session.accessToken, 'signed-access');
    expect(helper.history.last.body,
        {'ticket': 't' * 43, 'code_verifier': stored['verifier']});
    expect(await const FlutterSecureStorage().read(key: NativeSso.storageKey),
        isNull);
    await expectLater(NativeSso(api).complete('t' * 43), throwsException);
    expect(helper.history.length, 1);
  });

  test('PKCE 过期或切换服务器时本机拒绝换票，启动浏览器失败清除 pending', () async {
    final helper = MockApiClientHelper();
    final api =
        AuthApi(helper.buildClient(tokenStorage: InMemoryTokenStorage()));
    final now = DateTime.utc(2026, 11, 9);
    await NativeSso(api, now: () => now, launch: (_) async => true).begin(1);
    await expectLater(
        NativeSso(api, now: () => now.add(const Duration(minutes: 11)))
            .complete('t' * 43),
        throwsException);
    expect(helper.history, isEmpty);
    await NativeSso(api, launch: (_) async => true).begin(1);
    final pending = jsonDecode((await const FlutterSecureStorage()
        .read(key: NativeSso.storageKey))!) as Map;
    pending['api_base'] = 'https://other.example/api/v1';
    await const FlutterSecureStorage()
        .write(key: NativeSso.storageKey, value: jsonEncode(pending));
    await expectLater(NativeSso(api).complete('t' * 43), throwsException);
    expect(helper.history, isEmpty);
    await expectLater(
        NativeSso(api, launch: (_) async => false).begin(1), throwsException);
    expect(await const FlutterSecureStorage().read(key: NativeSso.storageKey),
        isNull);
  });

  testWidgets('系统深链冷启动恢复本机PKCE，换票后通过真实AuthFlow进入验证门', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenPost('/sso/complete', {
      'access_token': 'native-sso-access',
      'refresh_token': 'native-sso-refresh'
    });
    helper.whenGet('/users/me',
        {'id': 8, 'username': 'sso-user', 'email_verified': false});
    helper.whenGet('/companies/mine', {'items': []});
    helper.whenGet('/users/me/verification', {
      'email': 'user@example.test',
      'email_verified': false,
      'phone_verified': false
    });
    final tokens = InMemoryTokenStorage();
    final app = AuthTestApp(
        helper: helper,
        tokenStorage: tokens,
        initialLocation: 'worktodo://sso/callback#sso_ticket=${'t' * 43}');
    // 模拟浏览器打开后 APP 被回收；恢复页会构造另一份 NativeSso。
    await NativeSso(AuthApi(app.client), launch: (_) async => true).begin(31);
    await app.pump(tester);
    await tester.pumpAndSettle();
    expect(tokens.accessToken, 'native-sso-access');
    expect(tokens.refreshToken, 'native-sso-refresh');
    expect(app.authState.isAuthenticated, isTrue);
    expect(app.appRouter.router.routeInformationProvider.value.uri.path,
        '/verify');
    expect(find.text('完成邮箱验证'), findsOneWidget);
    expect(await const FlutterSecureStorage().read(key: NativeSso.storageKey),
        isNull);
    expect(
        helper.history
            .where((request) => request.url.path.endsWith('/sso/complete'))
            .length,
        1);
    await tester.pumpWidget(const SizedBox());
    app.appRouter.router.dispose();
    app.authState.dispose();
  });

  testWidgets('登录的忘记密码入口走真实重置页，成功返回登录并填入账号', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/auth/registration-config',
        {'mode': 'invite_only', 'phone_required': false});
    helper.whenPost('/auth/reset-password', {'code': 200, 'data': null});
    final app = AuthTestApp(helper: helper);
    await app.pump(tester);
    await tester.pumpAndSettle();
    await tester.tap(find.text('忘记密码'));
    await tester.pumpAndSettle();
    expect(find.byType(ResetPasswordScreen), findsOneWidget);
    await tester.enterText(
        find.byKey(const ValueKey('reset-target')), 'member@example.test');
    await tester.enterText(find.byKey(const ValueKey('reset-code')), '123456');
    await tester.enterText(
        find.byKey(const ValueKey('reset-new-password')), 'password123');
    await tester.enterText(
        find.byKey(const ValueKey('reset-confirm-password')), 'password123');
    await tester.ensureVisible(find.byKey(const ValueKey('reset-submit')));
    await tester.tap(find.byKey(const ValueKey('reset-submit')));
    await tester.pumpAndSettle();
    expect(find.text('密码已重置，请使用新密码登录'), findsOneWidget);
    expect(
        app.appRouter.router.routeInformationProvider.value.uri.path, '/login');
    expect(app.tokens.hasAccess, isFalse);
    await tester.pumpWidget(const SizedBox());
    app.appRouter.router.dispose();
    app.authState.dispose();
  });

  test('SSO 回调仅接受票据，原邀请深链不变', () {
    expect(
        normalizeAppLink(
            Uri.parse('worktodo://sso/callback#sso_ticket=${'a' * 43}')),
        '/login/sso-callback?ticket=${'a' * 43}');
    for (final link in [
      'worktodo://sso/other#sso_ticket=${'a' * 43}',
      'worktodo://sso/callback?ticket=${'a' * 43}',
      'worktodo://sso/callback#access_token=${'a' * 43}',
      'worktodo://sso/callback#sso_ticket=short',
      'worktodo://sso/callback#sso_ticket=${'a' * 43}&sso_ticket=${'b' * 43}',
      'https://evil.test/callback#sso_ticket=${'a' * 43}',
    ]) {
      expect(normalizeAppLink(Uri.parse(link)), isNull, reason: link);
    }
    final token = 'invite_token_1234567890_abcdef';
    expect(normalizeAppLink(Uri.parse('worktodo://invite/$token')),
        contains(token));
    expect(PendingInviteHolder.token, token);
  });

  testWidgets('密码关闭时隐藏密码和验证码，仅在企业启用且服务配置可用时显示钉钉', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/auth/registration-config', {
      'mode': 'invite_only',
      'login_methods': {'password': false, 'dingtalk': true}
    });
    helper.whenGet('/sso/options', {
      'items': [
        {'provider': 'dingtalk', 'company_id': 31}
      ]
    });
    final api = AuthApi(helper.buildClient());
    final sso = NativeSso(api, launch: (_) async => true);
    await tester.pumpWidget(
        MaterialApp(home: LoginScreen(api: api, companyId: 31, sso: sso)));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('login-username')), findsNothing);
    expect(find.byKey(const ValueKey('login-target')), findsNothing);
    expect(find.text('验证码免密登录'), findsNothing);
    expect(find.byKey(const ValueKey('login-dingtalk')), findsOneWidget);
    await tester.ensureVisible(find.byKey(const ValueKey('login-dingtalk')));
    await tester.tap(find.byKey(const ValueKey('login-dingtalk')));
    await tester.pumpAndSettle();
    expect(await const FlutterSecureStorage().read(key: NativeSso.storageKey),
        isNotNull);
    helper.whenGet('/sso/options', {'items': []});
    await tester.pumpWidget(MaterialApp(
        home: LoginScreen(
            key: const ValueKey('unconfigured'), api: api, companyId: 31)));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('login-dingtalk')), findsNothing);
    expect(find.textContaining('未开放本页支持'), findsOneWidget);
  });

  for (final target in ['member@example.test', '13800138000']) {
    testWidgets('真实找回密码表单支持 $target，校验失败保留输入，成功不自动登录', (tester) async {
      tester.view.physicalSize = const Size(430, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final helper = MockApiClientHelper();
      helper.whenPost('/auth/send-code', {'ok': true, 'cooldown_seconds': 60});
      helper.whenPost(
          '/auth/reset-password', {'code': 400, 'message': '验证码无效或已过期'},
          statusCode: 400);
      final tokens = InMemoryTokenStorage();
      String? completed;
      await tester.pumpWidget(MaterialApp(
          home: ResetPasswordScreen(
              api: AuthApi(helper.buildClient(tokenStorage: tokens)),
              onReset: (value) => completed = value)));
      await tester.enterText(
          find.byKey(const ValueKey('reset-target')), target);
      await tester.tap(find.byKey(const ValueKey('reset-send-code')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(helper.history.first.body, {
        'channel': target.contains('@') ? 'email' : 'sms',
        'target': target,
        'purpose': 'reset_password'
      });
      await tester.enterText(
          find.byKey(const ValueKey('reset-code')), '123456');
      await tester.enterText(
          find.byKey(const ValueKey('reset-new-password')), 'password123');
      await tester.enterText(
          find.byKey(const ValueKey('reset-confirm-password')), 'mismatch');
      await tester.ensureVisible(find.byKey(const ValueKey('reset-submit')));
      await tester.tap(find.byKey(const ValueKey('reset-submit')));
      await tester.pump();
      expect(find.text('两次输入的密码不一致'), findsOneWidget);
      expect(helper.history.length, 1);
      await tester.enterText(
          find.byKey(const ValueKey('reset-confirm-password')), 'password123');
      await tester.ensureVisible(find.byKey(const ValueKey('reset-submit')));
      await tester.tap(find.byKey(const ValueKey('reset-submit')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(find.text('验证码无效或已过期'), findsOneWidget);
      helper.whenPost('/auth/reset-password', {'code': 200, 'data': null});
      await tester.ensureVisible(find.byKey(const ValueKey('reset-submit')));
      await tester.tap(find.byKey(const ValueKey('reset-submit')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      expect(completed, target);
      expect(tokens.hasAccess, isFalse);
      expect(helper.history.last.body, {
        'channel': target.contains('@') ? 'email' : 'sms',
        'target': target,
        'code': '123456',
        'new_password': 'password123'
      });
      await tester.pumpWidget(const SizedBox());
    });
  }
}
