import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/platform/app_runtime.dart';

void main() {
  test('overlay keyboard excludes safe area already owned by native host', () {
    expect(keyboardInsetFor(viewInsetBottom: 1008, viewPaddingBottom: 72, devicePixelRatio: 3), 312);
    expect(keyboardInsetFor(viewInsetBottom: 0, viewPaddingBottom: 72, devicePixelRatio: 3), 0);
  });
  group('AppTextSizes and runtime tests', () {
    test('iOS semantic body follows supplied system scaler', () {
      expect(textSizesFor(const TextScaler.linear(2), isIOS: true).body, 34);
      expect(textSizesFor(const TextScaler.linear(1), isIOS: true).caption, 13);
      expect(textSizesFor(const TextScaler.linear(1), isIOS: true).navTitle, 17);
      expect(textSizesFor(const TextScaler.linear(1), isIOS: true).displayTitle, 28);
    });

    test('Android semantic sizes follow Android baseline', () {
      expect(textSizesFor(const TextScaler.linear(1), isIOS: false).body, 16);
      expect(textSizesFor(const TextScaler.linear(1), isIOS: false).caption, 12);
      expect(textSizesFor(const TextScaler.linear(1), isIOS: false).navTitle, 18);
      expect(textSizesFor(const TextScaler.linear(1), isIOS: false).displayTitle, 22);
    });

    test('AppNativeRuntimePayload serializes to v1 schema', () {
      final payload = AppNativeRuntimePayload(
        platform: 'android',
        colorScheme: 'light',
        textSizes: textSizesFor(TextScaler.noScaling, isIOS: false),
        capabilities: const {'haptics': true, 'nativeBack': true},
      );
      final map = payload.toMap();
      expect(map['v'], 1);
      expect(map['platform'], 'android');
      expect(map['surface'], 'app');
      expect(map['safeAreaOwner'], 'native');
      expect(map['capabilities']['nativeBack'], true);
    });
  });
}
