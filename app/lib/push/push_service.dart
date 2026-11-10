import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:jpush_flutter/jpush_flutter.dart';
import 'package:jpush_flutter/jpush_interface.dart';
import '../core/api/api_client.dart';
import '../features/messages/models/messages_models.dart';
import '../router/app_destination.dart';

Map<String, dynamic> pushExtras(Map<dynamic, dynamic> event) {
  dynamic raw = event['extras'] ?? event['cn.jpush.android.EXTRA'] ?? event;
  if (raw is String) {
    try {
      raw = jsonDecode(raw);
    } catch (_) {
      return {};
    }
  }
  if (raw is! Map) return {};
  // Android 不同通道可能再包一层 cn.jpush.android.EXTRA。
  if (raw.containsKey('cn.jpush.android.EXTRA')) return pushExtras(raw);
  return raw.map((key, value) => MapEntry('$key', value));
}

AppDestination? pushDestination(Map<dynamic, dynamic> event) {
  final extras = pushExtras(event);
  return notificationDestination(CollabNotification(
    id: 0,
    bodyText: '',
    read: false,
    templateKey: extras['template_key'] is String
        ? extras['template_key'] as String
        : '',
    payload: extras,
  ));
}

class PushService {
  PushService(
      {String? appKey,
      bool? android,
      JPushFlutterInterface Function()? sdkFactory})
      : appKey = appKey ?? const String.fromEnvironment('JPUSH_APPKEY'),
        android = android ??
            (!kIsWeb && defaultTargetPlatform == TargetPlatform.android),
        _sdkFactory = sdkFactory ?? JPush.newJPush;

  static final instance = PushService();
  final String appKey;
  final bool android;
  final JPushFlutterInterface Function() _sdkFactory;
  JPushFlutterInterface? _sdk;
  bool consentGranted = false;
  bool get configured => android && appKey.trim().isNotEmpty;
  bool get initialized => _sdk != null;
  String? registrationId;
  Map<String, dynamic>? pendingNotification;
  void Function()? onNotification;
  void Function()? onRegistration;
  Future<void>? _registering;
  int _epoch = 0;

  Future<void> initialize({required bool consent}) async {
    consentGranted = consent;
    if (!configured || !consent || initialized) return;
    try {
      final sdk = _sdkFactory();
      // 合规：本入口仅在用户同意政策后到达，setup 前声明授权。
      // https://docs.jiguang.cn/jpush/client/jghgzy_a_i_h
      sdk.setAuth(enable: true);
      sdk.setup(appKey: appKey, channel: 'developer-default', debug: false);
      _sdk = sdk;
      sdk.addEventHandler(
        onOpenNotification: (event) async {
          _opened(event);
        },
        onConnected: (_) async {
          await refreshRegistrationId();
        },
      );
      // 插件 Android helper 会缓存进程冷启动 intent，Dart ready 后走同一点击回调。
      // getLaunchAppNotification 另兼容插件提供的 launch payload。
      final launch = await sdk
          .getLaunchAppNotification()
          .timeout(const Duration(seconds: 3));
      if (launch.isNotEmpty) _opened(Map<String, dynamic>.from(launch));
      await refreshRegistrationId();
    } catch (_) {
      debugPrint('[push] 初始化失败，稍后重试');
      _sdk = null;
    }
  }

  void _opened(Map<String, dynamic> event) {
    if (pushExtras(event).isEmpty) return;
    pendingNotification = event;
    onNotification?.call();
  }

  Future<void> refreshRegistrationId() async {
    if (_sdk == null) return;
    try {
      final rid =
          await _sdk!.getRegistrationID().timeout(const Duration(seconds: 8));
      if (rid.isNotEmpty && rid != registrationId) {
        registrationId = rid;
        onRegistration?.call();
      }
    } catch (_) {
      debugPrint('[push] 设备标识暂不可用');
    }
  }

  Future<void> register(ApiClient api) async {
    if (!configured || !consentGranted) return;
    if (_registering != null) return _registering;
    final future = _register(api, _epoch);
    _registering = future;
    try {
      await future;
    } finally {
      _registering = null;
    }
  }

  Future<void> _register(ApiClient api, int epoch) async {
    try {
      final status = await api.get('/push/status');
      if (epoch != _epoch || status is! Map || status['enabled'] != true) {
        return;
      }
      await initialize(consent: consentGranted);
      if (_sdk == null || epoch != _epoch) return;
      await refreshRegistrationId();
      final rid = registrationId;
      if (rid == null || epoch != _epoch) return;
      await api.post('/push/devices', body: {
        'platform': 'android',
        'registration_id': rid,
        'app_version': const String.fromEnvironment('APP_VERSION',
            defaultValue: '2.0.0+2'),
      });
      if (epoch == _epoch) {
        await _sdk!.resumePush();
        _sdk!.requestRequiredPermission();
      }
    } catch (_) {
      debugPrint('[push] 登记失败，保留现有登录');
    }
  }

  Future<void> unregister(ApiClient api) async {
    _epoch++;
    // 等待旧登记结束后再删除，避免注销之后旧 POST 又恢复绑定。
    await _registering;
    try {
      final rid = registrationId;
      if (rid != null) {
        await api.delete('/push/devices/${Uri.encodeComponent(rid)}');
      }
    } catch (_) {
      debugPrint('[push] 注销失败，已停止本机推送');
    }
    await stop();
  }

  Future<void> stop() async {
    _epoch++;
    pendingNotification = null;
    try {
      await _sdk?.stopPush();
      await _sdk?.clearAllNotifications();
    } catch (_) {
      debugPrint('[push] 停止推送失败');
    }
  }

  Future<String?> startForWeb() async {
    if (!configured || !consentGranted) return null;
    final epoch = _epoch;
    await initialize(consent: consentGranted);
    if (epoch != _epoch) return null;
    try {
      await refreshRegistrationId();
    } catch (_) {
      debugPrint('[push] 系统权限暂不可用');
    }
    return registrationId;
  }

  /// 网页用自己的登录会话完成设备归属更新后，才能恢复本机接收。
  Future<void> confirmWebRegistration() async {
    if (!configured || !consentGranted || _sdk == null) return;
    final epoch = _epoch;
    try {
      await _sdk!.resumePush();
      if (epoch == _epoch) _sdk!.requestRequiredPermission();
    } catch (_) {
      debugPrint('[push] 恢复推送失败');
    }
  }
}
