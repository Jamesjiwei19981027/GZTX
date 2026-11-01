import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/features/auth/gate/auth_gate_host.dart';
import 'package:worktodo_app/features/auth/widgets/phone_reminder.dart';
import 'package:worktodo_app/router/app_router.dart';

import '../../../helpers/mock_api_client.dart';

/// T01 测试用的整机（真实路由 + 全局登录态 + 假接口）装配。
class AuthTestApp {
  AuthTestApp({
    MockApiClientHelper? helper,
    TokenStorage? tokenStorage,
    bool authenticated = false,
  }) : helper = helper ?? MockApiClientHelper() {
    client = this.helper.buildClient(
      tokenStorage: tokenStorage ??
          InMemoryTokenStorage(access: authenticated ? 'mock-access-token' : null),
    );
    authState = AuthState(apiClient: client);
    appRouter = AppRouter(authState: authState);
  }

  final MockApiClientHelper helper;
  late final ApiClient client;
  late final AuthState authState;
  late final AppRouter appRouter;

  TokenStorage get tokens => authState.api.tokens;

  Widget build() {
    return ChangeNotifierProvider<AuthState>.value(
      value: authState,
      child: MaterialApp.router(
        routerConfig: appRouter.router,
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [Locale('zh', 'CN')],
      ),
    );
  }

  Future<void> pump(WidgetTester tester) async {
    tester.view.physicalSize = const Size(430, 932);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    // 生产环境 main.dart 启动时调用 bootstrap；测试这里补齐，让路由守卫有真实登录态
    if (authState.status == AuthStatus.initial) {
      await authState.bootstrap();
    }
    await tester.pumpWidget(build());
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }

  /// 单页测试用：只挂载一个组件（仍提供全局限言状态，方便页面内的接口调用）
  Widget wrapSingle(Widget child) {
    return ChangeNotifierProvider<AuthState>.value(
      value: authState,
      child: MaterialApp(
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: const [Locale('zh', 'CN')],
        home: child,
      ),
    );
  }
}

/// 清理跨测试的模块级状态（提醒去重、验证门去重、Toast）
void resetAuthModuleState() {
  PhoneReminderSession.resetForTesting();
  AuthGateSession.reset();
}
