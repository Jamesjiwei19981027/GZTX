import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/projects/screens/member_detail_screen.dart';

import 'support/projects_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('成员职责名片', () {
    testWidgets('展示成员信息与仅属于该成员的项目事项', (tester) async {
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
              dueDate: '2026-11-05T08:00:00Z',
            ),
            taskJson(
              id: 2,
              title: '交互原型设计',
              status: 1,
              assignees: [assigneeJson(userId: 6, name: '林悦')],
            ),
          ],
          'total': 2,
        },
        query: {'page': '1', 'page_size': '200'},
      );

      await harness.pumpScreen(
        tester,
        const MemberDetailScreen(projectId: 11, userId: 5),
      );

      expect(find.text('成员职责名片'), findsOneWidget);
      expect(find.text('王宁'), findsOneWidget);
      expect(find.text('@wangning'), findsOneWidget);
      expect(find.text('项目负责人'), findsOneWidget);
      expect(find.text('当前项目负责事项 (1)'), findsOneWidget);
      expect(find.text('需求方案确认'), findsOneWidget);
      // 别人的事项不应出现在该成员名片里
      expect(find.text('交互原型设计'), findsNothing);
      // 截止日期按本地时区显示，这里只断言展示格式，避免依赖机器时区
      expect(find.textContaining('截止: 20'), findsOneWidget);
    });

    testWidgets('成员没有负责事项时给出空提示', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/projects/11/members', {
        'items': [memberJson(userId: 6, nickname: '林悦')],
      });
      harness.helper.whenGet(
        '/projects/11/tasks',
        {'items': <Map<String, dynamic>>[], 'total': 0},
        query: {'page': '1', 'page_size': '200'},
      );

      await harness.pumpScreen(
        tester,
        const MemberDetailScreen(projectId: 11, userId: 6),
      );

      expect(find.text('当前项目尚未分派任务'), findsOneWidget);
      expect(find.text('当前项目负责事项 (0)'), findsOneWidget);
    });

    testWidgets('成员已退出项目时提示不存在', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/projects/11/members', {
        'items': [memberJson(userId: 6, nickname: '林悦')],
      });

      await harness.pumpScreen(
        tester,
        const MemberDetailScreen(projectId: 11, userId: 999),
      );

      expect(find.text('成员不存在'), findsOneWidget);
      expect(find.text('返回成员列表'), findsOneWidget);
    });

    testWidgets('已退出成员的职责名片标注已退出', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/projects/11/members', {
        'items': [
          memberJson(
            userId: 6,
            nickname: '林悦',
            leftAt: '2026-10-20T02:00:00Z',
          ),
        ],
      });
      harness.helper.whenGet(
        '/projects/11/tasks',
        {'items': <Map<String, dynamic>>[], 'total': 0},
        query: {'page': '1', 'page_size': '200'},
      );

      await harness.pumpScreen(
        tester,
        const MemberDetailScreen(projectId: 11, userId: 6),
      );

      expect(find.text('已退出项目'), findsOneWidget);
      expect(find.textContaining('该成员已退出本项目'), findsOneWidget);
      expect(find.text('项目成员'), findsNothing);
      expect(find.text('项目负责人'), findsNothing);
    });

    testWidgets('事项加载失败时可重试', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet('/projects/11/members', {
        'items': [memberJson(userId: 6, nickname: '林悦')],
      });
      harness.helper.whenGet(
        '/projects/11/tasks',
        {'code': 50000, 'message': '事项服务异常', 'data': null},
        statusCode: 500,
        query: {'page': '1', 'page_size': '200'},
      );

      await harness.pumpScreen(
        tester,
        const MemberDetailScreen(projectId: 11, userId: 6),
      );

      expect(find.text('事项加载失败'), findsOneWidget);
      expect(find.textContaining('事项服务异常'), findsOneWidget);
    });
  });
}
