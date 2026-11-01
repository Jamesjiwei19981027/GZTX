import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/me/screens/me_notifications_screen.dart';

import 'me_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<MeTestHarness> pumpScreen(WidgetTester tester) async {
    final harness = await MeTestHarness.create();
    await tester.pumpWidget(
      harness.wrap(
        MeNotificationsScreen(api: harness.api, authState: harness.authState),
      ),
    );
    await tester.pumpAndSettle();
    return harness;
  }

  bool switchValue(WidgetTester tester, int index) {
    return tester.widget<AppSwitch>(find.byType(AppSwitch).at(index)).value;
  }

  testWidgets('按用户 notify_pref 渲染渠道与免打扰状态', (tester) async {
    MeTestHarness.useTallSurface(tester);
    await pumpScreen(tester);

    expect(find.text('邮件通知'), findsOneWidget);
    expect(find.text('系统推送'), findsOneWidget);
    expect(find.text('微信服务号提醒'), findsOneWidget);
    // 邮件开、推送开、微信关、周末静音关
    expect(switchValue(tester, 0), isTrue);
    expect(switchValue(tester, 1), isTrue);
    expect(switchValue(tester, 2), isFalse);
    expect(switchValue(tester, 3), isFalse);
  });

  testWidgets('关闭邮件通知会提交 notify_pref 并提示成功', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await pumpScreen(tester);
    harness.helper.whenPut('/users/me', MeTestHarness.userJson);

    await tester.tap(find.byType(AppSwitch).at(0));
    await tester.pumpAndSettle();

    final put = harness.lastRequest('PUT', '/users/me');
    final pref = (put.body as Map)['notify_pref'] as Map;
    expect((pref['channels'] as Map)['email'], {'enabled': false});
    expect((pref['channels'] as Map)['push'], {'enabled': true});
    expect(pref['quiet_hours'], {'start': '22:00', 'end': '08:00'});
    expect(pref['weekend_mute'], false);
    expect(find.text('已关闭邮件通知'), findsOneWidget);
  });

  testWidgets('保存失败时回滚开关并显示错误原因', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await pumpScreen(tester);
    harness.helper.whenPut('/users/me', '服务异常', statusCode: 500);

    await tester.tap(find.byType(AppSwitch).at(0));
    await tester.pumpAndSettle();

    expect(switchValue(tester, 0), isTrue);
    expect(find.textContaining('保存失败'), findsOneWidget);
  });

  testWidgets('免打扰时间格式非法时前端拦截，不发起请求', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await pumpScreen(tester);
    harness.helper.whenPut('/users/me', MeTestHarness.userJson);
    final before = harness.helper.history
        .where((r) => r.method == 'PUT')
        .length;

    await tester.enterText(
      find.byKey(const Key('me-notify-quiet-start')),
      '99:99',
    );
    await tester.tap(find.text('保存免打扰时段'));
    await tester.pumpAndSettle();

    expect(find.text('免打扰时间格式应为 HH:mm，例如 22:00'), findsOneWidget);
    expect(
      harness.helper.history.where((r) => r.method == 'PUT').length,
      before,
    );
  });

  testWidgets('修改免打扰时段并保存', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await pumpScreen(tester);
    harness.helper.whenPut('/users/me', MeTestHarness.userJson);

    await tester.enterText(
      find.byKey(const Key('me-notify-quiet-start')),
      '23:30',
    );
    await tester.enterText(
      find.byKey(const Key('me-notify-quiet-end')),
      '07:15',
    );
    await tester.tap(find.text('保存免打扰时段'));
    await tester.pumpAndSettle();

    final put = harness.lastRequest('PUT', '/users/me');
    final quiet = ((put.body as Map)['notify_pref'] as Map)['quiet_hours'];
    expect(quiet, {'start': '23:30', 'end': '07:15'});
    expect(find.text('免打扰时段已保存'), findsOneWidget);
  });

  testWidgets('测试邮件发送成功后提示并刷新数据', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await pumpScreen(tester);
    harness.helper.whenPost('/notify/test-send', {'ok': true});

    await tester.tap(find.text('发送测试邮件'));
    await tester.pumpAndSettle();

    final post = harness.lastRequest('POST', '/notify/test-send');
    expect((post.body as Map)['channel'], 'email');
    expect(find.text('测试邮件已发送，请检查收件箱'), findsOneWidget);
  });

  testWidgets('测试发送失败时展示后端给出的原因', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await pumpScreen(tester);
    harness.helper.whenPost('/notify/test-send', {
      'ok': false,
      'error': 'SMTP 未配置：请先在设置中填写主机/账号/密码',
    });

    await tester.tap(find.text('发送测试推送'));
    await tester.pumpAndSettle();

    expect(find.textContaining('SMTP 未配置'), findsOneWidget);
  });

  testWidgets('加载失败显示可重试错误态', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create();
    harness.helper.whenGet('/users/me', '服务异常', statusCode: 500);

    await tester.pumpWidget(
      harness.wrap(
        MeNotificationsScreen(api: harness.api, authState: harness.authState),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('加载失败'), findsOneWidget);
    expect(find.text('重新加载'), findsOneWidget);
  });
}
