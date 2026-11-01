import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:worktodo_app/core/api/api_client.dart';
import 'package:worktodo_app/core/api/token_storage.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/projects/screens/invite_accept_screen.dart';

import 'support/projects_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('接受项目邀请', () {
    testWidgets('从深链接带入令牌后接受成功，切换到受邀项目并进入成员列表', (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      harness.helper.whenPost(
        '/projects/invitations/inv-token-1/accept',
        {'project_id': 11, 'role': 'member'},
      );
      harness.helper.whenGet('/projects/11', projectJson());
      harness.helper.whenGet('/projects/11/members', {
        'items': [
          memberJson(userId: 5, nickname: '王宁', role: 'pm'),
          memberJson(userId: 11, nickname: '张三'),
        ],
      });
      harness.helper.whenGet('/companies/1/presence', {
        'items': [
          {'user_id': 5, 'status': 'online'},
        ],
      });

      final router = await harness.pumpApp(
        tester,
        location: '/projects/invite/accept?token=inv-token-1',
      );

      expect(find.text('接受项目协同邀请'), findsOneWidget);
      expect(find.text('加入项目团队'), findsOneWidget);

      await tester.tap(find.text('接受并进入项目'));
      await tester.pumpAndSettle();

      expect(
        harness.helper.history
            .where((item) => item.method == 'POST' &&
                item.url.path == '/api/v1/projects/invitations/inv-token-1/accept')
            .length,
        1,
      );
      expect(auth.currentProject?.id, 11);
      expect(router.currentLocation, '/projects/11/team');
      expect(find.text('项目团队与成员'), findsOneWidget);
      expect(find.text('已加入「智能客服 2.0」'), findsOneWidget);
      resetToastForTesting();
      await tester.pump();
    });

    testWidgets('接受后不再重走启动流程：/users/me 临时 500 不会把会话打成离线', (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      harness.helper.whenGet('/users/me', '服务暂不可用', statusCode: 500);
      harness.helper.whenPost(
        '/projects/invitations/inv-token-1/accept',
        {'project_id': 11, 'role': 'member'},
      );
      harness.helper.whenGet('/projects/11', projectJson());
      harness.helper.whenGet('/projects/11/members', {
        'items': [memberJson(userId: 11, nickname: '张三')],
      });
      harness.helper.whenGet('/companies/1/presence', {'items': []});

      final router = await harness.pumpApp(
        tester,
        location: '/projects/invite/accept?token=inv-token-1',
      );
      await tester.tap(find.text('接受并进入项目'));
      await tester.pumpAndSettle();

      expect(auth.status, AuthStatus.authenticated);
      expect(auth.currentProject?.id, 11);
      expect(router.currentLocation, '/projects/11/team');
      resetToastForTesting();
      await tester.pump();
    });

    testWidgets('刷新公司列表 500：留在本页，重试后选中受邀项目且接受接口只调一次', (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      harness.helper.whenGet('/companies/mine', '服务暂不可用', statusCode: 500);
      harness.helper.whenPost(
        '/projects/invitations/inv-token-1/accept',
        {'project_id': 11, 'role': 'member'},
      );
      harness.helper.whenGet('/projects/11', projectJson());
      harness.helper.whenGet('/projects/11/members', {
        'items': [memberJson(userId: 11, nickname: '张三')],
      });
      harness.helper.whenGet('/companies/1/presence', {'items': []});

      final router = await harness.pumpApp(
        tester,
        location: '/projects/invite/accept?token=inv-token-1',
      );
      await tester.tap(find.text('接受并进入项目'));
      await tester.pumpAndSettle();

      // 同步失败时不再直接进团队页：留在本页，给出重试与「先进入项目」两个入口
      expect(auth.status, AuthStatus.authenticated);
      expect(router.currentLocation, '/projects/invite/accept');
      expect(find.text('重试同步工作区'), findsOneWidget);
      expect(find.text('先进入项目'), findsOneWidget);
      expect(find.text('接受并进入项目'), findsNothing);
      expect(find.textContaining('已加入项目，但工作区同步失败'), findsOneWidget);

      // 服务恢复后点重试：只重跑「刷新公司 → 切公司 → 刷新项目 → 选中项目」
      harness.helper.whenGet('/companies/mine', {
        'items': [companyJson()],
        'total': 1,
      });
      await tester.tap(find.text('重试同步工作区'));
      await tester.pumpAndSettle();

      expect(auth.status, AuthStatus.authenticated);
      expect(auth.currentCompany?.id, 1);
      expect(auth.currentProject?.id, 11);
      expect(router.currentLocation, '/projects/11/team');
      expect(
        harness.helper.history
            .where((item) =>
                item.method == 'POST' &&
                item.url.path ==
                    '/api/v1/projects/invitations/inv-token-1/accept')
            .length,
        1,
      );
      resetToastForTesting();
      await tester.pump();
    });

    testWidgets('重试同步途中换了邀请令牌：旧重试的结果被丢弃，不跳走也不盖住新邀请', (tester) async {
      final harness = ProjectsTestHarness();
      var companiesCalls = 0;
      final retryGate = Completer<void>();
      Map<String, dynamic>? ok(Object? data) =>
          {'code': 200, 'message': 'success', 'data': data};
      final client = MockClient((request) async {
        final path = request.url.path.replaceFirst('/api/v1', '');
        Object? data;
        switch ('${request.method} $path') {
          case 'GET /users/me':
            data = {'id': 11, 'username': 'zhangsan', 'nickname': '张三'};
          case 'GET /companies/mine':
            companiesCalls++;
            // 第 1 次是启动；第 2 次是接受后同步（失败）；第 3 次是重试（挂起）
            if (companiesCalls == 2) {
              return http.Response('服务暂不可用', 500);
            }
            if (companiesCalls == 3) await retryGate.future;
            data = {'items': [companyJson()], 'total': 1};
          case 'GET /projects':
            data = {'items': [projectJson()], 'total': 1};
          case 'POST /projects/invitations/token-a/accept':
            data = {'project_id': 11, 'role': 'member'};
          case 'GET /projects/11':
            data = projectJson();
          default:
            data = {'items': <Object>[], 'total': 0};
        }
        return http.Response(
          jsonEncode(ok(data)),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        );
      });
      SharedPreferences.setMockInitialValues({});
      harness.authState = AuthState(
        apiClient: ApiClient(
          tokenStorage: InMemoryTokenStorage(access: 'mock-access-token'),
          httpClient: client,
          baseUrl: 'http://localhost:8010/api/v1',
        ),
      );
      await harness.authState.bootstrap();

      final router = await harness.pumpApp(
        tester,
        location: '/projects/invite/accept?token=token-a',
      );
      await tester.tap(find.text('接受并进入项目'));
      await tester.pumpAndSettle();
      expect(find.text('重试同步工作区'), findsOneWidget);

      // 点重试后请求挂起，此时打开另一条邀请链接
      await tester.tap(find.text('重试同步工作区'));
      await tester.pump();
      router.go('/projects/invite/accept?token=token-b');
      await tester.pump();
      await tester.pump();
      expect(find.text('接受并进入项目'), findsOneWidget);

      // 旧重试此时才返回成功：不得把新邀请页跳到 A 的团队页
      retryGate.complete();
      await tester.pumpAndSettle();

      expect(router.currentLocation, '/projects/invite/accept');
      expect(find.text('接受并进入项目'), findsOneWidget);
      expect(find.text('重试同步工作区'), findsNothing);
      resetToastForTesting();
      await tester.pump();
    });

    testWidgets('同步失败时可「先进入项目」直达受邀项目团队页', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/companies/mine', '服务暂不可用', statusCode: 500);
      harness.helper.whenPost(
        '/projects/invitations/inv-token-2/accept',
        {'project_id': 11, 'role': 'member'},
      );
      harness.helper.whenGet('/projects/11', projectJson());
      harness.helper.whenGet('/projects/11/members', {
        'items': [memberJson(userId: 11, nickname: '张三')],
      });
      harness.helper.whenGet('/companies/1/presence', {'items': []});

      final router = await harness.pumpApp(
        tester,
        location: '/projects/invite/accept?token=inv-token-2',
      );
      await tester.tap(find.text('接受并进入项目'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('先进入项目'));
      await tester.pumpAndSettle();

      expect(router.currentLocation, '/projects/11/team');
      expect(find.text('项目团队与成员'), findsOneWidget);
      resetToastForTesting();
      await tester.pump();
    });

    testWidgets('项目详情拉取失败时按项目反查公司，仍选中受邀项目', (tester) async {
      final harness = ProjectsTestHarness(company: false);
      final auth = await harness.bootstrap();
      expect(auth.currentCompany, isNull);

      harness.helper.whenPost(
        '/projects/invitations/detail-fail-token/accept',
        {'project_id': 11, 'role': 'member'},
      );
      // 接受邀请后后端才建立公司成员关系，此时 /companies/mine 才有数据
      harness.helper.whenGet('/companies/mine', {
        'items': [companyJson()],
        'total': 1,
      });
      harness.helper.whenGet(
        '/projects',
        {
          'items': [projectJson()],
          'total': 1,
        },
        query: {'company_id': '1', 'as_admin': 'true'},
      );
      // 受邀项目详情临时失败：拿不到受邀公司 ID
      harness.helper.whenGet('/projects/11', '服务暂不可用', statusCode: 500);
      harness.helper.whenGet('/projects/11/members', {
        'items': [memberJson(userId: 11, nickname: '张三')],
      });
      harness.helper.whenGet('/companies/1/presence', {'items': []});

      final router = await harness.pumpApp(
        tester,
        location: '/projects/invite/accept?token=detail-fail-token',
      );
      await tester.tap(find.text('接受并进入项目'));
      await tester.pumpAndSettle();

      expect(auth.currentCompany?.id, 1);
      expect(auth.currentProject?.id, 11);
      expect(router.currentLocation, '/projects/11/team');

      // 项目切换页不再显示“尚未加入任何公司”
      router.go('/projects/switch');
      await tester.pumpAndSettle();
      expect(find.text('尚未加入任何公司'), findsNothing);
      expect(find.text('智能客服 2.0'), findsOneWidget);
      resetToastForTesting();
      await tester.pump();
    });

    testWidgets('项目详情失败且受邀项目在另一公司时，逐个公司核对后选中', (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      expect(auth.currentCompany?.id, 1);

      harness.helper.whenPost(
        '/projects/invitations/detail-fail-2/accept',
        {'project_id': 21, 'role': 'member'},
      );
      harness.helper.whenGet('/companies/mine', {
        'items': [companyJson(), companyJson(id: 2, name: '未来科技')],
        'total': 2,
      });
      // 当前公司（1）里没有受邀项目
      harness.helper.whenGet(
        '/projects',
        {
          'items': [projectJson(id: 12, name: '数据中台')],
          'total': 1,
        },
        query: {'company_id': '1', 'as_admin': 'true'},
      );
      harness.helper.whenGet(
        '/projects',
        {
          'items': [projectJson(id: 21, name: '数据迁移', companyId: 2)],
          'total': 1,
        },
        query: {'company_id': '2', 'as_admin': 'true'},
      );
      harness.helper.whenGet('/projects/21', '服务暂不可用', statusCode: 500);
      harness.helper.whenGet('/projects/21/members', {
        'items': [memberJson(userId: 11, nickname: '张三')],
      });
      harness.helper.whenGet('/companies/2/presence', {'items': []});

      final router = await harness.pumpApp(
        tester,
        location: '/projects/invite/accept?token=detail-fail-2',
      );
      await tester.tap(find.text('接受并进入项目'));
      await tester.pumpAndSettle();

      expect(auth.currentCompany?.id, 2);
      expect(auth.currentProject?.id, 21);
      expect(router.currentLocation, '/projects/21/team');
      resetToastForTesting();
      await tester.pump();
    });

    testWidgets('首次加入公司时先切到受邀公司再选中项目', (tester) async {
      final harness = ProjectsTestHarness(company: false);
      final auth = await harness.bootstrap();
      expect(auth.currentCompany, isNull);

      harness.helper.whenPost(
        '/projects/invitations/first-token/accept',
        {'project_id': 11, 'role': 'member'},
      );
      // 接受邀请后后端才建立公司成员关系，此时 /companies/mine 才有数据
      harness.helper.whenGet('/companies/mine', {
        'items': [companyJson()],
        'total': 1,
      });
      harness.helper.whenGet(
        '/projects',
        {
          'items': [projectJson()],
          'total': 1,
        },
        query: {'company_id': '1', 'as_admin': 'true'},
      );
      harness.helper.whenGet('/projects/11', projectJson());
      harness.helper.whenGet('/projects/11/members', {
        'items': [memberJson(userId: 11, nickname: '张三')],
      });
      harness.helper.whenGet('/companies/1/presence', {
        'items': <Map<String, dynamic>>[],
      });

      final router = await harness.pumpApp(
        tester,
        location: '/projects/invite/accept?token=first-token',
      );

      await tester.tap(find.text('接受并进入项目'));
      await tester.pumpAndSettle();

      // 重新拉取了公司列表，并把受邀项目所属公司设为当前公司
      expect(
        harness.helper.history
            .where((item) =>
                item.method == 'GET' &&
                item.url.path == '/api/v1/companies/mine')
            .length,
        2,
      );
      expect(auth.currentCompany?.id, 1);
      expect(auth.currentProject?.id, 11);
      expect(router.currentLocation, '/projects/11/team');
      expect(find.text('项目团队与成员'), findsOneWidget);
      expect(find.text('已加入「智能客服 2.0」'), findsOneWidget);
      resetToastForTesting();
      await tester.pump();
    });

    testWidgets('已在另一公司时切换到受邀项目所属公司', (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      expect(auth.currentCompany?.id, 1);

      harness.helper.whenPost(
        '/projects/invitations/second-token/accept',
        {'project_id': 21, 'role': 'member'},
      );
      harness.helper.whenGet('/companies/mine', {
        'items': [companyJson(), companyJson(id: 2, name: '未来科技')],
        'total': 2,
      });
      harness.helper.whenGet(
        '/projects',
        {
          'items': [projectJson(id: 21, name: '数据中台', companyId: 2)],
          'total': 1,
        },
        query: {'company_id': '2', 'as_admin': 'true'},
      );
      harness.helper.whenGet(
        '/projects/21',
        projectJson(id: 21, name: '数据中台', companyId: 2),
      );
      harness.helper.whenGet('/projects/21/members', {
        'items': [memberJson(userId: 11, nickname: '张三')],
      });
      harness.helper.whenGet('/companies/2/presence', {
        'items': <Map<String, dynamic>>[],
      });

      final router = await harness.pumpApp(
        tester,
        location: '/projects/invite/accept?token=second-token',
      );

      await tester.tap(find.text('接受并进入项目'));
      await tester.pumpAndSettle();

      expect(
        harness.helper.history
            .where((item) =>
                item.method == 'GET' &&
                item.url.path == '/api/v1/projects' &&
                item.url.queryParameters['company_id'] == '2')
            .isNotEmpty,
        isTrue,
      );
      expect(auth.currentCompany?.id, 2);
      expect(auth.currentProject?.id, 21);
      expect(router.currentLocation, '/projects/21/team');
      expect(find.text('已加入「数据中台」'), findsOneWidget);
      resetToastForTesting();
      await tester.pump();
    });

    testWidgets('令牌为空时提示必填', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      await harness.pumpScreen(tester, const InviteAcceptScreen());

      await tester.tap(find.text('接受并进入项目'));
      await tester.pumpAndSettle();

      expect(find.text('请输入或粘贴邀请令牌'), findsOneWidget);
    });

    testWidgets('邀请无效时提示链接已失效或已被使用', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenPost(
        '/projects/invitations/bad-token/accept',
        {'code': 42200, 'message': '邀请无效', 'data': null},
        statusCode: 422,
      );

      await harness.pumpScreen(
        tester,
        const InviteAcceptScreen(initialToken: 'bad-token'),
      );
      await tester.tap(find.text('接受并进入项目'));
      await tester.pumpAndSettle();

      expect(find.text('该邀请链接已失效或已被使用'), findsOneWidget);
    });

    testWidgets('邀请过期时给出重新生成提示', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenPost(
        '/projects/invitations/old-token/accept',
        {'code': 42200, 'message': '邀请已过期', 'data': null},
        statusCode: 422,
      );

      await harness.pumpScreen(
        tester,
        const InviteAcceptScreen(initialToken: 'old-token'),
      );
      await tester.tap(find.text('接受并进入项目'));
      await tester.pumpAndSettle();

      expect(
        find.text('该邀请链接已过期，请让项目负责人重新生成'),
        findsOneWidget,
      );
    });

    testWidgets('邀请与当前账号不匹配时提示换账号', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenPost(
        '/projects/invitations/other-token/accept',
        {'code': 40300, 'message': '邀请不匹配当前用户', 'data': null},
        statusCode: 403,
      );

      await harness.pumpScreen(
        tester,
        const InviteAcceptScreen(initialToken: 'other-token'),
      );
      await tester.tap(find.text('接受并进入项目'));
      await tester.pumpAndSettle();

      expect(
        find.text('该邀请与当前登录账号不匹配，请使用受邀邮箱对应的账号登录'),
        findsOneWidget,
      );
    });

    testWidgets('需要手机验证时给出验证入口', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenPost(
        '/projects/invitations/phone-token/accept',
        {
          'detail': {
            'code': 40320,
            'message': '协作功能需要完成邮箱与手机验证',
          },
        },
        statusCode: 403,
      );

      await harness.pumpScreen(
        tester,
        const InviteAcceptScreen(initialToken: 'phone-token'),
      );
      await tester.tap(find.text('接受并进入项目'));
      await tester.pumpAndSettle();

      expect(find.text('当前项目要求完成手机号实名验证后方可加入'), findsOneWidget);
      expect(find.text('前往验证手机号后继续加入'), findsOneWidget);
    });
  });
}
