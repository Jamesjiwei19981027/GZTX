import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/features/me/appearance/me_appearance.dart';
import 'package:worktodo_app/features/me/screens/me_appearance_screen.dart';

import 'me_test_harness.dart';

/// 与 `main.dart` 建议接入方式一致的宿主（共享改动申请中的代码）
Widget _hostedApp({
  required MeAppearanceController appearance,
  required Widget child,
  required ValueSetter<Brightness> onProbe,
  required ValueSetter<TextScaler> onScaleProbe,
}) {
  return MeAppearanceHost(
    controller: appearance,
    builder: (context, controller) => MaterialApp(
      theme: ThemeData(useMaterial3: true),
      darkTheme: ThemeData(useMaterial3: true, brightness: Brightness.dark),
      themeMode: controller.materialThemeMode,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('zh', 'CN')],
      builder: (context, appChild) {
        final media = MediaQuery.of(context);
        final scaler = controller.textScale == null
            ? media.textScaler
            : TextScaler.linear(controller.textScale!);
        return MediaQuery(
          data: media.copyWith(textScaler: scaler),
          child: appChild!,
        );
      },
      home: Column(
        children: [
          Expanded(child: child),
          // 宿主级探针：读取全局主题与全局字号（不在页面内部）
          Builder(
            builder: (probeContext) {
              onProbe(Theme.of(probeContext).brightness);
              onScaleProbe(MediaQuery.textScalerOf(probeContext));
              return const SizedBox.shrink();
            },
          ),
        ],
      ),
    ),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('切换深色后全局生效，并在"重启"后保留', (tester) async {
    MeTestHarness.useTallSurface(tester);
    SharedPreferences.setMockInitialValues({});
    final harness = await MeTestHarness.create();
    final appearance = MeAppearanceController();
    await appearance.ensureLoaded();

    var brightness = Brightness.light;
    var scaler = TextScaler.noScaling;

    await tester.pumpWidget(_hostedApp(
      appearance: appearance,
      child: ChangeNotifierProvider.value(
        value: harness.authState,
        child: MeAppearanceScreen(api: harness.api, appearance: appearance),
      ),
      onProbe: (value) => brightness = value,
      onScaleProbe: (value) => scaler = value,
    ));
    await tester.pumpAndSettle();
    expect(brightness, Brightness.light);

    harness.helper.whenPut('/users/me/ui-prefs', {
      'ui': {'language': 'zh', 'theme_mode': 'dark'},
    });

    await tester.tap(find.byKey(const Key('me-theme-dark')));
    await tester.pumpAndSettle();

    expect(appearance.themeMode, MeThemeMode.dark);
    // 宿主级探针变深色：证明不是只有本页变深，而是整包
    expect(brightness, Brightness.dark);
    expect(find.text('已生效'), findsNothing);
    expect(find.text('当前生效'), findsOneWidget);

    // 云端同步请求已发出
    final put = harness.lastRequest('PUT', '/users/me/ui-prefs');
    expect((put.body as Map)['theme_mode'], 'dark');

    // 模拟重启：新的控制器从本地持久化读取
    final restarted = MeAppearanceController();
    await restarted.ensureLoaded();
    expect(restarted.themeMode, MeThemeMode.dark);
    expect(scaler.scale(10), 10);
  });

  testWidgets('字号档位保存后全局生效，并在"重启"后保留', (tester) async {
    MeTestHarness.useTallSurface(tester);
    SharedPreferences.setMockInitialValues({});
    final harness = await MeTestHarness.create();
    final appearance = MeAppearanceController();
    await appearance.ensureLoaded();

    var brightness = Brightness.light;
    var scaler = TextScaler.noScaling;

    await tester.pumpWidget(_hostedApp(
      appearance: appearance,
      child: ChangeNotifierProvider.value(
        value: harness.authState,
        child: MeAppearanceScreen(api: harness.api, appearance: appearance),
      ),
      onProbe: (value) => brightness = value,
      onScaleProbe: (value) => scaler = value,
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('me-scale-1.3')));
    await tester.pumpAndSettle();

    expect(appearance.textScale, 1.3);
    expect(scaler.scale(10), closeTo(13, 0.001));
    expect(brightness, Brightness.light);

    final restarted = MeAppearanceController();
    await restarted.ensureLoaded();
    expect(restarted.textScale, 1.3);

    // 切回跟随系统
    await tester.tap(find.byKey(const Key('me-scale-system')));
    await tester.pumpAndSettle();
    expect(appearance.textScale, isNull);
    expect(scaler.scale(10), 10);
  });

  testWidgets('云端同步失败时本机仍然生效，并给出可见警告', (tester) async {
    MeTestHarness.useTallSurface(tester);
    SharedPreferences.setMockInitialValues({});
    final harness = await MeTestHarness.create();
    harness.helper.whenPut('/users/me/ui-prefs', '服务异常', statusCode: 500);
    final appearance = MeAppearanceController();
    await appearance.ensureLoaded();

    await tester.pumpWidget(_hostedApp(
      appearance: appearance,
      child: ChangeNotifierProvider.value(
        value: harness.authState,
        child: MeAppearanceScreen(api: harness.api, appearance: appearance),
      ),
      onProbe: (_) {},
      onScaleProbe: (_) {},
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('me-theme-dark')));
    await tester.pumpAndSettle();

    expect(appearance.themeMode, MeThemeMode.dark);
    expect(find.textContaining('云端同步失败'), findsOneWidget);
  });

  testWidgets('未接入宿主时 T09 页面内也能立即切换深色（兜底且幂等）', (tester) async {
    MeTestHarness.useTallSurface(tester);
    SharedPreferences.setMockInitialValues({});
    final harness = await MeTestHarness.create();
    harness.helper.whenPut('/users/me/ui-prefs', {
      'ui': {'theme_mode': 'dark'},
    });
    final appearance = MeAppearanceController();
    await appearance.ensureLoaded();

    await tester.pumpWidget(
      harness.wrap(
        MeAppearanceScreen(api: harness.api, appearance: appearance),
      ),
    );
    await tester.pumpAndSettle();

    Finder pageFinder() => find.text('外观与语言');
    expect(
      Theme.of(tester.element(pageFinder())).brightness,
      Brightness.light,
    );

    await tester.tap(find.byKey(const Key('me-theme-dark')));
    await tester.pumpAndSettle();

    // 页面级兜底生效
    expect(
      Theme.of(tester.element(pageFinder())).brightness,
      Brightness.dark,
    );
  });

  testWidgets('外观设置非法档位被拒绝', (tester) async {
    final appearance = MeAppearanceController();
    expect(
      () => appearance.setTextScale(1.77),
      throwsA(isA<ArgumentError>()),
    );
  });
}
