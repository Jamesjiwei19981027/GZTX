import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

bool _fontLoaded = false;

/// 加载测试中文字体，防止 golden 截图中的中文字体渲染为方块
Future<void> loadTestChineseFont(WidgetTester tester) async {
  if (_fontLoaded) return;
  try {
    const fontPath = r'C:\Windows\Fonts\simhei.ttf';
    final file = File(fontPath);
    if (file.existsSync()) {
      final bytes = file.readAsBytesSync();
      final fontData = ByteData.view(bytes.buffer);
      final fontLoader = FontLoader('SimHei')..addFont(Future.value(fontData));
      await tester.runAsync(() async {
        await fontLoader.load();
      });
    }
  } catch (_) {
    // 降级使用系统默认
  } finally {
    _fontLoaded = true;
  }
}

/// 统一双平台截图对比测试函数
Future<void> testAdaptiveGolden({
  required WidgetTester tester,
  required Widget widget,
  required String goldenFileNamePrefix,
  Size iosSize = const Size(390, 844),
  Size androidSize = const Size(412, 915),
}) async {
  await loadTestChineseFont(tester);

  // 1. 测试 iOS 风格截图
  debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
  await tester.binding.setSurfaceSize(iosSize);
  tester.view.physicalSize = iosSize;
  tester.view.devicePixelRatio = 1.0;

  await tester.pumpWidget(
    MaterialApp(
      theme: ThemeData(
        platform: TargetPlatform.iOS,
        fontFamily: 'SimHei',
      ),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('zh', 'CN')],
      home: MediaQuery(
        data: MediaQueryData(
          size: iosSize,
          devicePixelRatio: 1.0,
          padding: const EdgeInsets.only(top: 47, bottom: 34),
        ),
        child: widget,
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));

  await expectLater(
    find.byType(MaterialApp),
    matchesGoldenFile('goldens/${goldenFileNamePrefix}_ios.png'),
  );

  // 2. 测试 Android 风格截图
  debugDefaultTargetPlatformOverride = TargetPlatform.android;
  await tester.binding.setSurfaceSize(androidSize);
  tester.view.physicalSize = androidSize;
  tester.view.devicePixelRatio = 1.0;

  await tester.pumpWidget(
    MaterialApp(
      theme: ThemeData(
        platform: TargetPlatform.android,
        fontFamily: 'SimHei',
      ),
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('zh', 'CN')],
      home: MediaQuery(
        data: MediaQueryData(
          size: androidSize,
          devicePixelRatio: 1.0,
          padding: const EdgeInsets.only(top: 24, bottom: 16),
        ),
        child: widget,
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));

  await expectLater(
    find.byType(MaterialApp),
    matchesGoldenFile('goldens/${goldenFileNamePrefix}_android.png'),
  );

  // 恢复环境
  debugDefaultTargetPlatformOverride = null;
  await tester.binding.setSurfaceSize(null);
}
