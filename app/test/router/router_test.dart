import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/router/app_router.dart';
import '../helpers/mock_api_client.dart';

void main() {
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
