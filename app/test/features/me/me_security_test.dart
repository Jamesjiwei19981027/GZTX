import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/me/screens/me_security_screen.dart';

import 'me_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<MeTestHarness> pumpScreen(WidgetTester tester) async {
    final harness = await MeTestHarness.create();
    await tester.pumpWidget(
      harness.wrap(
        MeSecurityScreen(api: harness.api, authState: harness.authState),
      ),
    );
    await tester.pumpAndSettle();
    return harness;
  }

  testWidgets('邮箱已验证显示绿色徽标文案，手机未验证显示灰色徽标文案', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await pumpScreen(tester);

    expect(find.text('已验证'), findsOneWidget);
    expect(find.text('未验证'), findsOneWidget);
    // 已绑定的邮箱与手机号都会展示
    expect(find.text('demo@example.com'), findsOneWidget);
    expect(find.text('13900000001'), findsOneWidget);
    expect(harness.hasRequest('GET', '/users/me/verification'), isTrue);
  });

  testWidgets('修改密码三条前端校验均不发起请求', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await pumpScreen(tester);
    harness.helper.whenPut('/users/me/password', {'ok': true});

    // 1. 原密码为空
    await tester.tap(find.text('更新密码'));
    await tester.pumpAndSettle();
    expect(find.text('请输入当前原密码'), findsOneWidget);

    // 2. 新密码不足 6 位
    await tester.enterText(
      find.byKey(const Key('me-security-old-password')),
      'old-pass',
    );
    await tester.enterText(
      find.byKey(const Key('me-security-new-password')),
      '12345',
    );
    await tester.tap(find.text('更新密码'));
    await tester.pumpAndSettle();
    expect(find.text('新密码长度不能少于 6 位'), findsOneWidget);

    // 3. 两次输入不一致
    await tester.enterText(
      find.byKey(const Key('me-security-new-password')),
      'new-pass-1',
    );
    await tester.enterText(
      find.byKey(const Key('me-security-confirm-password')),
      'new-pass-2',
    );
    await tester.tap(find.text('更新密码'));
    await tester.pumpAndSettle();
    expect(find.text('两次输入的新密码不一致'), findsOneWidget);

    expect(harness.hasRequest('PUT', '/users/me/password'), isFalse);
  });

  testWidgets('修改密码成功后清空输入并提示', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await pumpScreen(tester);
    harness.helper.whenPut('/users/me/password', {'ok': true});

    await tester.enterText(
      find.byKey(const Key('me-security-old-password')),
      'old-pass',
    );
    await tester.enterText(
      find.byKey(const Key('me-security-new-password')),
      'new-pass-1',
    );
    await tester.enterText(
      find.byKey(const Key('me-security-confirm-password')),
      'new-pass-1',
    );
    await tester.tap(find.text('更新密码'));
    await tester.pumpAndSettle();

    final put = harness.lastRequest('PUT', '/users/me/password');
    expect((put.body as Map)['old_password'], 'old-pass');
    expect((put.body as Map)['new_password'], 'new-pass-1');
    expect(find.text('密码修改成功，下次请使用新密码登录'), findsOneWidget);
  });

  testWidgets('修改密码失败时展示服务端中文原因', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await pumpScreen(tester);
    harness.helper.whenPut(
      '/users/me/password',
      {'code': 400, 'message': '原密码不正确'},
      statusCode: 400,
    );

    await tester.enterText(
      find.byKey(const Key('me-security-old-password')),
      'wrong',
    );
    await tester.enterText(
      find.byKey(const Key('me-security-new-password')),
      'new-pass-1',
    );
    await tester.enterText(
      find.byKey(const Key('me-security-confirm-password')),
      'new-pass-1',
    );
    await tester.tap(find.text('更新密码'));
    await tester.pumpAndSettle();

    expect(find.text('原密码不正确'), findsOneWidget);
  });

  testWidgets('手机号绑定流程：发送验证码并确认后徽标变为已验证', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await pumpScreen(tester);
    harness.helper.whenPost(
      '/users/me/verification/send-code',
      {'ok': true, 'cooldown_seconds': 60},
    );
    harness.helper.whenPost('/users/me/verification/confirm', {
      'email': 'demo@example.com',
      'phone': '13900000001',
      'email_verified': true,
      'phone_verified': true,
      'is_verified': true,
    });

    // 手机未验证 → 按钮文案为「验证」
    await tester.tap(find.text('验证'));
    await tester.pumpAndSettle();
    expect(find.text('绑定/验证手机'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('me-bind-code')), '123456');
    await tester.tap(find.byKey(const Key('me-bind-send')));
    await tester.pumpAndSettle();

    final send = harness.lastRequest(
      'POST',
      '/users/me/verification/send-code',
    );
    expect((send.body as Map)['channel'], 'sms');
    expect((send.body as Map)['target'], '13900000001');

    await tester.tap(find.byKey(const Key('me-bind-confirm')));
    await tester.pumpAndSettle();

    final confirm = harness.lastRequest(
      'POST',
      '/users/me/verification/confirm',
    );
    expect((confirm.body as Map)['code'], '123456');
    // 确认后回到页面，两处均为「已验证」
    expect(find.text('已验证'), findsNWidgets(2));
    expect(find.text('绑定验证成功'), findsOneWidget);
  });

  testWidgets('登录设备区块说明服务端无设备列表接口，并提供退出登录', (tester) async {
    MeTestHarness.useTallSurface(tester);
    await pumpScreen(tester);

    expect(find.text('登录设备'), findsOneWidget);
    expect(find.textContaining('未提供登录设备列表接口'), findsOneWidget);
    expect(find.text('退出当前登录'), findsOneWidget);
  });

  testWidgets('注销入口跳转到注销页', (tester) async {
    MeTestHarness.useTallSurface(tester);
    await pumpScreen(tester);
    expect(find.text('注销此账号'), findsOneWidget);
  });
}
