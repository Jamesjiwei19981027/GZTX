import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/features/auth/screens/login_screen.dart';
import 'package:worktodo_app/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  FlutterSecureStorage.setMockInitialValues({});

  testWidgets('app boots to loading or login gate (legacy gate) without clearing legacy tokens', (tester) async {
    SharedPreferences.setMockInitialValues({
      'access_token': 'legacy_access_token',
      'refresh_token': 'legacy_refresh_token',
    });

    await tester.pumpWidget(
      const WorkTodoApp(
        useNativeOverride: false,
        useWebShellOverride: false,
      ),
    );
    expect(find.byType(CircularProgressIndicator), findsWidgets);

    // 验证旧模式启动下，SharedPreferences 里的旧明文令牌绝不被清除
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('access_token'), 'legacy_access_token');
    expect(prefs.getString('refresh_token'), 'legacy_refresh_token');
  });

  testWidgets('app boots with useNativeOverride: true and clears legacy tokens', (tester) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('access_token', 'legacy_access_token');
    await prefs.setString('refresh_token', 'legacy_refresh_token');

    await tester.pumpWidget(
      const WorkTodoApp(useNativeOverride: true),
    );
    await tester.pumpAndSettle();

    // 原生版启动后，未登录状态下重定向到登录页面
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.text('欢迎回来'), findsOneWidget);

    // 原生版启动后清除历史明文令牌
    expect(prefs.containsKey('access_token'), false);
    expect(prefs.containsKey('refresh_token'), false);
  });
}
