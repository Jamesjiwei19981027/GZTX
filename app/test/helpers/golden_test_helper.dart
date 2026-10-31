import 'dart:convert';
import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

bool _fontsLoaded = false;

/// 加载测试字体资源：
/// 1. 加载 FontManifest.json 中的全部字体（包括 MaterialIcons 与 packages/cupertino_icons/CupertinoIcons 图标字体）
/// 2. 加载仓库内的开源中文字体（Noto Sans SC 子集），并注册到通用族及 Cupertino 默认字体别名
/// 任何加载失败直接抛出异常导致测试失败，严禁静默降级为方块
Future<void> loadTestFonts(WidgetTester tester) async {
  if (_fontsLoaded) return;

  // 1. 统一加载 FontManifest.json 里的全部字体（含图标字体）
  final manifestContent = await rootBundle.loadString('FontManifest.json');
  final List<dynamic> manifest = json.decode(manifestContent) as List<dynamic>;
  for (final dynamic fontItem in manifest) {
    final family = fontItem['family'] as String;
    final fonts = fontItem['fonts'] as List<dynamic>;
    final loader = FontLoader(family);
    for (final dynamic font in fonts) {
      final asset = font['asset'] as String;
      loader.addFont(rootBundle.load(asset));
    }
    await tester.runAsync(() async {
      await loader.load();
    });
  }

  // 2. 加载仓库内的开源中文字体（Noto Sans SC 子集）
  final possiblePaths = [
    'test/helpers/fonts/NotoSansSC-Subset.ttf',
    'app/test/helpers/fonts/NotoSansSC-Subset.ttf',
  ];

  File? fontFile;
  for (final p in possiblePaths) {
    final f = File(p);
    if (f.existsSync()) {
      fontFile = f;
      break;
    }
  }

  if (fontFile == null) {
    throw StateError(
      '未在仓库内找到开源中文字体测试资源 NotoSansSC-Subset.ttf，搜索路径: $possiblePaths。\n'
      '测试必须依赖此字体，不能降级为系统方块。',
    );
  }

  final bytes = fontFile.readAsBytesSync();
  if (bytes.isEmpty) {
    throw StateError('开源中文字体文件为空或损坏: ${fontFile.path}');
  }

  // 为中文字体注册 NotoSansSC 及 Cupertino 默认采用的字体别名
  final families = [
    'NotoSansSC',
    '.SF Pro Text',
  ];

  for (final family in families) {
    final loader = FontLoader(family)
      ..addFont(Future.value(ByteData.view(bytes.buffer)));
    await tester.runAsync(() async {
      await loader.load();
    });
  }

  _fontsLoaded = true;
}

/// 统一双平台截图对比测试函数
Future<void> testAdaptiveGolden({
  required WidgetTester tester,
  required Widget widget,
  required String goldenFileNamePrefix,
  Size iosSize = const Size(390, 844),
  Size androidSize = const Size(412, 915),
}) async {
  await loadTestFonts(tester);

  const testFont = 'NotoSansSC';
  const cupertinoTextTheme = CupertinoTextThemeData(
    textStyle: TextStyle(fontFamily: testFont),
    actionTextStyle: TextStyle(fontFamily: testFont),
    tabLabelTextStyle: TextStyle(fontFamily: testFont),
    navTitleTextStyle: TextStyle(
      fontFamily: testFont,
      fontSize: 17,
      fontWeight: FontWeight.w600,
    ),
    navLargeTitleTextStyle: TextStyle(fontFamily: testFont),
    pickerTextStyle: TextStyle(fontFamily: testFont),
    dateTimePickerTextStyle: TextStyle(fontFamily: testFont),
  );

  // 1. 测试 iOS 风格截图
  debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
  await tester.binding.setSurfaceSize(iosSize);
  tester.view.physicalSize = iosSize;
  tester.view.devicePixelRatio = 1.0;

  await tester.pumpWidget(
    CupertinoTheme(
      data: const CupertinoThemeData(
        textTheme: cupertinoTextTheme,
      ),
      child: MaterialApp(
        theme: ThemeData(
          platform: TargetPlatform.iOS,
          fontFamily: testFont,
          fontFamilyFallback: const [testFont, '.SF Pro Text'],
          cupertinoOverrideTheme: const CupertinoThemeData(
            textTheme: cupertinoTextTheme,
          ),
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
        fontFamily: testFont,
        fontFamilyFallback: const [testFont],
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
