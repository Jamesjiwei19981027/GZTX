import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/axis/screens/axis_root_screen.dart';
import 'package:worktodo_app/features/knowledge/screens/knowledge_screen.dart';
import 'package:worktodo_app/features/me/screens/me_root_screen.dart';
import 'package:worktodo_app/features/messages/screens/messages_root_screen.dart';
import 'package:worktodo_app/features/work/screens/work_root_screen.dart';
import 'package:worktodo_app/features/work/screens/work_task_edit_screen.dart';
import 'package:worktodo_app/features/projects/screens/invite_accept_screen.dart';
import 'package:worktodo_app/features/reports/screens/agent_chat_screen.dart';
import 'package:worktodo_app/features/axis/screens/axis_progress_screen.dart';
import 'package:worktodo_app/features/evidence/screens/evidence_detail_screen.dart';
import 'package:worktodo_app/features/reports/screens/report_detail_screen.dart';
import 'package:worktodo_app/features/reports/screens/project_report_screen.dart';
import 'package:worktodo_app/router/app_router.dart';
import '../helpers/mock_api_client.dart';
import 'package:worktodo_app/features/messages/models/messages_models.dart';
import 'package:worktodo_app/router/app_links.dart';
import 'package:worktodo_app/router/app_destination.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('五个Tab之间全部20个有向命名跳转到达真实目标页', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet('/users/me', {'id': 1, 'username': 'tester'})
      ..whenGet('/companies/mine', {'items': []});
    final auth = AuthState(apiClient: helper.buildClient());
    await auth.bootstrap();
    final app = AppRouter(authState: auth);
    await tester.pumpWidget(_mount(auth, app));
    await tester.pumpAndSettle();
    final targets = [
      ('work-root', '/work', WorkRootScreen, 0),
      ('axis-root', '/axis', AxisRootScreen, 1),
      ('knowledge-root', '/knowledge', KnowledgeScreen, 2),
      ('messages-root', '/messages', MessagesRootScreen, 3),
      ('me-root', '/me', MeRootScreen, 4),
    ];
    for (final source in targets) {
      for (final target in targets.where((item) => item != source)) {
        app.router.goNamed(source.$1);
        await tester.pumpAndSettle();
        app.router.goNamed(target.$1);
        await tester.pumpAndSettle();
        expect(app.router.routeInformationProvider.value.uri.path, target.$2,
            reason: '${source.$1} -> ${target.$1}');
        expect(find.byType(target.$3).hitTestable(), findsOneWidget);
        expect(tester.widget<AppTabBar>(find.byType(AppTabBar)).currentIndex,
            target.$4);
      }
    }
    app.router.goNamed('knowledge-chat');
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<AgentChatScreen>(find.byType(AgentChatScreen))
            .knowledgeMode,
        isTrue);
    app.router.goNamed('messages-root');
    await tester.pumpAndSettle();
    final context = tester.element(find.byType(MessagesRootScreen));
    openTaskDraft(context, '整理评审结果\n补全会议纪要', source: '消息');
    await tester.pumpAndSettle();
    expect(find.byType(WorkTaskEditScreen), findsOneWidget);
    final fields = tester.widgetList<TextFormField>(find.byType(TextFormField));
    expect(fields.any((field) => field.controller?.text == '整理评审结果'), isTrue);
    expect(
        fields.any((field) => field.controller?.text.contains('来源：消息') == true),
        isTrue);
    expect(helper.history.where((request) => request.method == 'POST'), isEmpty,
        reason: '草稿必须由用户确认后保存');
    app.router.pop();
    await tester.pumpAndSettle();
    expect(find.byType(MessagesRootScreen).hitTestable(), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    app.router.dispose();
    auth.dispose();
  });

  testWidgets('邀请冷链接、热链接、旧链接及登录后目标保留', (tester) async {
    final tokens = InMemoryTokenStorage();
    final helper = MockApiClientHelper()
      ..whenGet('/users/me', {'id': 1, 'username': 'tester'})
      ..whenGet('/companies/mine', {'items': []});
    final auth = AuthState(apiClient: helper.buildClient(tokenStorage: tokens));
    await auth.bootstrap();
    final app = AppRouter(
        authState: auth,
        initialLocation: 'worktodo://invite/cold_token_12345678901234567890');
    await tester.pumpWidget(_mount(auth, app));
    await tester.pumpAndSettle();
    expect(app.router.routeInformationProvider.value.uri.path, '/login');
    await tokens.save(access: 'valid', refresh: 'refresh');
    await auth.bootstrap();
    await tester.pumpAndSettle();
    expect(find.byType(InviteAcceptScreen), findsOneWidget);
    expect(
        app.router.routeInformationProvider.value.uri.queryParameters['token'],
        'cold_token_12345678901234567890');
    for (final link in [
      'worktodo://invite/hot_token_12345678901234567890',
      '/invite/hot_token_12345678901234567890',
      '/?invite=hot_token_12345678901234567890'
    ]) {
      app.router.go(link);
      await tester.pumpAndSettle();
      expect(app.router.routeInformationProvider.value.uri.path,
          '/projects/invite/accept');
      expect(
          app.router.routeInformationProvider.value.uri
              .queryParameters['token'],
          'hot_token_12345678901234567890');
      expect(find.byType(InviteAcceptScreen), findsOneWidget);
    }
    await tester.pumpWidget(const SizedBox.shrink());
    app.router.dispose();
    auth.dispose();
  });

  testWidgets('各类通知跨模块打开真实目标页并返回消息Tab', (tester) async {
    final helper = MockApiClientHelper()
      ..whenGet('/users/me', {'id': 1, 'username': 'tester'})
      ..whenGet('/companies/mine', {'items': []});
    final auth = AuthState(apiClient: helper.buildClient());
    await auth.bootstrap();
    final app = AppRouter(authState: auth);
    await tester.pumpWidget(_mount(auth, app));
    await tester.pumpAndSettle();
    for (final (type, payload, path, screen) in [
      (
        'evidence.adopted',
        {'package_id': 7},
        '/evidence/package/7',
        EvidenceDetailScreen
      ),
      (
        'evidence.rejected',
        {'package_id': 7},
        '/evidence/package/7',
        EvidenceDetailScreen
      ),
      (
        'progress.auto_write_alert',
        {'node_id': 9, 'project_id': 2},
        '/axis/node/9/progress',
        AxisProgressScreen
      ),
      (
        'agent.report.submitted',
        {'report_id': 8, 'project_id': 2},
        '/reports/detail',
        ReportDetailScreen
      ),
      (
        'project.report.aggregated',
        {'project_id': 2},
        '/reports/project/aggregate',
        ProjectReportScreen
      ),
      ('auth.welcome', <String, int>{}, '/work', WorkRootScreen),
    ]) {
      app.router.goNamed('messages-root');
      await tester.pumpAndSettle();
      final target = notificationDestination(CollabNotification(
          id: 1,
          bodyText: '',
          read: false,
          templateKey: type,
          payload: payload));
      target!.push(tester.element(find.byType(MessagesRootScreen)));
      await tester.pumpAndSettle();
      expect(find.byType(screen).hitTestable(), findsOneWidget, reason: type);
      expect(
          GoRouterState.of(tester.element(find.byType(screen).hitTestable()))
              .uri
              .path,
          path,
          reason: type);
      app.router.pop();
      await tester.pumpAndSettle();
      expect(find.byType(MessagesRootScreen).hitTestable(), findsOneWidget);
    }
    await tester.pumpWidget(const SizedBox.shrink());
    app.router.dispose();
    auth.dispose();
  });
  test('自定义邀请链接和旧网页链接均归一化，令牌安全编码', () {
    const valid43 = '4Z7wK9xL2mN5pQ8rT1vX3yA6bC9dE2fG5hJ8kM1nP4s';
    expect(normalizeAppLink(Uri.parse('worktodo://invite/$valid43')),
        '/projects/invite/accept?token=$valid43');
    expect(normalizeAppLink(Uri.parse('/invite/$valid43')),
        '/projects/invite/accept?token=$valid43');
    expect(normalizeAppLink(Uri.parse('/?invite=$valid43')),
        '/projects/invite/accept?token=$valid43');
    expect(normalizeAppLink(Uri.parse('/?token=$valid43')),
        '/projects/invite/accept?token=$valid43');

    // 含 /、%2F、?、#、空格、过短的令牌一律返回 null
    expect(normalizeAppLink(Uri.parse('worktodo://invite/short')), isNull);
    expect(normalizeAppLink(Uri.parse('/invite/token-123')), isNull);
    expect(normalizeAppLink(Uri.parse('/?invite=old-token')), isNull);
    expect(normalizeAppLink(Uri.parse('worktodo://invite/a%2Fb')), isNull);
    expect(normalizeAppLink(Uri.parse('worktodo://invite/token/extra')), isNull);
    expect(normalizeAppLink(Uri.parse('worktodo://invite/token?query=1')), isNull);
    expect(normalizeAppLink(Uri.parse('worktodo://invite/token#frag')), isNull);
    expect(normalizeAppLink(Uri.parse('worktodo://invite/token with space')), isNull);
    expect(
        normalizeAppLink(Uri.parse('https://evil.invalid/invite/a')), isNull);
    expect(normalizeAppLink(Uri.parse('worktodo://invite/')), isNull);
  });

  test('通知载荷映射到命名路由，缺少ID与未知类型不猜测', () {
    AppDestination? target(String type, Map<String, dynamic> payload) =>
        notificationDestination(CollabNotification.fromJson({
          'id': 1,
          'template_key': type,
          'payload': payload,
        }));
    for (final type in ['evidence.adopted', 'evidence.rejected']) {
      expect(target(type, {'package_id': 7})?.name, 'axis-evidence-detail');
      expect(
          target(type, {'package_id': 7})?.pathParameters, {'packageId': '7'});
    }
    expect(target('progress.auto_write_alert', {'node_id': 9})?.name,
        'axis-progress');
    expect(
        target('agent.report.submitted', {'report_id': 8, 'project_id': 2})
            ?.queryParameters,
        {'reportId': '8', 'projectId': '2', 'fromManager': '1'});
    expect(target('project.report.aggregated', {'project_id': 2})?.name,
        'ai-project-aggregate');
    expect(target('auth.welcome', {})?.name, 'work-root');
    expect(target('evidence.adopted', {}), isNull);
    expect(target('agent.report.submitted', {'report_id': -1}), isNull);
    expect(target('future.unknown', {'url': 'https://evil.invalid'}), isNull);
  });
}

Widget _mount(AuthState auth, AppRouter app) =>
    ChangeNotifierProvider<AuthState>.value(
      value: auth,
      child: MaterialApp.router(
          routerConfig: app.router,
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ]),
    );
