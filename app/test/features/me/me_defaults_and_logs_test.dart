import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/me/screens/me_defaults_screen.dart';
import 'package:worktodo_app/features/me/screens/me_notify_logs_screen.dart';

import 'me_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('通知发送记录', () {
    testWidgets('渲染成功与失败记录，失败记录带原因', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await MeTestHarness.create();
      await tester.pumpWidget(
        harness.wrap(
          MeNotifyLogsScreen(api: harness.api, authState: harness.authState),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('全部 (2)'), findsOneWidget);
      expect(find.text('邮件'), findsOneWidget);
      expect(find.text('推送'), findsOneWidget);
      expect(find.text('送达成功'), findsOneWidget);
      expect(find.text('发送失败'), findsOneWidget);
      expect(find.textContaining('失败原因：订阅已失效'), findsOneWidget);
      expect(find.textContaining('事项：季度目标评审'), findsOneWidget);
      final request = harness.lastRequest('GET', '/notify/records');
      expect(request.url.queryParameters['limit'], '50');
    });

    testWidgets('筛选「失败」只展示失败记录', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await MeTestHarness.create();
      await tester.pumpWidget(
        harness.wrap(
          MeNotifyLogsScreen(api: harness.api, authState: harness.authState),
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('失败'));
      await tester.pumpAndSettle();

      expect(find.text('发送失败'), findsOneWidget);
      expect(find.text('送达成功'), findsNothing);
      expect(find.textContaining('季度目标评审'), findsNothing);
    });

    testWidgets('无记录时展示空状态', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await MeTestHarness.create();
      harness.helper.whenGet('/notify/records', {'items': <Map<String, dynamic>>[]});
      await tester.pumpWidget(
        harness.wrap(
          MeNotifyLogsScreen(api: harness.api, authState: harness.authState),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('暂无通知记录'), findsOneWidget);
      expect(find.text('当前筛选条件下没有产生通知发送日志'), findsOneWidget);
    });

    testWidgets('接口失败显示可重试错误态，重试后恢复', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await MeTestHarness.create();
      harness.helper.whenGet('/notify/records', '服务异常', statusCode: 500);
      await tester.pumpWidget(
        harness.wrap(
          MeNotifyLogsScreen(api: harness.api, authState: harness.authState),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('加载失败'), findsOneWidget);

      harness.helper.whenGet('/notify/records', {
        'items': [
          {
            'id': 3,
            'channel': 'email',
            'status': 'success',
            'created_at': '2026-10-31T02:00:00Z',
          },
        ],
      });
      await tester.tap(find.text('重新加载'));
      await tester.pumpAndSettle();
      expect(find.text('送达成功'), findsOneWidget);
    });
  });

  group('任务默认值', () {
    Future<MeTestHarness> pumpDefaults(WidgetTester tester) async {
      final harness = await MeTestHarness.create();
      await tester.pumpWidget(
        harness.wrap(
          MeDefaultsScreen(api: harness.api, authState: harness.authState),
        ),
      );
      await tester.pumpAndSettle();
      return harness;
    }

    testWidgets('渲染优先级与分类列表', (tester) async {
      MeTestHarness.useTallSurface(tester);
      await pumpDefaults(tester);

      expect(find.text('高优先级'), findsOneWidget);
      expect(find.text('中优先级'), findsOneWidget);
      expect(find.text('低优先级'), findsOneWidget);
      expect(find.text('工作'), findsOneWidget);
      expect(find.text('个人'), findsOneWidget);
      // 服务端默认优先级为 1（中），对应勾选图标 1 个 + 分类未选
      expect(find.byIcon(Icons.check), findsOneWidget);
    });

    testWidgets('选择优先级与分类后保存到 ui-prefs', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await pumpDefaults(tester);
      harness.helper.whenPut('/users/me/ui-prefs', {
        'ui': {'task_default_priority': 2, 'task_default_category_id': 6},
      });

      await tester.tap(find.text('高优先级'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('个人'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('保存任务默认配置'));
      await tester.pumpAndSettle();

      final put = harness.lastRequest('PUT', '/users/me/ui-prefs');
      expect((put.body as Map)['task_default_priority'], 2);
      expect((put.body as Map)['task_default_category_id'], 6);
      expect(find.text('任务默认值已保存并应用'), findsOneWidget);
    });

    testWidgets('保存失败显示错误提示', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await pumpDefaults(tester);
      harness.helper.whenPut('/users/me/ui-prefs', '服务异常', statusCode: 500);

      await tester.tap(find.text('保存任务默认配置'));
      await tester.pumpAndSettle();

      expect(find.textContaining('保存失败'), findsOneWidget);
    });

    testWidgets('分类接口失败时保留优先级设置并提示', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await MeTestHarness.create();
      harness.helper.whenGet('/categories', '服务异常', statusCode: 500);
      await tester.pumpWidget(
        harness.wrap(
          MeDefaultsScreen(api: harness.api, authState: harness.authState),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('分类列表读取失败'), findsOneWidget);
      expect(find.text('暂无可用分类'), findsOneWidget);
      expect(find.text('保存任务默认配置'), findsOneWidget);
    });
  });
}
