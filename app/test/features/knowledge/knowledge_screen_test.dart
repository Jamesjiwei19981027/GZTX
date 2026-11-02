import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/features/knowledge/screens/knowledge_screen.dart';

import '../../helpers/mock_api_client.dart';
import 'knowledge_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});

  Future<void> pumpRoot(
    WidgetTester tester,
    AuthState authState, {
    GoRouter? router,
  }) async {
    final effectiveRouter = router ??
        GoRouter(
          initialLocation: '/knowledge',
          routes: [
            GoRoute(
              path: '/knowledge',
              builder: (context, state) => const KnowledgeScreen(),
              routes: [
                GoRoute(
                  path: 'chat',
                  name: 'knowledge-chat',
                  builder: (context, state) =>
                      const Scaffold(body: Text('知识助手对话页')),
                ),
              ],
            ),
          ],
        );
    await tester.pumpWidget(
      ChangeNotifierProvider<AuthState>.value(
        value: authState,
        child: MaterialApp.router(
          routerConfig: effectiveRouter,
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: const [Locale('zh', 'CN')],
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('没有项目时提示先选择项目', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/users/me', {'id': 11, 'username': 'E2E 用户'});
    helper.whenGet('/companies/mine', {'items': <dynamic>[]});
    final authState = AuthState(apiClient: helper.buildClient());
    await authState.bootstrap();

    await pumpRoot(tester, authState);

    expect(find.text('知识'), findsOneWidget);
    expect(find.text('先选择一个项目'), findsOneWidget);
    expect(find.text('未选择项目'), findsOneWidget);
  });

  testWidgets('有项目时默认显示我的知识，并能切到项目知识', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/users/me', {'id': 11, 'username': 'E2E 用户'});
    helper.whenGet('/companies/mine', {
      'items': [
        {'id': 3, 'name': '示例公司'},
      ],
    });
    helper.whenGet(
      '/projects',
      {
        'items': [
          {'id': 7, 'name': '手机端体验升级'},
        ],
      },
      query: {'company_id': '3', 'as_admin': 'true'},
    );
    helper.whenGet('/projects/7/personal-knowledge', emptySpace);
    helper.whenGet('/projects/7/knowledge-space', projectCatalogNoPermission);
    final authState = AuthState(apiClient: helper.buildClient());
    await authState.bootstrap();

    await pumpRoot(tester, authState);

    expect(find.text('手机端体验升级'), findsOneWidget);
    expect(find.text('我的知识'), findsOneWidget);
    expect(find.text('项目知识'), findsOneWidget);
    expect(find.text('记下第一条工作积累'), findsOneWidget);

    await tester.tap(find.text('项目知识'));
    await tester.pumpAndSettle();

    expect(find.text('团队共享资料'), findsOneWidget);
    expect(find.text('八项接口通过验收'), findsOneWidget);
  });

  testWidgets('切到项目知识再切回我的知识后，搜索框仍显示原来的搜索词', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/users/me', {'id': 11, 'username': 'E2E 用户'});
    helper.whenGet('/companies/mine', {
      'items': [
        {'id': 3, 'name': '示例公司'},
      ],
    });
    helper.whenGet(
      '/projects',
      {
        'items': [
          {'id': 7, 'name': '手机端体验升级'},
        ],
      },
      query: {'company_id': '3', 'as_admin': 'true'},
    );
    helper.whenGet('/projects/7/personal-knowledge', spaceWithTwoEntries);
    helper.whenGet('/projects/7/knowledge-space', projectCatalogNoPermission);
    final authState = AuthState(apiClient: helper.buildClient());
    await authState.bootstrap();

    await pumpRoot(tester, authState);

    await tester.enterText(find.byType(EditableText).first, '验收');
    await tester.pump();
    expect(find.text('客户需求确认'), findsOneWidget);
    expect(find.text('接口联调记录'), findsNothing);

    await tester.tap(find.text('项目知识'));
    await tester.pumpAndSettle();
    expect(find.text('团队共享资料'), findsOneWidget);

    await tester.tap(find.text('我的知识'));
    await tester.pumpAndSettle();

    // 输入框回填后与过滤条件一致：看得见搜索词，也看得见被过滤的结果差异
    expect(
      tester.widget<EditableText>(find.byType(EditableText)).controller.text,
      '验收',
    );
    expect(find.text('客户需求确认'), findsOneWidget);
    expect(find.text('接口联调记录'), findsNothing);
  });

  testWidgets('知识助手入口跳到知识助手路由', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/users/me', {'id': 11, 'username': 'E2E 用户'});
    helper.whenGet('/companies/mine', {
      'items': [
        {'id': 3, 'name': '示例公司'},
      ],
    });
    helper.whenGet(
      '/projects',
      {
        'items': [
          {'id': 7, 'name': '手机端体验升级'},
        ],
      },
      query: {'company_id': '3', 'as_admin': 'true'},
    );
    helper.whenGet('/projects/7/personal-knowledge', emptySpace);
    helper.whenGet('/projects/7/knowledge-space', projectCatalogNoPermission);
    final authState = AuthState(apiClient: helper.buildClient());
    await authState.bootstrap();

    await pumpRoot(tester, authState);

    await tester.tap(find.byTooltip('问知识助手'));
    await tester.pumpAndSettle();

    expect(find.text('知识助手对话页'), findsOneWidget);
  });
}
