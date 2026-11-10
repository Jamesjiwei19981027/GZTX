import 'package:flutter_test/flutter_test.dart';
import 'package:jpush_flutter/jpush_interface.dart';
import 'package:worktodo_app/push/push_service.dart';
import '../helpers/mock_api_client.dart';

class FakePush extends JPushFlutterInterface {
  final calls = <String>[];
  EventHandler? opened;
  @override
  void setAuth({bool enable = true}) => calls.add('auth:$enable');
  @override
  void setup(
          {String appKey = '',
          bool production = false,
          String channel = '',
          bool debug = false}) =>
      calls.add('setup');
  @override
  void addEventHandler(
      {EventHandler? onReceiveNotification,
      EventHandler? onOpenNotification,
      EventHandler? onReceiveMessage,
      EventHandler? onReceiveNotificationAuthorization,
      EventHandler? onNotifyMessageUnShow,
      EventHandler? onConnected,
      EventHandler? onInAppMessageClick,
      EventHandler? onInAppMessageShow,
      EventHandler? onNotifyButtonClick,
      EventHandler? onCommandResult,
      EventHandler? onReceiveDeviceToken,
      EventHandler? onVoipMessage}) {
    opened = onOpenNotification;
  }

  @override
  Future<String> getRegistrationID() async => 'fake-rid';
  @override
  Future<Map<dynamic, dynamic>> getLaunchAppNotification() async =>
      {'extras': '{"template_key":"evidence.adopted","package_id":7}'};
  @override
  void requestRequiredPermission() => calls.add('permission');
  @override
  Future<void> resumePush() async => calls.add('resume');
  @override
  Future<void> stopPush() async => calls.add('stop');
  @override
  Future<void> clearAllNotifications() async => calls.add('clear');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('网页只有在服务器登记确认后才恢复系统推送', () async {
    final sdk = FakePush();
    final service =
        PushService(appKey: 'real-key', android: true, sdkFactory: () => sdk);
    service.consentGranted = true;
    expect(await service.startForWeb(), 'fake-rid');
    expect(sdk.calls, isNot(contains('resume')));
    expect(sdk.calls, isNot(contains('permission')));
    await service.confirmWebRegistration();
    expect(sdk.calls, containsAllInOrder(['resume', 'permission']));
  });
  test('无 AppKey 和未同意隐私时均不创建 SDK', () async {
    for (final (key, consent) in [('', true), ('real-key', false)]) {
      var created = false;
      final service = PushService(
          appKey: key,
          android: true,
          sdkFactory: () {
            created = true;
            return FakePush();
          });
      await service.initialize(consent: consent);
      expect(created, isFalse);
      expect(service.initialized, isFalse);
    }
  });
  test('同意后初始化，登录登记与退出注销使用同一 rid', () async {
    final sdk = FakePush();
    final service =
        PushService(appKey: 'real-key', android: true, sdkFactory: () => sdk);
    final helper = MockApiClientHelper()
      ..whenGet('/push/status', {'enabled': true})
      ..whenPost('/push/devices', {'enabled': true})
      ..whenDelete('/push/devices/fake-rid', null);
    final api = helper.buildClient();
    await service.initialize(consent: true);
    expect(sdk.calls.take(2), ['auth:true', 'setup']);
    await service.register(api);
    final posted = helper.history.singleWhere((r) => r.method == 'POST');
    expect((posted.body as Map)['registration_id'], 'fake-rid');
    expect((posted.body as Map)['platform'], 'android');
    await service.unregister(api);
    expect(helper.history.last.method, 'DELETE');
    expect(sdk.calls, containsAllInOrder(['resume', 'stop', 'clear']));
  });
  test('服务器未配置不登记、不初始化 SDK', () async {
    var created = false;
    final service = PushService(
        appKey: 'real-key',
        android: true,
        sdkFactory: () {
          created = true;
          return FakePush();
        });
    final helper = MockApiClientHelper()
      ..whenGet('/push/status', {'enabled': false});
    service.consentGranted = true;
    await service.register(helper.buildClient());
    expect(created, isFalse);
    expect(helper.history.where((r) => r.method == 'POST'), isEmpty);
  });
  test('冷启动与热点击载荷均映射到现有命名路由', () async {
    final sdk = FakePush();
    final service =
        PushService(appKey: 'real-key', android: true, sdkFactory: () => sdk);
    await service.initialize(consent: true);
    expect(pushDestination(service.pendingNotification!)!.name,
        'axis-evidence-detail');
    expect(pushDestination(service.pendingNotification!)!.pathParameters,
        {'packageId': '7'});
    await sdk.opened!({
      'extras': {
        'template_key': 'progress.auto_write_alert',
        'node_id': 9,
        'project_id': 2
      }
    });
    expect(
        pushDestination(service.pendingNotification!)!.name, 'axis-progress');
    expect(pushDestination({'extras': 'invalid json'}), isNull);
  });
}
