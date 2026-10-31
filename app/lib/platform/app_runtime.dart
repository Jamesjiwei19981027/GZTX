import 'dart:convert';
import 'package:flutter/widgets.dart';

/// WebView is inside a native SafeArea. Do not count its bottom padding twice.
double keyboardInsetFor({
  required double viewInsetBottom,
  required double viewPaddingBottom,
  required double devicePixelRatio,
}) => ((viewInsetBottom - viewPaddingBottom) / devicePixelRatio).clamp(0.0, double.infinity);

class AppTextSizes {
  const AppTextSizes({
    required this.body,
    required this.caption,
    required this.navTitle,
    required this.displayTitle,
  });

  final double body;
  final double caption;
  final double navTitle;
  final double displayTitle;

  Map<String, double> toMap() => {
        'body': body,
        'caption': caption,
        'navTitle': navTitle,
        'displayTitle': displayTitle,
      };
}

AppTextSizes textSizesFor(TextScaler scaler, {required bool isIOS}) {
  return AppTextSizes(
    body: scaler.scale(isIOS ? 17 : 16),
    caption: scaler.scale(isIOS ? 13 : 12),
    navTitle: scaler.scale(isIOS ? 17 : 18),
    displayTitle: scaler.scale(isIOS ? 28 : 22),
  );
}

class AppNativeRuntimePayload {
  const AppNativeRuntimePayload({
    required this.platform,
    this.surface = 'app',
    required this.colorScheme,
    required this.textSizes,
    this.safeAreaOwner = 'native',
    this.reduceMotion = false,
    this.reduceTransparency = false,
    this.keyboardInset = 0,
    required this.capabilities,
  });

  final int v = 1;
  final String platform; // 'android' | 'ios' | 'web'
  final String surface; // 'app' | 'browser'
  final String colorScheme; // 'light' | 'dark'
  final AppTextSizes textSizes;
  final String safeAreaOwner; // 'native' | 'web'
  final bool reduceMotion;
  final bool reduceTransparency;
  final double keyboardInset;
  final Map<String, bool> capabilities;

  Map<String, dynamic> toMap() => {
        'v': v,
        'platform': platform,
        'surface': surface,
        'colorScheme': colorScheme,
        'textSizes': textSizes.toMap(),
        'safeAreaOwner': safeAreaOwner,
        'reduceMotion': reduceMotion,
        'reduceTransparency': reduceTransparency,
        'keyboardInset': keyboardInset,
        'capabilities': capabilities,
      };

  String toJsonString() => jsonEncode(toMap());
}
