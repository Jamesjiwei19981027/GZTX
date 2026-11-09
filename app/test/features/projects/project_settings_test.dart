import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/projects/screens/project_settings_screen.dart';

import 'support/projects_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('项目设置', () {
    testWidgets('项目负责人看到角色、归档与转让提示', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/projects/11', projectJson());
      harness.helper.whenGet('/projects/11/my-permissions', permissionsJson());

      await harness.pumpScreen(
          tester, const ProjectSettingsScreen(projectId: 11));

      expect(find.text('项目设置'), findsOneWidget);
      expect(find.text('项目负责人 (PM)'), findsOneWidget);
      expect(find.text('独立沙箱安全隔离'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('归档此项目'), 200);
      expect(find.text('危险操作区'), findsOneWidget);
      expect(find.text('归档此项目'), findsOneWidget);
      await tester.scrollUntilVisible(find.textContaining('需先把 PM 转让'), 100);
      expect(find.textContaining('需先把 PM 转让'), findsOneWidget);
      expect(find.text('退出项目'), findsNothing);
    });

    testWidgets('普通成员看不到归档入口但可以退出项目', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/projects/11', projectJson());
      harness.helper.whenGet(
        '/projects/11/my-permissions',
        permissionsJson(role: 'member', isPm: false, canEditAll: false),
      );

      await harness.pumpScreen(
          tester, const ProjectSettingsScreen(projectId: 11));

      expect(find.text('项目成员'), findsOneWidget);
      expect(
        find.text('你没有归档权限。归档需要项目负责人 (PM)、企业管理员或具备管理授权的受托管理人。'),
        findsOneWidget,
      );
      expect(find.text('归档此项目'), findsNothing);
      expect(find.text('退出项目'), findsOneWidget);
    });

    testWidgets('委托只拿到 tree.edit_subtree 时看不到归档入口', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/projects/11', projectJson());
      harness.helper.whenGet(
        '/projects/11/my-permissions',
        permissionsJson(
          role: 'member',
          isPm: false,
          canEditAll: true,
          canMove: false,
          canDelete: false,
        ),
      );

      await harness.pumpScreen(
          tester, const ProjectSettingsScreen(projectId: 11));

      // can_edit_all 对应 tree.edit_subtree，归档需要 tree.edit_any
      expect(find.text('归档此项目'), findsNothing);
      expect(find.text('退出项目'), findsOneWidget);
    });

    testWidgets('委托持有 tree.edit_any 时可见归档入口', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/projects/11', projectJson());
      harness.helper.whenGet(
        '/projects/11/my-permissions',
        permissionsJson(
          role: 'member',
          isPm: false,
          canEditAll: false,
          canMove: true,
          canDelete: true,
        ),
      );

      await harness.pumpScreen(
          tester, const ProjectSettingsScreen(projectId: 11));

      expect(find.text('归档此项目'), findsOneWidget);
      expect(find.text('危险操作区'), findsOneWidget);
    });

    testWidgets('归档需二次确认，确认后调用归档接口并提示', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/projects/11', projectJson());
      harness.helper.whenGet('/projects/11/my-permissions', permissionsJson());
      harness.helper.whenPost('/projects/11/archive', {
        'status': 'archived',
        'archived_at': '2026-11-01T02:00:00Z',
      });

      await harness.pumpScreen(
          tester, const ProjectSettingsScreen(projectId: 11));
      await tester.scrollUntilVisible(find.text('归档此项目'), 200);
      await tester.tap(find.text('归档此项目'));
      await tester.pumpAndSettle();

      expect(find.text('确认归档项目？'), findsOneWidget);
      expect(
        find.text('归档后项目所有任务、人轴与资料将转为只读历史存档，普通成员不可再提交新汇报'),
        findsOneWidget,
      );

      await tester.tap(find.text('确认归档'));
      await tester.pumpAndSettle();

      expect(
        harness.helper.history
            .where((item) =>
                item.method == 'POST' &&
                item.url.path == '/api/v1/projects/11/archive')
            .length,
        1,
      );
      await tester.scrollUntilVisible(find.text('项目已归档，已转为只读历史存档'), -200);
      expect(find.text('项目已归档，已转为只读历史存档'), findsOneWidget);
    });

    testWidgets('取消二次确认时不调用归档接口', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/projects/11', projectJson());
      harness.helper.whenGet('/projects/11/my-permissions', permissionsJson());

      await harness.pumpScreen(
          tester, const ProjectSettingsScreen(projectId: 11));
      await tester.scrollUntilVisible(find.text('归档此项目'), 200);
      await tester.tap(find.text('归档此项目'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('取消'));
      await tester.pumpAndSettle();

      expect(
        harness.helper.history.where((item) => item.method == 'POST'),
        isEmpty,
      );
    });

    testWidgets('退出项目需二次确认，确认后调用退出接口并提示', (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      harness.helper.whenGet('/projects/11', projectJson());
      harness.helper.whenGet(
        '/projects/11/my-permissions',
        permissionsJson(role: 'member', isPm: false, canEditAll: false),
      );
      harness.helper.whenPost('/projects/11/leave', {
        'left_at': '2026-11-01T02:00:00Z',
      });

      await harness.pumpScreen(
          tester, const ProjectSettingsScreen(projectId: 11));
      await tester.tap(find.text('退出项目'));
      await tester.pumpAndSettle();

      expect(find.text('确认退出项目？'), findsOneWidget);
      await tester.tap(find.text('确认退出'));
      await tester.pumpAndSettle();

      expect(
        harness.helper.history
            .where((item) =>
                item.method == 'POST' &&
                item.url.path == '/api/v1/projects/11/leave')
            .length,
        1,
      );
      expect(find.text('已退出该项目'), findsOneWidget);
      // 退出后重新拉取项目列表
      expect(
        harness.helper.history
            .where((item) =>
                item.method == 'GET' && item.url.path == '/api/v1/projects')
            .length,
        greaterThan(1),
      );
      expect(auth.projects, isNotEmpty);
      resetToastForTesting();
      await tester.pump();
    });

    testWidgets('无权限时展示无权限状态且不显示管理入口', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/projects/11', projectJson());
      harness.helper.whenGet(
        '/projects/11/my-permissions',
        {'code': 40301, 'message': '非项目成员', 'data': null},
        statusCode: 403,
      );

      await harness.pumpScreen(
          tester, const ProjectSettingsScreen(projectId: 11));

      expect(find.text('暂无访问权限'), findsOneWidget);
      expect(find.text('归档此项目'), findsNothing);
    });

    testWidgets('归档失败时展示服务端中文提示', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/projects/11', projectJson());
      harness.helper.whenGet('/projects/11/my-permissions', permissionsJson());
      harness.helper.whenPost(
        '/projects/11/archive',
        {'code': 40305, 'message': '需要 PM 或超管', 'data': null},
        statusCode: 403,
      );

      await harness.pumpScreen(
          tester, const ProjectSettingsScreen(projectId: 11));
      await tester.scrollUntilVisible(find.text('归档此项目'), 200);
      await tester.tap(find.text('归档此项目'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('确认归档'));
      await tester.pumpAndSettle();

      await tester.scrollUntilVisible(find.text('需要 PM 或超管'), -200);
      expect(find.text('需要 PM 或超管'), findsOneWidget);
    });
  });
}
