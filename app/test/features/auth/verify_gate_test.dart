import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/mock_api_client.dart';
import 'helpers/auth_test_app.dart';

Map<String, dynamic> verification({
  required bool emailVerified,
  required bool phoneVerified,
  String email = 'e2e_user@example.com',
  String phone = '13900000001',
}) {
  return {
    'email': email,
    'phone': phone,
    'email_verified': emailVerified,
    'phone_verified': phoneVerified,
    'is_verified': emailVerified && phoneVerified,
  };
}

Future<AuthTestApp> pumpApp(
  WidgetTester tester,
  MockApiClientHelper helper, {
  required Map<String, dynamic> status,
}) async {
  helper.whenGet('/users/me', {
    'id': 11,
    'username': 'e2e_user',
    'nickname': '端到端测试员',
  });
  helper.whenGet('/companies/mine', {'items': []});
  helper.whenGet('/users/me/verification', status);

  final app = AuthTestApp(helper: helper, authenticated: true);
  await app.pump(tester);
  return app;
}

Future<void> goVerify(
  WidgetTester tester,
  AuthTestApp app, {
  String required = 'email',
}) async {
  // 用 push 模拟“从工作 Tab 打开验证门”，返回时出栈即可，符合真实交互
  app.appRouter.router.push('/verify?required=$required');
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 350));
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    resetAuthModuleState();
  });

  group('验证门', () {
    testWidgets('邮箱未验证时进入验证页并显示未验证状态与绑定表单', (tester) async {
      final helper = MockApiClientHelper();
      final app = await pumpApp(
        tester,
        helper,
        status: verification(emailVerified: false, phoneVerified: false),
      );
      await goVerify(tester, app);

      expect(find.text('完成邮箱验证'), findsOneWidget);
      expect(find.text('未验证'), findsWidgets);
      expect(find.text('邮箱验证'), findsOneWidget);
      expect(find.byKey(const ValueKey('verify-confirm-email')), findsOneWidget);
      expect(find.text('退出登录'), findsOneWidget);
    });

    testWidgets('确认邮箱验证码成功后校验手机提醒，稍后提醒即进入工作 Tab', (tester) async {
      final helper = MockApiClientHelper();
      final app = await pumpApp(
        tester,
        helper,
        status: verification(emailVerified: false, phoneVerified: false),
      );
      helper.whenPost('/users/me/verification/confirm', {
        'email_verified': true,
        'phone_verified': false,
        'is_verified': false,
      });
      await goVerify(tester, app);

      await tester.enterText(
        find.byKey(const ValueKey('verify-code-email')),
        '123456',
      );
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('verify-confirm-email')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));

      // 邮箱验证成功、手机未验证 → 按一周规则弹提醒
      expect(find.text('手机号码尚未验证'), findsOneWidget);
      await tester.tap(find.text('稍后提醒'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('工作 (T02)'), findsOneWidget);
    });

    testWidgets('邮箱与手机均已验证时验证门直接放行到工作 Tab', (tester) async {
      final helper = MockApiClientHelper();
      final app = await pumpApp(
        tester,
        helper,
        status: verification(emailVerified: true, phoneVerified: true),
      );
      await goVerify(tester, app);

      expect(find.text('工作 (T02)'), findsOneWidget);
    });

    testWidgets('已验证显示绿色“已验证”，未验证显示“未验证”', (tester) async {
      final helper = MockApiClientHelper();
      final app = await pumpApp(
        tester,
        helper,
        status: verification(emailVerified: true, phoneVerified: false),
      );
      await goVerify(tester, app, required: 'phone');

      expect(find.text('协作功能需要补验手机'), findsOneWidget);
      expect(find.text('已验证'), findsOneWidget);
      expect(find.text('未验证'), findsOneWidget);
    });

    testWidgets('验证状态加载失败时展示可重试的错误页，重试会再次请求', (tester) async {
      final helper = MockApiClientHelper();
      helper.whenGet('/users/me', {'id': 11, 'username': 'e2e_user'});
      helper.whenGet('/companies/mine', {'items': []});
      helper.whenGet(
        '/users/me/verification',
        jsonEncode({'code': 500, 'message': '服务内部错误'}),
        statusCode: 500,
      );
      final app = AuthTestApp(helper: helper, authenticated: true);
      await app.pump(tester);
      await goVerify(tester, app);

      expect(find.text('验证状态加载失败'), findsOneWidget);
      expect(find.text('服务内部错误'), findsOneWidget);

      final before = helper.history
          .where((r) => r.url.path.endsWith('/users/me/verification'))
          .length;
      await tester.tap(find.text('重试'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      final after = helper.history
          .where((r) => r.url.path.endsWith('/users/me/verification'))
          .length;
      expect(after, before + 1);
      expect(find.text('验证状态加载失败'), findsOneWidget);
    });

    testWidgets('断网时给出中文网络错误并保留重试入口', (tester) async {
      final helper = MockApiClientHelper();
      helper.whenGet('/users/me', {'id': 11, 'username': 'e2e_user'});
      helper.whenGet('/companies/mine', {'items': []});
      helper.whenGet(
        '/users/me/verification',
        Exception('SocketException: Connection refused'),
      );
      final app = AuthTestApp(helper: helper, authenticated: true);
      await app.pump(tester);
      await goVerify(tester, app);

      expect(find.text('验证状态加载失败'), findsOneWidget);
      expect(find.text('网络连接异常或请求超时，请检查网络后重试'), findsOneWidget);
      expect(find.text('重试'), findsOneWidget);
    });

    testWidgets('退出登录会清空令牌并回到登录页', (tester) async {
      final helper = MockApiClientHelper();
      helper.whenPost('/auth/logout', {'ok': true});
      final app = await pumpApp(
        tester,
        helper,
        status: verification(emailVerified: false, phoneVerified: false),
      );
      await goVerify(tester, app);

      expect(app.tokens.accessToken, isNotNull);
      await tester.tap(find.byKey(const ValueKey('verify-logout')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));

      expect(app.tokens.accessToken, isNull);
      expect(app.authState.currentUser, isNull);
      expect(find.text('欢迎回来'), findsOneWidget);
    });
  });
}
