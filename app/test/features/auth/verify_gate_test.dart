import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/design/design.dart';

import '../../helpers/mock_api_client.dart';
import 'package:worktodo_app/features/work/screens/work_root_screen.dart';

import 'helpers/auth_test_app.dart';

/// 取“发验证码”按钮内部真实的 [AppButton]，用于断言可用状态
AppButton sendCodeButton(WidgetTester tester, String channel) {
  return tester.widget<AppButton>(
    find.descendant(
      of: find.byKey(ValueKey('verify-send-$channel')),
      matching: find.byType(AppButton),
    ),
  );
}

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
      expect(
          find.byKey(const ValueKey('verify-confirm-email')), findsOneWidget);
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

      expect(find.byType(WorkRootScreen), findsOneWidget);
    });

    testWidgets('邮箱与手机均已验证时验证门直接放行到工作 Tab', (tester) async {
      final helper = MockApiClientHelper();
      final app = await pumpApp(
        tester,
        helper,
        status: verification(emailVerified: true, phoneVerified: true),
      );
      await goVerify(tester, app);

      expect(find.byType(WorkRootScreen), findsOneWidget);
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
      await tester.tap(find.text('重试').hitTestable());
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
      expect(find.text('重试').hitTestable(), findsOneWidget);
    });

    testWidgets('接口返回空手机号时，输入合法手机号后“发验证码”按钮变为可点', (tester) async {
      final helper = MockApiClientHelper();
      // 只用邮箱注册的用户：手机号为空，首次进入手机补验门
      final app = await pumpApp(
        tester,
        helper,
        status: verification(
          emailVerified: true,
          phoneVerified: false,
          phone: '',
        ),
      );
      await goVerify(tester, app, required: 'phone');

      expect(
        sendCodeButton(tester, 'sms').onPressed,
        isNull,
        reason: '手机号为空时“获取短信验证码”应禁用',
      );

      await tester.enterText(
        find.byKey(const ValueKey('verify-target-sms')),
        '13900000002',
      );
      await tester.pump();

      expect(
        sendCodeButton(tester, 'sms').onPressed,
        isNotNull,
        reason: '输入合法手机号后应重新计算并变为可点',
      );
    });

    testWidgets('接口返回空邮箱时，输入合法邮箱后“发验证码”按钮变为可点', (tester) async {
      final helper = MockApiClientHelper();
      final app = await pumpApp(
        tester,
        helper,
        status: verification(
          emailVerified: false,
          phoneVerified: false,
          email: '',
        ),
      );
      await goVerify(tester, app);

      expect(
        sendCodeButton(tester, 'email').onPressed,
        isNull,
        reason: '邮箱为空时“发送验证码”应禁用',
      );

      await tester.enterText(
        find.byKey(const ValueKey('verify-target-email')),
        'new_user@example.com',
      );
      await tester.pump();

      expect(
        sendCodeButton(tester, 'email').onPressed,
        isNotNull,
        reason: '输入合法邮箱后应重新计算并变为可点',
      );
    });

    testWidgets('邮箱验证通过后去绑定手机，手机验证成功可正常离开验证页', (tester) async {
      final helper = MockApiClientHelper();
      final app = await pumpApp(
        tester,
        helper,
        status: verification(emailVerified: true, phoneVerified: false),
      );
      helper.whenPost('/users/me/verification/confirm', {
        'email_verified': true,
        'phone_verified': true,
        'is_verified': true,
      });
      // 与登录 / 全局验证门一致：用 `go` 进入验证门（不是 push），
      // 这样 `/verify?required=email` 与 `/verify?required=phone` 复用同一页面状态，
      // 正是审核指出的场景。
      app.appRouter.router.go('/verify?required=email');
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pump(const Duration(milliseconds: 50));

      // 邮箱已满足要求 → 直接弹出“手机号尚未验证”提醒
      expect(find.text('手机号码尚未验证'), findsOneWidget);
      await tester.tap(find.text('去绑定手机'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pump(const Duration(milliseconds: 50));
      // 同一路由换 query：页面应切换到手机补验视图
      expect(find.text('协作功能需要补验手机'), findsOneWidget);

      await tester.enterText(
        find.byKey(const ValueKey('verify-target-sms')),
        '13900000002',
      );
      await tester.enterText(
        find.byKey(const ValueKey('verify-code-sms')),
        '123456',
      );
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('verify-confirm-sms')));
      // 一次 pump 让确认请求落地并触发离场跳转，再等页面/导航动画结束
      await tester.pump();
      await tester.pumpAndSettle();

      // 手机验证成功后必须真正离开验证页（旧实现会卡在这一页）
      expect(find.text('协作功能需要补验手机'), findsNothing);
      expect(find.byType(WorkRootScreen), findsOneWidget);
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
      expect(find.text('登录'), findsOneWidget);
    });
  });
}
