import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/data/axis_view_models.dart';
import 'package:worktodo_app/features/axis/screens/axis_audit_screen.dart';
import 'package:worktodo_app/features/axis/screens/axis_delegations_screen.dart';
import 'package:worktodo_app/features/axis/screens/axis_edit_responsibility_screen.dart';
import 'package:worktodo_app/features/axis/screens/axis_node_detail_screen.dart';
import 'package:worktodo_app/features/axis/screens/axis_progress_screen.dart';
import 'package:worktodo_app/features/axis/screens/axis_root_screen.dart';

import 'axis_test_harness.dart';

/// 320 窄屏、430 宽屏、系统字号 200%、深色模式下的布局适配检查。
///
/// `ResponsiveChecker` 内部重新 pump 时会丢掉页面异步加载出来的内容，
/// 因此这里对每个人轴页面单独建夹具、等加载完成后再断言无 RenderFlex 溢出。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    // 画布连线有持续的流动动画；这些用例按“减少动态效果”渲染，
    // 否则 pumpAndSettle 永远等不到静止，截图也会随动画帧漂移。
    final dispatcher = TestWidgetsFlutterBinding.instance.platformDispatcher;
    dispatcher.accessibilityFeaturesTestValue = const FakeAccessibilityFeatures(
      disableAnimations: true,
    );
    addTearDown(dispatcher.clearAccessibilityFeaturesTestValue);
  });

  const cases = [
    (Size(320, 600), 1.0, Brightness.light, '320窄屏'),
    (Size(430, 932), 1.0, Brightness.light, '430宽屏'),
    (Size(375, 812), 2.0, Brightness.light, '字号200%'),
    (Size(375, 812), 1.0, Brightness.dark, '深色模式'),
  ];

  Future<void> checkPage(
    WidgetTester tester,
    String name,
    Future<Widget> Function(AxisTestHarness harness) build,
  ) async {
    for (final (size, scale, brightness, label) in cases) {
      for (final platform in [TargetPlatform.android, TargetPlatform.iOS]) {
        final harness = await AxisTestHarness.create(
          isPm: true,
          permissions: AxisTestHarness.defaultPermissions(isPm: true),
        );
        if (name == '委托授权') {
          harness.helper.whenGet(
            '/delegations',
            AxisTestHarness.delegationsPayload(),
            query: {
              'company_id': '1',
              'project_id': '${AxisTestHarness.projectId}',
            },
          );
        }
        harness.helper.whenPost(
          '/projects/${AxisTestHarness.projectId}/axis-audit',
          AxisTestHarness.auditPayload(),
        );
        final page = await build(harness);

        bool hasOverflow = false;
        final originalOnError = FlutterError.onError;
        FlutterError.onError = (details) {
          if (details.exceptionAsString().contains('overflowed')) {
            hasOverflow = true;
          }
          originalOnError?.call(details);
        };
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1.0;
        try {
          await tester.pumpWidget(MaterialApp(
            theme: ThemeData(
              platform: platform,
              brightness: brightness,
              useMaterial3: true,
            ),
            localizationsDelegates: const [
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            supportedLocales: const [Locale('zh', 'CN')],
            home: MediaQuery(
              data: MediaQueryData(
                size: size,
                textScaler: TextScaler.linear(scale),
                platformBrightness: brightness,
                disableAnimations: true,
              ),
              child: page,
            ),
          ));
          await tester.pumpAndSettle();
          expect(
            hasOverflow,
            isFalse,
            reason: '$name 在 $platform / $label (${size.width}x${size.height}) 下溢出',
          );
        } finally {
          FlutterError.onError = originalOnError;
        }
      }
    }
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  }

  testWidgets('人轴根页（我的职责）适配', (tester) async {
    await checkPage(
      tester,
      '人轴根页（我的职责）',
      (h) async => AxisRootScreen(api: h.api, authState: h.authState),
    );
  });

  testWidgets('人轴根页（项目全貌）适配', (tester) async {
    await checkPage(
      tester,
      '人轴根页（项目全貌）',
      (h) async => AxisRootScreen(
        api: h.api,
        authState: h.authState,
        initialTab: AxisViewTab.overview,
      ),
    );
  });

  testWidgets('人员详情适配', (tester) async {
    await checkPage(
      tester,
      '人员详情',
      (h) async => AxisNodeDetailScreen(
        nodeId: 102,
        projectId: AxisTestHarness.projectId,
        api: h.api,
      ),
    );
  });

  testWidgets('编辑人员职责适配', (tester) async {
    await checkPage(
      tester,
      '编辑人员职责',
      (h) async => AxisEditResponsibilityScreen(
        personId: 102,
        projectId: AxisTestHarness.projectId,
        api: h.api,
      ),
    );
  });

  testWidgets('进度与记录适配', (tester) async {
    await checkPage(
      tester,
      '进度与记录',
      (h) async => AxisProgressScreen(nodeId: 102, api: h.api),
    );
  });

  testWidgets('委托授权适配', (tester) async {
    await checkPage(
      tester,
      '委托授权',
      (h) async => AxisDelegationsScreen(
        api: h.api,
        authState: h.authState,
      ),
    );
  });

  testWidgets('AI 责任链审计适配', (tester) async {
    await checkPage(
      tester,
      'AI 责任链审计',
      (h) async => AxisAuditScreen(
        api: h.api,
        authState: h.authState,
      ),
    );
  });
}
