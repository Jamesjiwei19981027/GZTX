import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../config/api_config.dart';
import '../config/brand.dart';
import '../design/tokens/colors.dart';
import '../platform/web_shell_bridge.dart';
import '../push/push_service.dart';

/// 正式 APP 壳：全屏加载移动自适应 UI，支持运行时桥接、系统返回拦截与安全区域协同。
class WebShellScreen extends StatefulWidget {
  const WebShellScreen({super.key});

  @override
  State<WebShellScreen> createState() => _WebShellScreenState();
}

class _WebShellScreenState extends State<WebShellScreen>
    with WidgetsBindingObserver {
  late final WebViewController _controller;
  WebShellBridge? _bridge;

  var _loading = true;
  var _progress = 0;
  String? _error;
  bool _showDebugBar = false;
  bool _pushSession = false;
  bool _pushRegistered = false;
  String? _pushSessionId;
  Map<String, dynamic>? _sentPushNotification;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initController();
    PushService.instance.onRegistration = _sendPushRegistration;
    PushService.instance.onNotification = _sendPushNotification;
  }

  void _initController() {
    final uri = Uri.parse(ApiConfig.webBaseUrl);
    _controller = WebViewController(onPermissionRequest: (request) async {
      final current = Uri.tryParse(await _controller.currentUrl() ?? '');
      final trusted = current != null &&
          current.scheme == uri.scheme &&
          current.host == uri.host &&
          current.port == uri.port;
      if (!trusted ||
          request.types.any(
              (type) => type != WebViewPermissionResourceType.microphone)) {
        await request.deny();
        return;
      }
      try {
        final granted = defaultTargetPlatform == TargetPlatform.android
            ? await const MethodChannel('worktodo/microphone')
                    .invokeMethod<bool>('requestPermission') ==
                true
            : true;
        if (granted && mounted) {
          await request.grant();
        } else {
          await request.deny();
        }
      } catch (_) {
        await request.deny();
      }
    })
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(AppColors.background)
      ..addJavaScriptChannel(
        'FlutterBridge',
        onMessageReceived: (message) async {
          final current = Uri.tryParse(await _controller.currentUrl() ?? '');
          if (current == null || current.origin != uri.origin || !mounted) {
            return;
          }
          await _handlePushMessage(message.message);
          if (!mounted) return;
          _bridge?.handleWebMessage(message, context);
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (p) {
            if (!mounted) return;
            setState(() => _progress = p);
          },
          onPageStarted: (_) {
            _pushSession = false;
            _pushRegistered = false;
            _pushSessionId = null;
            _sentPushNotification = null;
            if (!mounted) return;
            setState(() {
              _loading = true;
              _error = null;
            });
          },
          onPageFinished: (_) async {
            if (!mounted) return;
            setState(() => _loading = false);
            // 页面加载完成后注入原生运行环境
            await _bridge?.syncRuntime(context);
          },
          onWebResourceError: (err) {
            if (!mounted) return;
            if (err.isForMainFrame == false) return;
            setState(() {
              _loading = false;
              _error =
                  '无法连接至服务：${ApiConfig.webBaseUrl}\n错误代码：${err.errorCode} (${err.description})\n请检查网络连接或服务启动状态。';
            });
          },
        ),
      )
      ..loadRequest(uri);

    _bridge = WebShellBridge(controller: _controller);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // 监听系统亮度、字号等变更并同步给 Web
    _bridge?.syncRuntime(context);
  }

  @override
  void didChangePlatformBrightness() {
    super.didChangePlatformBrightness();
    _bridge?.syncRuntime(context);
  }

  @override
  void didChangeMetrics() {
    super.didChangeMetrics();
    // adjustNothing preserves the page size; report keyboard occlusion explicitly.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _bridge?.syncRuntime(context);
    });
  }

  @override
  void didChangeAccessibilityFeatures() {
    super.didChangeAccessibilityFeatures();
    _bridge?.syncRuntime(context);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _controller.runJavaScript(
        "window.dispatchEvent(new Event('nativeAppResumed'));",
      );
      if (_pushSession) PushService.instance.refreshRegistrationId();
    }
  }

  @override
  void dispose() {
    PushService.instance.onRegistration = null;
    PushService.instance.onNotification = null;
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _handlePushMessage(String message) async {
    try {
      final data = jsonDecode(message);
      if (data is! Map) return;
      if (data['type'] == 'pushSession') {
        final sessionId = data['session_id'];
        if (sessionId is! String || sessionId.isEmpty) return;
        if (_pushSessionId != sessionId) _pushRegistered = false;
        _pushSessionId = sessionId;
        _pushSession = data['enabled'] == true;
        if (_pushSession) {
          await PushService.instance.startForWeb();
          _sendPushRegistration();
        } else {
          _pushRegistered = false;
          await PushService.instance.stop();
        }
      } else if (data['type'] == 'pushRegistered' &&
          _pushSession &&
          data['session_id'] == _pushSessionId &&
          data['registration_id'] == PushService.instance.registrationId) {
        _pushRegistered = true;
        await PushService.instance.confirmWebRegistration();
        _sendPushNotification();
      } else if (data['type'] == 'pushNotificationHandled' &&
          data['session_id'] == _pushSessionId) {
        PushService.instance.pendingNotification = null;
        _sentPushNotification = null;
      }
    } catch (_) {
      debugPrint('[push] 宿主消息处理失败');
    }
  }

  Future<void> _emitPush(String name, Object detail) async {
    if (!mounted || !_pushSession) return;
    final sessionId = _pushSessionId;
    final uri = Uri.tryParse(await _controller.currentUrl() ?? '');
    if (uri == null || uri.origin != Uri.parse(ApiConfig.webBaseUrl).origin) {
      return;
    }
    if (!mounted || !_pushSession || sessionId != _pushSessionId) return;
    try {
      await _controller.runJavaScript(
          "window.dispatchEvent(new CustomEvent(${jsonEncode(name)}, {detail: ${jsonEncode(detail)}}));");
    } catch (_) {
      debugPrint('[push] 网页暂未就绪');
    }
  }

  void _sendPushRegistration() {
    final rid = PushService.instance.registrationId;
    if (rid != null) {
      _emitPush('nativePushRegistration',
          {'registration_id': rid, 'session_id': _pushSessionId});
    }
  }

  void _sendPushNotification() {
    final event = PushService.instance.pendingNotification;
    if (!_pushSession ||
        !_pushRegistered ||
        event == null ||
        identical(event, _sentPushNotification)) {
      return;
    }
    _sentPushNotification = event;
    _emitPush(
        'nativePushOpen', {...pushExtras(event), 'session_id': _pushSessionId});
  }

  Future<void> _reload() async {
    setState(() {
      _error = null;
      _loading = true;
    });
    await _controller.loadRequest(Uri.parse(ApiConfig.webBaseUrl));
  }

  /// 处理系统返回拦截（Android 返回键或系统手势）
  Future<void> _handlePopInvoked(bool didPop, dynamic result) async {
    if (didPop) return;
    if (_bridge != null) {
      final handled = await _bridge!.handleSystemBack();
      if (!handled && mounted) {
        // Web 侧未消费返回（已处于根页或空栈），遵循系统默认退出或关闭
        final navigator = Navigator.of(context);
        if (navigator.canPop()) {
          navigator.pop();
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final debugLabel = '${Brand.name} · ${ApiConfig.webBaseUrl}';
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: _handlePopInvoked,
      child: Scaffold(
        resizeToAvoidBottomInset: false,
        body: SafeArea(
          maintainBottomViewPadding: true,
          child: Column(
            children: [
              if (kDebugMode && _showDebugBar)
                Material(
                  color: const Color(0xFF191C1D),
                  child: Padding(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            debugLabel,
                            style: const TextStyle(
                              color: Colors.white70,
                              fontSize: 11,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        TextButton(
                          onPressed: _reload,
                          child: const Text(
                            '刷新',
                            style: TextStyle(color: Colors.white),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close,
                              color: Colors.white70, size: 16),
                          onPressed: () =>
                              setState(() => _showDebugBar = false),
                          tooltip: '隐藏调试栏',
                        ),
                      ],
                    ),
                  ),
                ),
              Expanded(
                child: Stack(
                  children: [
                    if (_error != null)
                      Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.cloud_off,
                                  size: 48, color: Colors.grey),
                              const SizedBox(height: 16),
                              Text(
                                _error!,
                                textAlign: TextAlign.center,
                                style: const TextStyle(fontSize: 14),
                              ),
                              const SizedBox(height: 20),
                              FilledButton.icon(
                                onPressed: _reload,
                                icon: const Icon(Icons.refresh),
                                label: const Text('重试连接'),
                              ),
                            ],
                          ),
                        ),
                      )
                    else
                      WebViewWidget(controller: _controller),
                    if (_loading && _error == null)
                      Positioned(
                        top: 0,
                        left: 0,
                        right: 0,
                        child: LinearProgressIndicator(
                          value: _progress > 0 && _progress < 100
                              ? _progress / 100
                              : null,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
