import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/models/user.dart';
import 'package:worktodo_app/features/auth/auth_paths.dart';
import 'package:worktodo_app/features/auth/models/auth_models.dart';
import 'package:worktodo_app/features/projects/invite_link.dart';
import 'package:worktodo_app/router/app_links.dart';

import '../../helpers/mock_api_client.dart';
import 'helpers/auth_test_app.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    resetAuthModuleState();
    PendingInviteHolder.clear();
  });

  tearDown(() {
    PendingInviteHolder.clear();
  });

  group('Launch Auth - 邀请制与手机门禁配置适配测试', () {
    test('isFullyVerified 判定逻辑按 phone_required 分支', () {
      const userEmailOnly = User(
        id: 1,
        username: 'u1',
        emailVerified: true,
        phoneVerified: false,
      );
      // phone_required = false 时只需邮箱验证
      expect(userEmailOnly.isFullyVerified(false), isTrue);
      // phone_required = true 时需要双重验证
      expect(userEmailOnly.isFullyVerified(true), isFalse);

      const userBothVerified = User(
        id: 2,
        username: 'u2',
        emailVerified: true,
        phoneVerified: true,
      );
      expect(userBothVerified.isFullyVerified(false), isTrue);
      expect(userBothVerified.isFullyVerified(true), isTrue);

      const status = VerificationStatus(
        emailVerified: true,
        phoneVerified: false,
      );
      expect(status.isFullyVerified(false), isTrue);
      expect(status.isFullyVerified(true), isFalse);
      expect(status.satisfies(VerifyRequirement.phone, phoneRequired: false), isTrue);
      expect(status.satisfies(VerifyRequirement.phone, phoneRequired: true), isFalse);
    });

    testWidgets('invite_only 且无邀请 token：登录页隐藏注册入口并显示提示', (tester) async {
      final helper = MockApiClientHelper();
      helper.whenGet('/auth/registration-config', {
        'mode': 'invite_only',
        'phone_required': false,
      });

      final app = AuthTestApp(helper: helper);
      await app.pump(tester);
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('login-to-register')), findsNothing);
      expect(find.text('仅限受邀注册，请向管理员索取邀请链接'), findsOneWidget);
    });

    testWidgets('invite_only 且通过 worktodo:// 链接解析到 token：显示注册入口', (tester) async {
      final validToken = 'invite_token_1234567890_abcdef';
      final normalized = normalizeAppLink(Uri.parse('worktodo://invite/$validToken'));
      expect(normalized, contains(validToken));
      expect(PendingInviteHolder.token, validToken);

      final helper = MockApiClientHelper();
      helper.whenGet('/auth/registration-config', {
        'mode': 'invite_only',
        'phone_required': false,
      });

      final app = AuthTestApp(helper: helper);
      await app.pump(tester);
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('login-to-register')), findsOneWidget);
      expect(find.text('仅限受邀注册，请向管理员索取邀请链接'), findsNothing);
    });

    testWidgets('注册页发送验证码和提交注册均携带 invite_token', (tester) async {
      final validToken = 'test_invite_token_1234567890123';
      PendingInviteHolder.set(validToken);

      final helper = MockApiClientHelper();
      helper.whenPost('/auth/send-code', {'sent': true, 'resend_after': 60});
      helper.whenPost('/auth/register', {
        'access_token': 'test-access-token',
        'refresh_token': 'test-refresh-token',
        'project_id': 99,
      });

      helper.whenGet('/users/me', {
        'id': 11,
        'username': 'reg_user',
        'email_verified': true,
        'phone_verified': false,
      });
      helper.whenGet('/companies/mine', {'items': []});
      helper.whenGet('/auth/registration-config', {
        'mode': 'invite_only',
        'phone_required': false,
      });

      final app = AuthTestApp(
        helper: helper,
        initialLocation: '${AuthPaths.register}?invite=$validToken',
      );
      await app.pump(tester);
      await tester.pumpAndSettle();

      // 输入邮箱并发送验证码
      await tester.enterText(
        find.byKey(const ValueKey('register-email')),
        'newuser@example.com',
      );
      await tester.pump();

      await tester.tap(find.byKey(const ValueKey('register-send-email-code')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      final sendCodeReq =
          helper.history.firstWhere((r) => r.url.path.endsWith('/auth/send-code'));
      expect(sendCodeReq.body['invite_token'], validToken);

      // 完成完整注册表单填写
      await tester.enterText(
        find.byKey(const ValueKey('register-username')),
        'newuser123',
      );
      await tester.enterText(
        find.byKey(const ValueKey('register-email-code')),
        '123456',
      );
      await tester.enterText(
        find.byKey(const ValueKey('register-password')),
        'password123',
      );
      await tester.enterText(
        find.byKey(const ValueKey('register-confirm')),
        'password123',
      );
      await tester.pump();

      await tester.tap(find.byKey(const ValueKey('register-submit')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      final registerReq =
          helper.history.firstWhere((r) => r.url.path.endsWith('/auth/register'));
      expect(registerReq.body['invite_token'], validToken);

      // 注册响应有 project_id 时，清除 token 并进入项目
      expect(PendingInviteHolder.token, isNull);
    });
  });
}
