import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
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
