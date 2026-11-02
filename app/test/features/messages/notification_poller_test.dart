import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/features/messages/controllers/notification_poller.dart';
import '../../helpers/mock_api_client.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  MockApiClientHelper fixture() => MockApiClientHelper()
    ..whenGet('/users/me', {'id': 1, 'username': 'tester'})
    ..whenGet('/companies/mine', {
      'items': [
        {'id': 1, 'name': 'company'}
      ]
    })
    ..whenGet('/projects', {'items': []});

  testWidgets('通知计数遍历100条之后的分页，退后台停止，前台恢复', (tester) async {
    final helper = fixture()
      ..whenGet('/notifications/collab', {
        'items': [
          for (var id = 1; id <= 100; id++) {'id': id, 'read': id > 2}
        ]
      }, query: {
        'page': '1',
        'page_size': '100',
        'state': 'active'
      })
      ..whenGet('/notifications/collab', {
        'items': [
          {'id': 101, 'read': false}
        ]
      }, query: {
        'page': '2',
        'page_size': '100',
        'state': 'active'
      });
    final auth = AuthState(apiClient: helper.buildClient());
    await auth.bootstrap();
    final poller =
        NotificationPoller(auth, interval: const Duration(seconds: 10));
    await tester.pump();
    expect(poller.count, 3);
    expect(poller.error, isNull);
    int requests() => helper.history
        .where((r) => r.url.path.endsWith('/notifications/collab'))
        .length;
    expect(requests(), 2);
    poller.didChangeAppLifecycleState(AppLifecycleState.paused);
    await tester.pump(const Duration(seconds: 30));
    expect(requests(), 2);
    poller.didChangeAppLifecycleState(AppLifecycleState.resumed);
    await tester.pump();
    expect(requests(), 4);
    await auth.logout();
    expect(poller.count, 0);
    await tester.pump(const Duration(seconds: 30));
    expect(requests(), 4);
    poller.dispose();
    auth.dispose();
  });

  testWidgets('通知轮询失败保留可见错误，手动刷新恢复', (tester) async {
    final helper = fixture()
      ..whenGet('/notifications/collab', {'message': 'failed'},
          statusCode: 500);
    final auth = AuthState(apiClient: helper.buildClient());
    await auth.bootstrap();
    final poller = NotificationPoller(auth);
    await tester.pump();
    expect(poller.error, contains('刷新失败'));
    helper.whenGet('/notifications/collab', {
      'items': [
        {'id': 1, 'read': false}
      ]
    });
    await poller.refresh();
    expect(poller.error, isNull);
    expect(poller.count, 1);
    poller.dispose();
    auth.dispose();
  });
}
