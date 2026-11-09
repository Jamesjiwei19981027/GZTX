import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/me/screens/me_about_screen.dart';
import 'package:worktodo_app/features/me/screens/me_billing_help_screen.dart';
import 'package:worktodo_app/features/me/screens/me_delete_account_screen.dart';
import 'package:worktodo_app/features/me/screens/me_help_screen.dart';
import 'package:worktodo_app/features/me/screens/me_integrations_screen.dart';

import 'me_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('套餐、隐私与帮助', () {
    testWidgets('渲染套餐与隐私信息', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await MeTestHarness.create();
      await tester.pumpWidget(harness.wrap(
        MeBillingHelpScreen(api: harness.api, authState: harness.authState),
      ));
      await tester.pumpAndSettle();

      expect(find.text('正常履约'), findsOneWidget);
      expect(find.text('企业专业版'), findsOneWidget);
      expect(find.text('服务管理方：平台运维'), findsOneWidget);
      expect(find.text('180 天'), findsOneWidget);
      expect(find.text('/api/v1/users/me/export'), findsOneWidget);
    });

    testWidgets('单个接口失败时保留另一半内容并提示', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await MeTestHarness.create();
      harness.helper.whenGet('/users/me/billing', '服务异常', statusCode: 500);
      await tester.pumpWidget(harness.wrap(
        MeBillingHelpScreen(api: harness.api, authState: harness.authState),
      ));
      await tester.pumpAndSettle();

      expect(find.textContaining('套餐信息读取失败'), findsOneWidget);
      expect(find.text('180 天'), findsOneWidget);
    });

    testWidgets('两个接口都失败时进入错误态并可重试', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await MeTestHarness.create();
      harness.helper.whenGet('/users/me/billing', '服务异常', statusCode: 500);
      harness.helper.whenGet('/users/me/privacy', '服务异常', statusCode: 500);
      await tester.pumpWidget(harness.wrap(
        MeBillingHelpScreen(api: harness.api, authState: harness.authState),
      ));
      await tester.pumpAndSettle();

      expect(find.text('加载失败'), findsOneWidget);

      harness.helper.whenGet('/users/me/billing', {
        'status': 'active',
        'plan_code': '企业专业版',
        'managed_by': '平台运维',
      });
      harness.helper.whenGet('/users/me/privacy', {
        'retention': '180 天',
        'export_endpoint': '/api/v1/users/me/export',
      });
      await tester.tap(find.text('重新加载'));
      await tester.pumpAndSettle();
      expect(find.text('正常履约'), findsOneWidget);
    });
  });

  group('关于与版本', () {
    testWidgets('版本号取自后端 /health', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await MeTestHarness.create();
      await tester.pumpWidget(harness.wrap(
        MeAboutScreen(api: harness.api, authState: harness.authState),
      ));
      await tester.pumpAndSettle();

      expect(harness.hasRequest('GET', '/health'), isTrue);
      expect(find.text('dev'), findsOneWidget);
      expect(find.text('正常'), findsOneWidget);
      expect(find.text(meAppVersion), findsWidgets);
    });

    testWidgets('健康检查失败时给出可重试提示', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await MeTestHarness.create();
      harness.helper.whenGet('/health', '服务异常', statusCode: 500);
      await tester.pumpWidget(harness.wrap(
        MeAboutScreen(api: harness.api, authState: harness.authState),
      ));
      await tester.pumpAndSettle();

      expect(find.textContaining('服务状态读取失败'), findsOneWidget);
      expect(find.text('重新检查'), findsOneWidget);
    });
  });

  testWidgets('帮助页展示快捷键、统计口径与协同规则', (tester) async {
    MeTestHarness.useTallSurface(tester);
    final harness = await MeTestHarness.create();
    await tester.pumpWidget(harness.wrap(const MeHelpScreen()));
    await tester.pumpAndSettle();

    expect(find.text('桌面客户端快捷键'), findsOneWidget);
    expect(find.text('统计报表计算口径'), findsOneWidget);
    expect(find.text('人轴责任链协同规则'), findsOneWidget);
    expect(find.text('⌘ + K / Ctrl + K'), findsOneWidget);
  });

  group('第三方服务绑定', () {
    testWidgets('微信已绑定时可开启订阅提醒并提交偏好', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await MeTestHarness.create();
      harness.helper.whenPut('/wx/subscribe-preference', {
        'wx_bound': true,
        'subscription_enabled': true,
      });
      await tester.pumpWidget(harness.wrap(
        MeIntegrationsScreen(api: harness.api, authState: harness.authState),
      ));
      await tester.pumpAndSettle();

      expect(find.text('已绑定'), findsOneWidget);
      final before = tester.widget<AppSwitch>(find.byType(AppSwitch).first);
      expect(before.value, isFalse);

      await tester.tap(find.byType(AppSwitch).first);
      await tester.pumpAndSettle();

      final put = harness.lastRequest('PUT', '/wx/subscribe-preference');
      expect((put.body as Map)['enabled'], isTrue);
      expect(find.text('已开启微信订阅提醒'), findsOneWidget);
    });

    testWidgets('微信未绑定时订阅开关不可操作', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await MeTestHarness.create();
      harness.helper.whenGet('/wx/subscribe-status', {
        'wx_bound': false,
        'subscription_enabled': false,
      });
      await tester.pumpWidget(harness.wrap(
        MeIntegrationsScreen(api: harness.api, authState: harness.authState),
      ));
      await tester.pumpAndSettle();

      final widget = tester.widget<AppSwitch>(find.byType(AppSwitch).first);
      expect(widget.onChanged, isNull);
      expect(find.textContaining('未绑定微信服务号时无法开启订阅提醒'), findsOneWidget);
    });

    testWidgets('选择个人语音识别会提交 provider_id 与 company_id', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await MeTestHarness.create();
      harness.helper.whenPut('/users/me/bindings/asr', {'ok': true});
      await tester.pumpWidget(harness.wrap(
        MeIntegrationsScreen(api: harness.api, authState: harness.authState),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Whisper 兼容服务'));
      await tester.pumpAndSettle();

      final put = harness.lastRequest('PUT', '/users/me/bindings/asr');
      expect((put.body as Map)['provider_id'], 'cloud:whisper');
      expect((put.body as Map)['company_id'], 1);
      expect(find.text('个人语音识别偏好已保存'), findsOneWidget);
    });

    testWidgets('没有企业时选择语音识别给出明确提示', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await MeTestHarness.create(withCompany: false);
      await tester.pumpWidget(harness.wrap(
        MeIntegrationsScreen(api: harness.api, authState: harness.authState),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('自有语音服务'));
      await tester.pumpAndSettle();

      expect(find.textContaining('请先在「工作」中选择或加入一个企业'), findsOneWidget);
      expect(harness.hasRequest('PUT', '/users/me/bindings/asr'), isFalse);
    });
  });

  group('注销账号', () {
    Future<MeTestHarness> pumpDelete(WidgetTester tester) async {
      final harness = await MeTestHarness.create();
      await tester.pumpWidget(harness.wrap(
        MeDeleteAccountScreen(api: harness.api, authState: harness.authState),
      ));
      await tester.pumpAndSettle();
      return harness;
    }

    testWidgets('展示隐私数据概览与导出入口', (tester) async {
      MeTestHarness.useTallSurface(tester);
      await pumpDelete(tester);

      expect(find.text('任务数据'), findsOneWidget);
      expect(find.text('3 条'), findsOneWidget);
      expect(find.text('导出我的数据'), findsOneWidget);
      expect(find.textContaining('已产生的任务与协作记录保留在所属项目中'), findsWidgets);
    });

    testWidgets('未填写密码或确认词时注销按钮不可用', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await pumpDelete(tester);

      AppButton button() => tester.widget<AppButton>(
            find.widgetWithText(AppButton, '永久注销此账号'),
          );

      expect(button().onPressed, isNull);

      await tester.enterText(
          find.byKey(const Key('me-delete-password')), 'pass');
      await tester.pumpAndSettle();
      expect(button().onPressed, isNull);

      // 关键词必须为大写 DELETE
      await tester.enterText(
          find.byKey(const Key('me-delete-keyword')), 'delete');
      await tester.pumpAndSettle();
      expect(button().onPressed, isNull);

      await tester.enterText(
          find.byKey(const Key('me-delete-keyword')), 'DELETE');
      await tester.pumpAndSettle();
      expect(button().onPressed, isNotNull);

      expect(harness.hasRequest('POST', '/users/me/delete'), isFalse);
    });

    testWidgets('取消二次确认后不发送注销请求', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await pumpDelete(tester);

      await tester.enterText(
          find.byKey(const Key('me-delete-password')), 'pass');
      await tester.enterText(
          find.byKey(const Key('me-delete-keyword')), 'DELETE');
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(AppButton, '永久注销此账号'));
      await tester.pumpAndSettle();

      expect(find.text('永久注销此账号？'), findsOneWidget);
      await tester.tap(find.text('取消'));
      await tester.pumpAndSettle();

      expect(harness.hasRequest('POST', '/users/me/delete'), isFalse);
    });

    testWidgets('确认后提交注销并清空会话', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await pumpDelete(tester);
      harness.helper.whenPost('/users/me/delete', {'deleted': true});
      harness.helper.whenPost('/auth/logout', {'ok': true});

      await tester.enterText(
          find.byKey(const Key('me-delete-password')), 'pass');
      await tester.enterText(
          find.byKey(const Key('me-delete-keyword')), 'DELETE');
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(AppButton, '永久注销此账号'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('永久注销'));
      await tester.pumpAndSettle();

      final post = harness.lastRequest('POST', '/users/me/delete');
      expect((post.body as Map)['password'], 'pass');
      expect((post.body as Map)['confirmation'], 'DELETE');
      expect(harness.hasRequest('POST', '/auth/logout'), isTrue);
      expect(harness.authState.currentUser, isNull);

      // 清理 Toast 定时器，避免测试结束时残留 pending timer
      resetToastForTesting();
      await tester.pump();
    });

    testWidgets('注销失败时展示后端原因且会话保留', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await pumpDelete(tester);
      harness.helper.whenPost(
        '/users/me/delete',
        {'code': 400, 'message': '密码不正确'},
        statusCode: 400,
      );

      await tester.enterText(
          find.byKey(const Key('me-delete-password')), 'bad');
      await tester.enterText(
          find.byKey(const Key('me-delete-keyword')), 'DELETE');
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(AppButton, '永久注销此账号'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('永久注销'));
      await tester.pumpAndSettle();

      expect(find.textContaining('密码不正确'), findsOneWidget);
      expect(harness.authState.currentUser, isNotNull);
    });
  });
}
