import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/design/widgets/app_toast.dart';
import 'package:worktodo_app/features/auth/data/auth_api.dart';
import 'package:worktodo_app/features/auth/gate/auth_gate_host.dart';
import 'package:worktodo_app/features/auth/utils/phone_reminder.dart';
import 'package:worktodo_app/router/app_router.dart';

import '../../helpers/mock_api_client.dart';
import 'helpers/auth_test_app.dart';

/// 验证 AuthGateHost（全局验证门宿主）的行为
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

Widget _hostedApp(
    AuthState authState, GoRouter router, PhoneReminderStorage storage) {
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

  group('全局验证门宿主 AuthGateHost', () {
    testWidgets('邀请页手机补验保留完整邀请目标', (tester) async {
      final helper = MockApiClientHelper();
      final auth = await _signedInState(helper,
          emailVerified: true, phoneVerified: false);
      final router = GoRouter(
        initialLocation: '/projects/invite/accept?token=phone-token',
        routes: [
          GoRoute(
              path: '/projects/invite/accept',
              builder: (context, state) => const Scaffold(body: Text('邀请'))),
          GoRoute(
              path: '/verify',
              builder: (context, state) => const Scaffold(body: Text('手机补验'))),
        ],
      );
      await tester
          .pumpWidget(_hostedApp(auth, router, InMemoryPhoneReminderStorage()));
      await tester.pumpAndSettle();
      await tester.tap(find.text('去绑定手机'));
      await tester.pumpAndSettle();
      expect(router.routeInformationProvider.value.uri.path, '/verify');
      expect(
          auth.takeAppLocation(), '/projects/invite/accept?token=phone-token');
      await tester.pumpWidget(const SizedBox.shrink());
      router.dispose();
      auth.dispose();
    });

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
            builder: (context, state) => const Scaffold(body: Text('工作入口占位')),
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
            builder: (context, state) => const Scaffold(body: Text('工作入口占位')),
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
            builder: (context, state) => const Scaffold(body: Text('工作入口占位')),
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

  group('按 main.dart 方式挂载后验证状态接口异常', () {
    // Toast 有 2 秒自动关闭定时器，测试结束前必须清掉，否则会报 pending timer
    tearDown(resetToastForTesting);

    testWidgets('已登录但验证状态接口断网：弹出中文提示且不抛异常', (tester) async {
      final helper = MockApiClientHelper();
      // MockClient 抛异常 → ApiClient 包成 NetworkException
      await _pumpMainLikeMount(
        tester,
        helper,
        verification: Exception('网络不可达'),
        statusCode: 200,
      );

      expect(find.textContaining('验证状态加载失败'), findsOneWidget);
      expect(find.textContaining('网络连接异常或请求超时'), findsOneWidget);
      // 弹提示不能靠异常冒泡：组件树里不允许出现未捕获异常
      expect(tester.takeException(), isNull);

      // 提示 2 秒后自动关闭，同时清掉它的定时器（否则测试结束会报 pending timer）
      await tester.pump(const Duration(seconds: 2));
      expect(find.textContaining('验证状态加载失败'), findsNothing);
    });

    testWidgets('已登录但验证状态接口 500：弹出中文提示且不抛异常', (tester) async {
      final helper = MockApiClientHelper();
      await _pumpMainLikeMount(
        tester,
        helper,
        verification: {'message': '服务器开小差了', 'code': 500},
        statusCode: 500,
      );

      expect(find.textContaining('验证状态加载失败'), findsOneWidget);
      expect(find.textContaining('服务器开小差了'), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.pump(const Duration(seconds: 2));
      expect(find.textContaining('验证状态加载失败'), findsNothing);
    });
  });
}

/// 与 `app/lib/main.dart` 一致的挂载方式：`MaterialApp.router` 的 `builder` 里包一层
/// [AuthGateHost]，并沿用生产同一个 `AppRouter.rootNavigatorKey`。
Widget _mainLikeApp(AuthTestApp app) {
  return ChangeNotifierProvider<AuthState>.value(
    value: app.authState,
    child: MaterialApp.router(
      routerConfig: app.appRouter.router,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [Locale('zh', 'CN')],
      builder: (context, child) => AuthGateHost(
        router: app.appRouter.router,
        navigatorKey: AppRouter.rootNavigatorKey,
        child: child ?? const SizedBox.shrink(),
      ),
    ),
  );
}

/// 已登录启动：[AuthGateHost] 会在首帧后请求验证状态接口。
Future<AuthTestApp> _pumpMainLikeMount(
  WidgetTester tester,
  MockApiClientHelper helper, {
  required Object verification,
  required int statusCode,
}) async {
  helper.whenGet('/users/me', {
    'id': 11,
    'username': 'e2e_user',
    'nickname': '端到端测试员',
  });
  helper.whenGet('/companies/mine', {'items': []});
  helper.whenGet(
    '/users/me/verification',
    verification,
    statusCode: statusCode,
  );

  final app = AuthTestApp(helper: helper, authenticated: true);
  await app.authState.bootstrap();
  // 生产用的是同一个静态 rootNavigatorKey，同一时刻只能有一棵树在用它
  await tester.pumpWidget(_mainLikeApp(app));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 50));
  return app;
}
