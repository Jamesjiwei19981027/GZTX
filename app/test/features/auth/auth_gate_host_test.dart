import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/features/auth/data/auth_api.dart';
import 'package:worktodo_app/features/auth/gate/auth_gate_host.dart';
import 'package:worktodo_app/features/auth/utils/phone_reminder.dart';

import '../../helpers/mock_api_client.dart';
import 'helpers/auth_test_app.dart';

/// 验证 AuthGateHost（待底座挂载的全局验证门宿主）的行为
Future<AuthState> _signedInState(
  MockApiClientHelper helper, {
  required bool emailVerified,
  required bool phoneVerified,
}) async {
  helper.whenGet('/users/me', {'id': 11, 'username': 'e2e_user'});
  helper.whenGet('/companies/mine', {'items': []});
  helper.whenGet('/users/me/verification', {
    'email': 'e2e_user@example.com',
    'phone': '13900000001',
    'email_verified': emailVerified,
    'phone_verified': phoneVerified,
    'is_verified': emailVerified && phoneVerified,
  });
  final authState = AuthState(
    apiClient: helper.buildClient(
      tokenStorage: InMemoryTokenStorage(access: 'mock-access-token'),
    ),
  );
  await authState.bootstrap();
  return authState;
}

Widget _hostedApp(AuthState authState, GoRouter router, PhoneReminderStorage storage) {
  return ChangeNotifierProvider<AuthState>.value(
    value: authState,
    child: MaterialApp.router(
      routerConfig: router,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (context, child) => AuthGateHost(
        router: router,
        navigatorKey: router.routerDelegate.navigatorKey,
        api: AuthApi(authState.api),
        reminderStorage: storage,
        now: DateTime.utc(2026, 3, 1, 9),
        child: child ?? const SizedBox.shrink(),
      ),
    ),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    resetAuthModuleState();
  });

  group('全局验证门宿主 AuthGateHost（待底座挂载）', () {
    testWidgets('已登录但邮箱未验证：自动跳转验证门', (tester) async {
      final helper = MockApiClientHelper();
      final authState = await _signedInState(
        helper,
        emailVerified: false,
        phoneVerified: false,
      );

      final router = GoRouter(
        initialLocation: '/work',
        routes: [
          GoRoute(
            path: '/work',
            builder: (context, state) =>
                const Scaffold(body: Text('工作入口占位')),
          ),
          GoRoute(
            path: '/verify',
            builder: (context, state) => Scaffold(
              body: Text('验证门:${state.uri.queryParameters['required']}'),
            ),
          ),
        ],
      );

      await tester.pumpWidget(
        _hostedApp(authState, router, InMemoryPhoneReminderStorage()),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('验证门:email'), findsOneWidget);
    });

    testWidgets('邮箱已验证且手机未验证：弹出每周一次的提醒', (tester) async {
      final helper = MockApiClientHelper();
      final authState = await _signedInState(
        helper,
        emailVerified: true,
        phoneVerified: false,
      );

      final router = GoRouter(
        initialLocation: '/work',
        routes: [
          GoRoute(
            path: '/work',
            builder: (context, state) =>
                const Scaffold(body: Text('工作入口占位')),
          ),
          GoRoute(
            path: '/verify',
            builder: (context, state) => const Scaffold(body: Text('验证门')),
          ),
        ],
      );

      await tester.pumpWidget(
        _hostedApp(authState, router, InMemoryPhoneReminderStorage()),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('手机号码尚未验证'), findsOneWidget);
      expect(find.text('工作入口占位'), findsOneWidget);
    });

    testWidgets('邮箱与手机都已验证：不拦截、不弹提醒', (tester) async {
      final helper = MockApiClientHelper();
      final authState = await _signedInState(
        helper,
        emailVerified: true,
        phoneVerified: true,
      );

      final router = GoRouter(
        initialLocation: '/work',
        routes: [
          GoRoute(
            path: '/work',
            builder: (context, state) =>
                const Scaffold(body: Text('工作入口占位')),
          ),
          GoRoute(
            path: '/verify',
            builder: (context, state) => const Scaffold(body: Text('验证门')),
          ),
        ],
      );

      await tester.pumpWidget(
        _hostedApp(authState, router, InMemoryPhoneReminderStorage()),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('工作入口占位'), findsOneWidget);
      expect(find.text('验证门'), findsNothing);
      expect(find.text('手机号码尚未验证'), findsNothing);
    });
  });
}
