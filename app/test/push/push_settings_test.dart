import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/me/screens/me_notifications_screen.dart';
import '../features/me/me_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final enabled in [false, true]) {
    testWidgets('系统推送按服务器状态显示并保存：$enabled', (tester) async {
      MeTestHarness.useTallSurface(tester);
      final harness = await MeTestHarness.create();
      harness.helper.whenGet('/push/status', {'enabled': enabled});
      harness.helper.whenPut('/users/me', MeTestHarness.userJson);
      await tester.pumpWidget(harness.wrap(MeNotificationsScreen(
          api: harness.api, authState: harness.authState)));
      await tester.pumpAndSettle();
      expect(find.text('系统推送'), enabled ? findsOneWidget : findsNothing);
      if (enabled) {
        final row = find
            .ancestor(of: find.text('系统推送'), matching: find.byType(Row))
            .first;
        await tester
            .tap(find.descendant(of: row, matching: find.byType(AppSwitch)));
        await tester.pumpAndSettle();
        final put = harness.lastRequest('PUT', '/users/me');
        expect(((put.body as Map)['notify_pref'] as Map)['channels']['push'],
            {'enabled': false});
        expect(find.text('已关闭系统推送'), findsOneWidget);
      }
    });
  }
}
