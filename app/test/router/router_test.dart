import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/router/app_router.dart';
import '../helpers/mock_api_client.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});

  group('路由与 5 个 Tab 导航测试', () {
    testWidgets('5 个 Tab 切换并呈现各 Tab 占位页', (tester) async {
      final helper = MockApiClientHelper();
      helper.whenGet('/users/me', {'id': 1, 'username': 'e2e_user'});
      helper.whenGet('/companies/mine', {'items': []});

      final authState = AuthState(apiClient: helper.buildClient());
      await authState.bootstrap();

      final appRouter = AppRouter(authState: authState);

      await tester.pumpWidget(
        MaterialApp.router(
          routerConfig: appRouter.router,
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
        ),
      );
      await tester.pumpAndSettle();

      // 默认在 Tab 0: 工作
      expect(find.text('工作 (T02)'), findsOneWidget);

      // 切换到 Tab 1: 人轴
      await tester.tap(find.text('人轴'));
      await tester.pumpAndSettle();
      expect(find.text('人轴 (T04)'), findsOneWidget);

      // 切换到 Tab 2: 知识
      await tester.tap(find.text('知识'));
      await tester.pumpAndSettle();
      expect(find.text('知识 (T06)'), findsOneWidget);

      // 切换到 Tab 3: 消息
      await tester.tap(find.text('消息'));
      await tester.pumpAndSettle();
      expect(find.text('消息 (T08)'), findsOneWidget);

      // 切换到 Tab 4: 我的
      await tester.tap(find.text('我的'));
      await tester.pumpAndSettle();
      expect(find.text('我的 (T09)'), findsOneWidget);

      // 切回工作 Tab
      await tester.tap(find.text('工作'));
      await tester.pumpAndSettle();
      expect(find.text('工作 (T02)'), findsOneWidget);
    });

    testWidgets('Tab 页面栈保留测试：在工作 Tab 推入二级页 -> 切到人轴 -> 切回工作 Tab 仍保留二级页，再次点击当前 Tab 回到根页',
        (tester) async {
      final helper = MockApiClientHelper();
      helper.whenGet('/users/me', {'id': 1, 'username': 'e2e_user'});
      helper.whenGet('/companies/mine', {'items': []});

      final authState = AuthState(apiClient: helper.buildClient());
      await authState.bootstrap();

      final appRouter = AppRouter(authState: authState);

      await tester.pumpWidget(
        MaterialApp.router(
          routerConfig: appRouter.router,
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
        ),
      );
      await tester.pumpAndSettle();

      // 1. 初始位于工作 Tab 根页
      expect(find.text('工作 (T02)'), findsOneWidget);

      // 2. 点击进入工作 Tab 下的二级页（任务列表）
      await tester.tap(find.text('前往任务列表'));
      await tester.pumpAndSettle();
      expect(find.text('任务列表 (T02)'), findsOneWidget);
      expect(find.text('工作 (T02)'), findsNothing);

      // 3. 切换到 Tab 1: 人轴
      await tester.tap(find.text('人轴'));
      await tester.pumpAndSettle();
      expect(find.text('人轴 (T04)'), findsOneWidget);

      // 4. 切回 Tab 0: 工作，断言任务列表二级页依然存在（页面栈保留真实验证）
      await tester.tap(find.text('工作'));
      await tester.pumpAndSettle();
      expect(find.text('任务列表 (T02)'), findsOneWidget);
      expect(find.text('工作 (T02)'), findsNothing);

      // 5. 再次点击当前处于激活状态的工作 Tab（原生习惯：再点一次当前 Tab 回到该 Tab 根页）
      await tester.tap(find.text('工作'));
      await tester.pumpAndSettle();
      expect(find.text('工作 (T02)'), findsOneWidget);
      expect(find.text('任务列表 (T02)'), findsNothing);
    });

    testWidgets('断网状态 (AuthStatus.offline) 自动重定向至离线兜底页并可交互', (tester) async {
      final helper = MockApiClientHelper();
      // 500 异常模拟后端网络/网关不可用
      helper.whenGet('/users/me', '网络故障', statusCode: 500);

      final authState = AuthState(
        apiClient: helper.buildClient(
          tokenStorage: InMemoryTokenStorage(access: 'stale-token'),
        ),
      );
      // bootstrap 遇到 NetworkException 会进入 offline
      await authState.bootstrap();
      expect(authState.status, AuthStatus.offline);

      final appRouter = AppRouter(authState: authState);

      await tester.pumpWidget(
        MaterialApp.router(
          routerConfig: appRouter.router,
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
        ),
      );
      await tester.pumpAndSettle();

      // 断言被重定向到 /offline 离线页
      expect(find.text('网络不可用'), findsOneWidget);
      expect(find.text('重试连接'), findsOneWidget);
      expect(find.text('退出当前登录'), findsOneWidget);
    });

    test('返回动作裁决逻辑符合规范', () {
      expect(
        resolveBackAction(isDirty: true, hasOverlay: false, canPop: true),
        AppBackAction.confirmDiscard,
      );
      expect(
        resolveBackAction(isDirty: false, hasOverlay: true, canPop: true),
        AppBackAction.closeOverlay,
      );
      expect(
        resolveBackAction(isDirty: false, hasOverlay: false, canPop: true),
        AppBackAction.popDetail,
      );
      expect(
        resolveBackAction(isDirty: false, hasOverlay: false, canPop: false),
        AppBackAction.root,
      );
    });
  });
}
