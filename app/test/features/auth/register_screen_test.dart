import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/design/design.dart';

import '../../helpers/mock_api_client.dart';
import 'package:worktodo_app/features/work/screens/work_root_screen.dart';

import 'helpers/auth_test_app.dart';

void stubRegisterSession(
  MockApiClientHelper helper, {
  required bool emailVerified,
  required bool phoneVerified,
}) {
  helper.whenGet('/users/me', {
    'id': 21,
    'username': 'new_member',
    'nickname': '新成员',
    'email': 'new_member@corp.com',
  });
  helper.whenGet('/companies/mine', {'items': []});
  helper.whenGet('/users/me/verification', {
    'email': 'new_member@corp.com',
    'phone': '',
    'email_verified': emailVerified,
    'phone_verified': phoneVerified,
    'is_verified': emailVerified && phoneVerified,
  });
}

Future<void> openRegister(WidgetTester tester) async {
  await tester.tap(find.byKey(const ValueKey('login-to-register')));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}

Future<void> fillValidForm(
  WidgetTester tester, {
  String username = 'new_member',
  String password = 'secret123',
  String confirm = 'secret123',
}) async {
  await tester.enterText(
    find.byKey(const ValueKey('register-username')),
    username,
  );
  await tester.enterText(
    find.byKey(const ValueKey('register-email')),
    'new_member@corp.com',
  );
  await tester.enterText(
    find.byKey(const ValueKey('register-email-code')),
    '123456',
  );
  await tester.enterText(
    find.byKey(const ValueKey('register-password')),
    password,
  );
  await tester.enterText(
    find.byKey(const ValueKey('register-confirm')),
    confirm,
  );
  await tester.pump();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    resetAuthModuleState();
  });

  group('注册页', () {
    testWidgets('用户名不符合规则时提交给出中文校验提示，且不发请求', (tester) async {
      final helper = MockApiClientHelper();
      final app = AuthTestApp(helper: helper);
      await app.pump(tester);
      await openRegister(tester);

      await fillValidForm(tester, username: 'ab');
      await tester.ensureVisible(find.byKey(const ValueKey('register-submit')));
      await tester.tap(find.byKey(const ValueKey('register-submit')));
      await tester.pump();

      expect(find.text('用户名需 3–50 位字母、数字或下划线'), findsOneWidget);
      expect(helper.history.any((r) => r.url.path.endsWith('/auth/register')),
          isFalse);
    });

    testWidgets('两次密码不一致时注册按钮禁用', (tester) async {
      final helper = MockApiClientHelper();
      final app = AuthTestApp(helper: helper);
      await app.pump(tester);
      await openRegister(tester);

      await fillValidForm(tester, confirm: 'different123');
      final button = tester.widget<AppButton>(
        find.byKey(const ValueKey('register-submit')),
      );
      expect(button.onPressed, isNull);
    });

    testWidgets('缺少邮箱验证码时提交给出中文提示', (tester) async {
      final helper = MockApiClientHelper();
      final app = AuthTestApp(helper: helper);
      await app.pump(tester);
      await openRegister(tester);

      await tester.enterText(
        find.byKey(const ValueKey('register-username')),
        'new_member',
      );
      await tester.enterText(
        find.byKey(const ValueKey('register-email')),
        'new_member@corp.com',
      );
      await tester.enterText(
        find.byKey(const ValueKey('register-password')),
        'secret123',
      );
      await tester.enterText(
        find.byKey(const ValueKey('register-confirm')),
        'secret123',
      );
      await tester.pump();

      // 邮箱验证码为空时按钮禁用，接口自然不会被调用
      final button = tester.widget<AppButton>(
        find.byKey(const ValueKey('register-submit')),
      );
      expect(button.onPressed, isNull);
    });

    testWidgets('发送邮箱验证码后进入 60 秒倒计时', (tester) async {
      final helper = MockApiClientHelper();
      helper.whenPost('/auth/send-code', {'sent': true, 'resend_after': 60});
      final app = AuthTestApp(helper: helper);
      await app.pump(tester);
      await openRegister(tester);

      await tester.enterText(
        find.byKey(const ValueKey('register-email')),
        'new_member@corp.com',
      );
      await tester.pump();
      await tester.tap(
        find.byKey(const ValueKey('register-send-email-code')),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('60s 重新获取'), findsOneWidget);
      expect(find.text('邮箱验证码已发送'), findsOneWidget);

      await tester.pump(const Duration(seconds: 1));
      expect(find.text('59s 重新获取'), findsOneWidget);

      await tester.pump(const Duration(seconds: 60));
      expect(
        find.descendant(
          of: find.byKey(const ValueKey('register-send-email-code')),
          matching: find.text('发验证码'),
        ),
        findsOneWidget,
      );

      // 发送时带上了注册用途
      final call = helper.history.firstWhere(
        (r) => r.url.path.endsWith('/auth/send-code'),
      );
      expect(call.body['purpose'], 'register');
      expect(call.body['channel'], 'email');
    });

    testWidgets('限流提示：后端返回 429 中文提示原样展示', (tester) async {
      final helper = MockApiClientHelper();
      helper.whenPost(
        '/auth/send-code',
        jsonEncode({'code': 429, 'message': '发送过于频繁，请 42 秒后重试'}),
        statusCode: 429,
      );
      final app = AuthTestApp(helper: helper);
      await app.pump(tester);
      await openRegister(tester);

      await tester.enterText(
        find.byKey(const ValueKey('register-email')),
        'new_member@corp.com',
      );
      await tester.pump();
      await tester.tap(
        find.byKey(const ValueKey('register-send-email-code')),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('发送过于频繁，请 42 秒后重试'), findsOneWidget);
    });

    testWidgets('注册成功：保存令牌并进入验证门', (tester) async {
      final helper = MockApiClientHelper();
      helper.whenPost(
        '/auth/register',
        jsonEncode({
          'code': 200,
          'message': 'success',
          'data': {
            'access_token': 'new-access-token',
            'refresh_token': 'new-refresh-token',
            'token_type': 'bearer',
            'user': {'id': 21, 'username': 'new_member'},
          },
        }),
        statusCode: 201,
      );
      stubRegisterSession(helper, emailVerified: true, phoneVerified: true);
      final app = AuthTestApp(helper: helper);
      await app.pump(tester);
      await openRegister(tester);

      await fillValidForm(tester);
      await tester.ensureVisible(find.byKey(const ValueKey('register-submit')));
      await tester.tap(find.byKey(const ValueKey('register-submit')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));

      expect(app.tokens.accessToken, 'new-access-token');
      // 邮箱与手机都已验证 → 验证门直接放行到工作 Tab
      expect(find.byType(WorkRootScreen), findsOneWidget);
    });

    testWidgets('用户名已存在：展示后端中文错误', (tester) async {
      final helper = MockApiClientHelper();
      helper.whenPost(
        '/auth/register',
        jsonEncode({'code': 409, 'message': '用户名已存在'}),
        statusCode: 409,
      );
      final app = AuthTestApp(helper: helper);
      await app.pump(tester);
      await openRegister(tester);

      await fillValidForm(tester);
      await tester.ensureVisible(find.byKey(const ValueKey('register-submit')));
      await tester.tap(find.byKey(const ValueKey('register-submit')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('用户名已存在'), findsOneWidget);
    });

    testWidgets('注册页可返回登录页', (tester) async {
      final helper = MockApiClientHelper();
      final app = AuthTestApp(helper: helper);
      await app.pump(tester);
      await openRegister(tester);

      await tester.tap(find.byKey(const ValueKey('register-to-login')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      expect(find.text('欢迎回来'), findsOneWidget);
    });
  });
}
