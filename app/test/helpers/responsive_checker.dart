import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

/// 屏幕与极端无障碍适配校验工具
class ResponsiveChecker {
  /// 测试在 320 窄屏宽度、430 宽屏宽度、字号放大 200%、深色模式下无布局溢出 (A RenderFlex overflowed)
  static Future<void> checkAdaptiveLayout({
    required WidgetTester tester,
    required Widget widget,
  }) async {
    final originalOnError = FlutterError.onError;
    bool hasOverflow = false;
    FlutterError.onError = (FlutterErrorDetails details) {
      if (details.exceptionAsString().contains('A RenderFlex overflowed by') ||
          details.exceptionAsString().contains('overflowed')) {
        hasOverflow = true;
      }
      originalOnError?.call(details);
    };

    final testCases = [
      // 1. 320 极限窄屏
      (const Size(320, 600), 1.0, Brightness.light, '320窄屏'),
      // 2. 430 宽屏旗舰
      (const Size(430, 932), 1.0, Brightness.light, '430宽屏'),
      // 3. 系统字号放大到 200%
      (const Size(375, 812), 2.0, Brightness.light, '字号200%'),
      // 4. 深色模式
      (const Size(375, 812), 1.0, Brightness.dark, '深色模式'),
    ];

    try {
      for (final (size, scale, brightness, label) in testCases) {
        hasOverflow = false;
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1.0;

        await tester.pumpWidget(
          MaterialApp(
            theme: ThemeData(
              brightness: brightness,
              useMaterial3: true,
            ),
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            home: MediaQuery(
              data: MediaQueryData(
                size: size,
                textScaler: TextScaler.linear(scale),
                platformBrightness: brightness,
              ),
              child: Material(child: widget),
            ),
          ),
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));

        expect(
          hasOverflow,
          false,
          reason: '在 $label (尺寸: $size, 字号: $scale, 模式: $brightness) 下发生布局溢出！',
        );
      }
    } finally {
      FlutterError.onError = originalOnError;
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    }
  }
}
