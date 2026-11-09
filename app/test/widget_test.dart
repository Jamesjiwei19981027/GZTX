import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/features/auth/screens/login_screen.dart';
import 'package:worktodo_app/main.dart';

class _TrackingAuthState extends AuthState {
  _TrackingAuthState(this.onDisposed);

  final void Function() onDisposed;

  @override
  void dispose() {
    onDisposed();
    super.dispose();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  FlutterSecureStorage.setMockInitialValues({});
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('默认原生且两个编译期回退开关均生效', () {
    expect(resolveNativeApp(), isTrue);
    expect(resolveNativeApp(native: false), isFalse);
    expect(resolveNativeApp(webShell: true), isFalse);
    expect(resolveNativeApp(native: false, webShell: true), isFalse);
  });

  test('resolveShellMode maps all four flag combinations to one mode', () {
    expect(
      resolveShellMode(useNative: true, useWebShell: false),
      AppShellMode.native,
    );
    expect(
      resolveShellMode(useNative: false, useWebShell: false),
      AppShellMode.webShell,
    );
    expect(
      resolveShellMode(useNative: false, useWebShell: true),
      AppShellMode.webShell,
    );
    expect(
      resolveShellMode(useNative: true, useWebShell: true),
      AppShellMode.webShell,
    );
  });

  testWidgets('switching from native to web shell disposes the old AuthState',
      (tester) async {
    var disposeCount = 0;
    final nativeApp = WorkTodoApp(
      useNativeOverride: true,
      authStateFactory: () => _TrackingAuthState(() => disposeCount++),
      webShellFactory: () => const SizedBox(),
    );

    await tester.pumpWidget(nativeApp);
    await tester.pump();
    expect(disposeCount, 0);

    await tester.pumpWidget(
      WorkTodoApp(
        useNativeOverride: false,
        authStateFactory: () => _TrackingAuthState(() => disposeCount++),
        webShellFactory: () => const SizedBox(),
      ),
    );
    await tester.pump();

    expect(disposeCount, 1);
  });

  testWidgets('默认启动真实原生登录页并清理历史明文令牌', (tester) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('access_token', 'legacy_access_token');
    await prefs.setString('refresh_token', 'legacy_refresh_token');

    await tester.pumpWidget(
      const WorkTodoApp(),
    );
    await tester.pumpAndSettle();

    // 原生版启动后，未登录状态下重定向到登录页面
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.text('登录'), findsOneWidget);

    // 原生版启动后清除历史明文令牌
    expect(prefs.containsKey('access_token'), false);
    expect(prefs.containsKey('refresh_token'), false);
  });
}
