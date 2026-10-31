import 'dart:convert';
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'app_runtime.dart';

/// 负责 Flutter 宿主与 WebView 前端通信的桥接控制器
class WebShellBridge {
  WebShellBridge({required this.controller});

  final WebViewController controller;

  /// 当前是否已注入环境信息
  bool _runtimeInjected = false;
  bool get runtimeInjected => _runtimeInjected;

  /// 同步原生运行环境到前端 Web 运行时
  Future<void> syncRuntime(BuildContext context) async {
    final mediaQuery = MediaQuery.of(context);
    final isIOS = !kIsWeb && Platform.isIOS;
    final isAndroid = !kIsWeb && Platform.isAndroid;
    final platformStr = isIOS
        ? 'ios'
        : isAndroid
            ? 'android'
            : 'web';

    final textSizes = textSizesFor(mediaQuery.textScaler, isIOS: isIOS);
    final colorScheme =
        mediaQuery.platformBrightness == Brightness.dark ? 'dark' : 'light';
    final reduceMotion = mediaQuery.disableAnimations;
    final view = View.of(context);

    final payload = AppNativeRuntimePayload(
      platform: platformStr,
      surface: 'app',
      colorScheme: colorScheme,
      textSizes: textSizes,
      safeAreaOwner: 'native',
      reduceMotion: reduceMotion,
      reduceTransparency: false,
      keyboardInset: keyboardInsetFor(
        viewInsetBottom: view.viewInsets.bottom,
        viewPaddingBottom: view.viewPadding.bottom,
        devicePixelRatio: view.devicePixelRatio,
      ),
      capabilities: {
        'haptics': true,
        'nativeBack': true,
      },
    );

    final jsonStr = payload.toJsonString();
    final jsCode = '''
      (function() {
        window.__NATIVE_RUNTIME__ = $jsonStr;
        window.dispatchEvent(new CustomEvent('nativeRuntimeChange', { detail: window.__NATIVE_RUNTIME__ }));
      })();
    ''';

    try {
      await controller.runJavaScript(jsCode);
      _runtimeInjected = true;
    } catch (e) {
      debugPrint('[WebShellBridge] Failed to inject runtime: \$e');
    }
  }

  /// 触发 Web 侧返回动作，返回 Web 是否消费了此次返回事件
  Future<bool> handleSystemBack() async {
    try {
      final result = await controller.runJavaScriptReturningResult('''
        (function() {
          if (typeof window.__handleNativeBack === 'function') {
            return window.__handleNativeBack() === true;
          }
          return false;
        })();
      ''');
      if (result is bool) {
        return result;
      } else if (result is String) {
        return result.toLowerCase() == 'true';
      }
      return false;
    } catch (e) {
      debugPrint('[WebShellBridge] handleSystemBack error: \$e');
      return false;
    }
  }

  /// 处理来自前端的消息通道
  void handleWebMessage(JavaScriptMessage message, BuildContext context) {
    try {
      final data = jsonDecode(message.message);
      if (data is! Map<String, dynamic>) return;
      final type = data['type'];
      switch (type) {
        case 'haptic':
          // 触觉反馈请求
          Feedback.forTap(context);
          break;
        case 'titleChange':
          // 标题变化通知
          break;
        default:
          break;
      }
    } catch (e) {
      debugPrint('[WebShellBridge] Error processing message: \$e');
    }
  }
}
