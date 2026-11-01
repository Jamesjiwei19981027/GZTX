import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/design/design.dart';

import '../../helpers/mock_api_client.dart';
import 'helpers/auth_test_app.dart';

/// 预置登录成功后的必需接口
void stubSignedIn(
  MockApiClientHelper helper, {
  required bool emailVerified,
  required bool phoneVerified,
}) {
  helper.whenPost('/auth/login', {
    'access_token': 'access-token',
    'refresh_token': 'refresh-token',
    'token_type': 'bearer',
  });
  helper.whenGet('/users/me', {
    'id': 11,
    'username': 'e2e_user',
    'nickname': '端到端测试员',
    'email': 'e2e_user@example.com',
    'phone': '13900000001',
    'email_verified': emailVerified,
    'phone_verified': phoneVerified,
  });
  helper.whenGet('/companies/mine', {'items': []});
  helper.whenGet('/users/me/verification', {
    'email': 'e2e_user@example.com',
    'phone': '13900000001',
    'email_verified': emailVerified,
    'phone_verified': phoneVerified,
    'is_verified': emailVerified && phoneVerified,
  });
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    resetAuthModuleState();
  });

  group('登录页', () {
    testWidgets('密码错误时展示后端返回的中文错误，且不清空已输入内容', (tester) async {
      final helper = MockApiClientHelper();
      helper.whenPost(
        '/auth/login',
        jsonEncode({'code': 401, 'message': '账号或密码错误'}),
        statusCode: 401,
      );
      final app = AuthTestApp(helper: helper);
      await app.pump(tester);

      expect(find.text('欢迎回来'), findsOneWidget);

      await tester.enterText(
        find.byKey(const ValueKey('login-username')),
        'e2e_user',
      );
      await tester.enterText(
        find.byKey(const ValueKey('login-password')),
        'wrong-password',
      );
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('login-submit-password')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('账号或密码错误'), findsOneWidget);

      // 表单状态必须保留（对照网页版“提交失败严禁清空用户输入”）
      final usernameField = tester.widget<AppTextField>(
        find.byKey(const ValueKey('login-username')),
      );
      final passwordField = tester.widget<AppTextField>(
        find.byKey(const ValueKey('login-password')),
      );
      expect(usernameField.controller?.text, 'e2e_user');
      expect(passwordField.controller?.text, 'wrong-password');
    });

    testWidgets('断网登录失败时给出中文网络提示，而不是英文异常', (tester) async {
      final helper = MockApiClientHelper();
      helper.whenPost(
        '/auth/login',
        Exception('SocketException: Connection refused'),
      );
      final app = AuthTestApp(helper: helper);
      await app.pump(tester);

      await tester.enterText(
        find.byKey(const ValueKey('login-username')),
        'e2e_user',
      );
      await tester.enterText(
        find.byKey(const ValueKey('login-password')),
        'e2e-password-123',
      );
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('login-submit-password')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.text('网络连接异常或请求超时，请检查网络后重试'), findsOneWidget);
    });

    testWidgets('验证码登录：发送后进入 60 秒倒计时，倒计时期间按钮禁用且不重复请求', (tester) async {
      final helper = MockApiClientHelper();
      helper.whenPost('/auth/send-code', {'sent': true, 'resend_after': 60});
      final app = AuthTestApp(helper: helper);
      await app.pump(tester);

      await tester.tap(find.text('验证码免密登录'));
      await tester.pump();
      await tester.enterText(
        find.byKey(const ValueKey('login-target')),
        '13800000000',
      );
      await tester.pump();

      await tester.tap(find.byKey(const ValueKey('login-send-code')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('验证码已发送至您的手机/邮箱'), findsOneWidget);
      expect(find.text('60s 重新获取'), findsOneWidget);

      final sendButton = tester.widget<AppButton>(
        find.descendant(
          of: find.byKey(const ValueKey('login-send-code')),
          matching: find.byType(AppButton),
        ),
      );
      expect(sendButton.onPressed, isNull, reason: '倒计时期间应禁用发送按钮');

      // 倒计时递减
      await tester.pump(const Duration(seconds: 1));
      expect(find.text('59s 重新获取'), findsOneWidget);

      // 倒计时期间点击不会再次请求
      await tester.tap(find.byKey(const ValueKey('login-send-code')));
      await tester.pump();
      final sendCodeCalls = helper.history
          .where((r) => r.method == 'POST' && r.url.path.endsWith('/auth/send-code'))
          .length;
      expect(sendCodeCalls, 1);

      // 走完倒计时，避免残留定时器
      await tester.pump(const Duration(seconds: 60));
      expect(find.text('获取验证码'), findsOneWidget);
    });

    testWidgets('验证码格式非法时提示中文错误且不请求接口', (tester) async {
      final helper = MockApiClientHelper();
      final app = AuthTestApp(helper: helper);
      await app.pump(tester);

      await tester.tap(find.text('验证码免密登录'));
      await tester.pump();
      await tester.enterText(
        find.byKey(const ValueKey('login-target')),
        'not-a-phone',
      );
      await tester.enterText(find.byKey(const ValueKey('login-code')), '123456');
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('login-submit-code')));
      await tester.pump();

      expect(find.text('请输入有效的手机号或工作邮箱'), findsOneWidget);
      expect(helper.history.any((r) => r.url.path.endsWith('/auth/login-code')),
          isFalse);
    });

    testWidgets('邮箱未验证：登录成功后进入验证门（完成邮箱验证）', (tester) async {
      final helper = MockApiClientHelper();
      stubSignedIn(helper, emailVerified: false, phoneVerified: false);
      final app = AuthTestApp(helper: helper);
      await app.pump(tester);

      await tester.enterText(
        find.byKey(const ValueKey('login-username')),
        'e2e_user',
      );
      await tester.enterText(
        find.byKey(const ValueKey('login-password')),
        'e2e-password-123',
      );
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('login-submit-password')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('完成邮箱验证'), findsOneWidget);
      expect(app.tokens.accessToken, 'access-token');
    });

    testWidgets('邮箱与手机都已验证：登录后直接进入工作 Tab', (tester) async {
      final helper = MockApiClientHelper();
      stubSignedIn(helper, emailVerified: true, phoneVerified: true);
      final app = AuthTestApp(helper: helper);
      await app.pump(tester);

      await tester.enterText(
        find.byKey(const ValueKey('login-username')),
        'e2e_user',
      );
      await tester.enterText(
        find.byKey(const ValueKey('login-password')),
        'e2e-password-123',
      );
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('login-submit-password')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('工作 (T02)'), findsOneWidget);
      expect(app.authState.status.name, 'authenticated');
    });

    testWidgets('验证码登录成功路径：提交后进入验证门', (tester) async {
      final helper = MockApiClientHelper();
      stubSignedIn(helper, emailVerified: false, phoneVerified: false);
      helper.whenPost('/auth/login-code', {
        'access_token': 'access-token',
        'refresh_token': 'refresh-token',
      });
      final app = AuthTestApp(helper: helper);
      await app.pump(tester);

      await tester.tap(find.text('验证码免密登录'));
      await tester.pump();
      await tester.enterText(
        find.byKey(const ValueKey('login-target')),
        'e2e_user@example.com',
      );
      await tester.enterText(find.byKey(const ValueKey('login-code')), '123456');
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('login-submit-code')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('完成邮箱验证'), findsOneWidget);
    });

    testWidgets('登录页可跳转注册页', (tester) async {
      final helper = MockApiClientHelper();
      final app = AuthTestApp(helper: helper);
      await app.pump(tester);

      await tester.tap(find.byKey(const ValueKey('login-to-register')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('注册新账号'), findsOneWidget);
      expect(find.text('用户名'), findsWidgets);
    });
  });
}
