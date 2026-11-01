import 'package:flutter_test/flutter_test.dart';
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
