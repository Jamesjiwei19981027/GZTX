import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/projects/routes.dart';

import 'support/projects_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('项目与团队路由', () {
    testWidgets('静态路径不会被 /projects/:id 抢先匹配', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/projects/11', projectJson());
      harness.helper.whenGet('/projects/11/members', {
        'items': [memberJson(userId: 5, nickname: '王宁', role: 'pm')],
      });
      harness.helper.whenGet('/projects/11/my-permissions', permissionsJson());
      harness.helper.whenGet(
        '/projects/11/tasks',
        {'items': <Map<String, dynamic>>[], 'total': 0},
        query: {'page': '1', 'page_size': '200'},
      );

      final router = await harness.pumpApp(tester, location: '/projects/switch');
      expect(find.text('切换工作区与项目'), findsOneWidget);

      router.go('/projects/company/create');
      await tester.pumpAndSettle();
      expect(find.text('创建新公司'), findsOneWidget);

      router.go('/projects/create');
      await tester.pumpAndSettle();
      expect(find.text('新建项目'), findsWidgets);

      router.go('/projects/invite/accept?token=inv-token-1');
      await tester.pumpAndSettle();
      expect(find.text('接受项目协同邀请'), findsOneWidget);
      expect(find.text('inv-token-1'), findsOneWidget);
    });

    testWidgets('项目概览、设置、邀请与团队子路由可直达', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/projects/11', projectJson());
      harness.helper.whenGet('/projects/11/members', {
        'items': [memberJson(userId: 5, nickname: '王宁', role: 'pm')],
      });
      harness.helper.whenGet('/projects/11/my-permissions', permissionsJson());
      harness.helper.whenGet(
        '/projects/11/tasks',
        {'items': <Map<String, dynamic>>[], 'total': 0},
        query: {'page': '1', 'page_size': '200'},
      );
      harness.helper.whenGet('/companies/1/presence', {
        'items': <Map<String, dynamic>>[],
      });

      final router = await harness.pumpApp(tester, location: '/projects/11');
      expect(find.text('项目任务待办 · 0'), findsOneWidget);

      router.go('/projects/11/settings');
      await tester.pumpAndSettle();
      expect(find.text('项目设置'), findsOneWidget);

      router.go('/projects/11/invite');
      await tester.pumpAndSettle();
      expect(find.text('成员邀请'), findsOneWidget);

      router.go('/projects/11/team');
      await tester.pumpAndSettle();
      expect(find.text('项目团队与成员'), findsOneWidget);
    });

    testWidgets('设置页换项目 ID 后展示新项目，并对新项目执行退出', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/projects/11', projectJson());
      harness.helper.whenGet('/projects/11/my-permissions', permissionsJson());
      harness.helper.whenGet(
        '/projects/12',
        projectJson(id: 12, name: '数据中台', memberCount: 1),
      );
      harness.helper.whenGet(
        '/projects/12/my-permissions',
        permissionsJson(role: 'member', isPm: false, canEditAll: false),
      );
      harness.helper.whenGet('/projects/12/members', {
        'items': [memberJson(userId: 7, nickname: '赵敏')],
      });
      harness.helper.whenGet(
        '/projects/12/tasks',
        {'items': <Map<String, dynamic>>[], 'total': 0},
        query: {'page': '1', 'page_size': '200'},
      );
      harness.helper.whenPost('/projects/12/leave', {
        'left_at': '2026-11-01T02:00:00Z',
      });

      final router =
          await harness.pumpApp(tester, location: '/projects/11/settings');
      expect(find.text('智能客服 2.0'), findsOneWidget);
      expect(find.text('项目负责人 (PM)'), findsOneWidget);
      expect(find.text('归档此项目'), findsOneWidget);

      router.go('/projects/12/settings');
      await tester.pumpAndSettle();

      // 页面状态被 go_router 复用，必须切到 12 的详情与权限
      expect(find.text('数据中台'), findsOneWidget);
      expect(find.text('智能客服 2.0'), findsNothing);
      expect(find.text('项目成员'), findsOneWidget);
      expect(find.text('归档此项目'), findsNothing);
      expect(find.text('退出项目'), findsOneWidget);

      // 危险操作必须打在 12 上，绝不能被复用成 11
      await tester.tap(find.text('退出项目'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('确认退出'));
      await tester.pumpAndSettle();

      expect(
        harness.helper.history
            .where((item) =>
                item.method == 'POST' &&
                item.url.path == '/api/v1/projects/12/leave')
            .length,
        1,
      );
      expect(
        harness.helper.history
            .where((item) => item.url.path == '/api/v1/projects/11/leave'),
        isEmpty,
      );
      resetToastForTesting();
      await tester.pump();
    });

    testWidgets('团队页换项目 ID 后展示新项目成员', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/projects/11/members', {
        'items': [
          memberJson(userId: 5, nickname: '王宁', username: 'wangning', role: 'pm'),
          memberJson(userId: 6, nickname: '林悦', username: 'linyue'),
        ],
      });
      harness.helper.whenGet('/projects/12/members', {
        'items': [
          memberJson(userId: 7, nickname: '赵敏', username: 'zhaomin', role: 'pm'),
        ],
      });
      harness.helper.whenGet('/companies/1/presence', {
        'items': [
          {'user_id': 5, 'status': 'online'},
          {'user_id': 7, 'status': 'offline'},
        ],
      });

      final router = await harness.pumpApp(tester, location: '/projects/11/team');
      expect(find.text('王宁'), findsOneWidget);
      expect(find.text('成员列表 (2)'), findsOneWidget);
      expect(find.text('全部 (2)'), findsOneWidget);

      router.go('/projects/12/team');
      await tester.pumpAndSettle();

      expect(find.text('赵敏'), findsOneWidget);
      expect(find.text('王宁'), findsNothing);
      expect(find.text('成员列表 (1)'), findsOneWidget);
      expect(find.text('全部 (1)'), findsOneWidget);
    });

    testWidgets('成员详情页换项目与成员 ID 后展示新成员事项', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/projects/11/members', {
        'items': [
          memberJson(userId: 5, nickname: '王宁', username: 'wangning', role: 'pm'),
          memberJson(userId: 6, nickname: '林悦', username: 'linyue'),
        ],
      });
      harness.helper.whenGet(
        '/projects/11/tasks',
        {
          'items': [
            taskJson(
              id: 1,
              title: '需求方案确认',
              assignees: [assigneeJson(userId: 5, name: '王宁')],
            ),
          ],
          'total': 1,
        },
        query: {'page': '1', 'page_size': '200'},
      );
      harness.helper.whenGet('/projects/12/members', {
        'items': [memberJson(userId: 7, nickname: '赵敏', role: 'pm')],
      });
      harness.helper.whenGet(
        '/projects/12/tasks',
        {
          'items': [
            taskJson(
              id: 9,
              title: '数据迁移脚本',
              assignees: [assigneeJson(userId: 7, name: '赵敏')],
            ),
          ],
          'total': 1,
        },
        query: {'page': '1', 'page_size': '200'},
      );

      final router =
          await harness.pumpApp(tester, location: '/projects/11/team/5');
      expect(find.text('王宁'), findsOneWidget);
      expect(find.text('需求方案确认'), findsOneWidget);

      router.go('/projects/12/team/7');
      await tester.pumpAndSettle();

      expect(find.text('赵敏'), findsOneWidget);
      expect(find.text('数据迁移脚本'), findsOneWidget);
      expect(find.text('王宁'), findsNothing);
      expect(find.text('需求方案确认'), findsNothing);
      expect(find.text('当前项目负责事项 (1)'), findsOneWidget);
    });

    testWidgets('邀请页换项目 ID 后不再展示上一个项目的邀请凭证', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenPost('/projects/11/invitations', {
        'token': 'token-for-11',
        'expires_at': '2026-12-01T02:00:00Z',
      });

      final router =
          await harness.pumpApp(tester, location: '/projects/11/invite');
      await tester.enterText(find.byType(TextFormField).first, 'a@b.com');
      await tester.tap(find.text('生成邀请凭证'));
      await tester.pumpAndSettle();
      expect(find.text('邀请凭证已生成'), findsOneWidget);

      router.go('/projects/12/invite');
      await tester.pumpAndSettle();

      // 换了项目就不能再展示 11 的邀请链接
      expect(find.text('邀请凭证已生成'), findsNothing);
      expect(find.textContaining('token-for-11'), findsNothing);
      expect(find.text('生成邀请凭证'), findsOneWidget);
    });

    test('屏幕标识与网页版 REGISTERED_SCREENS 保持一致', () {
      expect(projectSwitchScreenName, 'project-switch');
      expect(projectCreateScreenName, 'project-create');
      expect(companyCreateScreenName, 'company-create');
      expect(projectOverviewScreenName, 'project-overview');
      expect(projectSettingsScreenName, 'project-settings');
      expect(projectInviteScreenName, 'project-invite');
      expect(inviteAcceptScreenName, 'invite-accept');
      expect(teamScreenName, 'me-team');
      expect(memberDetailScreenName, 'me-member-detail');
    });
  });
}
