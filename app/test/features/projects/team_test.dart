import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/projects/screens/team_screen.dart';

import 'support/projects_test_harness.dart';

void registerTeamMocks(ProjectsTestHarness harness) {
  harness.helper.whenGet('/projects/11/members', {
    'items': [
      memberJson(userId: 5, nickname: '王宁', username: 'wangning', role: 'pm'),
      memberJson(userId: 6, nickname: '林悦', username: 'linyue'),
    ],
  });
  harness.helper.whenGet('/companies/1/presence', {
    'items': [
      {'user_id': 5, 'status': 'online'},
      {'user_id': 6, 'status': 'offline'},
    ],
  });
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('项目团队', () {
    testWidgets('展示成员、用户名与角色标签', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      registerTeamMocks(harness);

      await harness.pumpScreen(tester, const TeamScreen(projectId: 11));

      expect(find.text('项目团队与成员'), findsOneWidget);
      expect(find.text('成员列表 (2)'), findsOneWidget);
      expect(find.text('王宁'), findsOneWidget);
      expect(find.text('@wangning'), findsOneWidget);
      expect(find.text('PM 负责人'), findsOneWidget);
      expect(find.text('林悦'), findsOneWidget);
      expect(find.text('成员'), findsOneWidget);
      expect(find.text('全部 (2)'), findsOneWidget);
      expect(find.text('管理员 / PM (1)'), findsOneWidget);
      expect(find.text('业务成员 (1)'), findsOneWidget);
    });

    testWidgets('按关键字搜索成员并可清空', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      registerTeamMocks(harness);

      await harness.pumpScreen(tester, const TeamScreen(projectId: 11));
      await tester.enterText(find.byType(TextFormField).first, '林');
      await tester.pumpAndSettle();

      expect(find.text('林悦'), findsOneWidget);
      expect(find.text('王宁'), findsNothing);
      expect(find.text('成员列表 (1)'), findsOneWidget);

      await tester.enterText(find.byType(TextFormField).first, '不存在的人');
      await tester.pumpAndSettle();

      expect(find.text('无匹配成员'), findsOneWidget);
      expect(find.text('未找到符合搜索条件的成员'), findsOneWidget);
    });

    testWidgets('按角色筛选只保留管理员', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      registerTeamMocks(harness);

      await harness.pumpScreen(tester, const TeamScreen(projectId: 11));
      await tester.tap(find.text('管理员 / PM (1)'));
      await tester.pumpAndSettle();

      expect(find.text('王宁'), findsOneWidget);
      expect(find.text('林悦'), findsNothing);

      await tester.tap(find.text('业务成员 (1)'));
      await tester.pumpAndSettle();

      expect(find.text('林悦'), findsOneWidget);
      expect(find.text('王宁'), findsNothing);
    });

    testWidgets('在线状态接口失败时给出可见提示且成员列表不受影响', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/projects/11/members', {
        'items': [memberJson(userId: 5, nickname: '王宁', role: 'pm')],
      });
      harness.helper.whenGet(
        '/companies/1/presence',
        {'code': 50000, 'message': '在线状态服务异常', 'data': null},
        statusCode: 500,
      );

      await harness.pumpScreen(tester, const TeamScreen(projectId: 11));

      expect(find.textContaining('在线状态暂不可用'), findsOneWidget);
      expect(find.text('王宁'), findsOneWidget);
    });

    testWidgets('无权限时展示无权限状态', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet(
        '/projects/11/members',
        {'code': 40301, 'message': '非项目成员', 'data': null},
        statusCode: 403,
      );

      await harness.pumpScreen(tester, const TeamScreen(projectId: 11));

      expect(find.text('暂无访问权限'), findsOneWidget);
    });

    testWidgets('点击成员进入成员职责名片', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      registerTeamMocks(harness);
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

      final router = await harness.pumpApp(tester, location: '/projects/11/team');
      expect(find.text('王宁'), findsOneWidget);

      await tester.tap(find.text('王宁'));
      await tester.pumpAndSettle();

      expect(find.text('成员职责名片'), findsOneWidget);
      expect(router.currentLocation, '/projects/11/team/5');
      expect(find.text('项目负责人'), findsOneWidget);
    });

    testWidgets('项目没有任何成员时给出空状态引导', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/projects/11/members', {
        'items': <Map<String, dynamic>>[],
      });
      harness.helper.whenGet('/companies/1/presence', {
        'items': <Map<String, dynamic>>[],
      });

      await harness.pumpScreen(tester, const TeamScreen(projectId: 11));

      expect(find.text('项目暂无成员'), findsOneWidget);
      expect(find.text('去项目概览'), findsOneWidget);
    });
  });
}
