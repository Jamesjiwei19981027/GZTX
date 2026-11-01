import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/core/auth/auth_state.dart';
import 'package:worktodo_app/features/projects/data/projects_repository.dart';
import 'package:worktodo_app/features/projects/screens/project_overview_screen.dart';

import 'support/projects_test_harness.dart';

/// 注册项目概览所需的全部接口
void registerOverviewMocks(
  ProjectsTestHarness harness, {
  int projectId = 11,
  Map<String, dynamic>? permissions,
  Map<String, dynamic>? project,
  List<Map<String, dynamic>>? tasks,
}) {
  final id = projectId;
  harness.helper.whenGet(
    '/projects/$id',
    project ??
        (id == 11
            ? projectJson()
            : projectJson(id: id, name: '数据中台', memberCount: 1)),
  );
  harness.helper.whenGet('/projects/$id/members', {
    'items': [
      memberJson(userId: 5, nickname: '王宁', role: 'pm'),
      memberJson(userId: 6, nickname: '林悦'),
    ],
  });
  harness.helper.whenGet(
    '/projects/$id/my-permissions',
    permissions ?? permissionsJson(),
  );
  harness.helper.whenGet(
    '/projects/$id/tasks',
    {
      'items': tasks ??
          (id == 11
              ? [
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
                  taskJson(
                    id: 3,
                    title: '核心功能开发',
                    status: 2,
                    assignees: [assigneeJson(userId: 5, name: '王宁')],
                  ),
                ]
              : [
                  taskJson(
                    id: 9,
                    title: '数据迁移脚本',
                    assignees: [assigneeJson(userId: 5, name: '王宁')],
                  ),
                ]),
      'total': tasks?.length ?? (id == 11 ? 3 : 1),
      'page': 1,
      'page_size': 200,
    },
    query: {'page': '1', 'page_size': '200'},
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('项目概览', () {
    testWidgets('加载中展示载入提示', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      final slowAuth = AuthState(
        apiClient: buildSlowClient(
          routes: {
            '/projects/11': projectJson(),
            '/projects/11/members': {
              'items': [memberJson(userId: 5, nickname: '王宁', role: 'pm')],
            },
            '/projects/11/my-permissions': permissionsJson(),
            '/projects/11/tasks': {'items': const [], 'total': 0},
          },
        ),
      );

      await harness.pumpScreen(
        tester,
        const ProjectOverviewScreen(projectId: 11),
        settle: false,
        authStateOverride: slowAuth,
      );

      expect(find.text('正在载入项目详情…'), findsOneWidget);

      // 依次放行：项目详情+成员 → 权限快照 → 任务列表
      await tester.pump(const Duration(seconds: 1));
      await tester.pump(const Duration(seconds: 1));
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpAndSettle();

      expect(find.text('正在载入项目详情…'), findsNothing);
      expect(find.text('项目任务待办 · 0'), findsOneWidget);
    });

    testWidgets('管理员看到项目信息、任务、看板、协同导航与邀请入口', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      registerOverviewMocks(harness);

      await harness.pumpScreen(tester, const ProjectOverviewScreen(projectId: 11));

      expect(find.text('项目终责负责人'), findsOneWidget);
      expect(find.text('王宁'), findsWidgets);
      expect(find.text('成员 2 人'), findsOneWidget);
      expect(find.text('邀请新成员加入'), findsOneWidget);

      expect(find.text('项目任务待办 · 3'), findsOneWidget);
      // 任务标题在「任务待办」列表与「任务看板」列中各出现一次
      expect(find.text('需求方案确认'), findsWidgets);
      expect(find.text('交互原型设计'), findsWidgets);

      expect(find.text('任务看板'), findsWidgets);
      expect(find.text('待办 · 1'), findsOneWidget);
      expect(find.text('进行中 · 1'), findsOneWidget);
      expect(find.text('已完成 · 1'), findsOneWidget);

      // 协同导航在首屏之下，滚动后再断言
      await tester.drag(find.byType(ListView), const Offset(0, -800));
      await tester.pumpAndSettle();

      expect(find.text('协同导航'), findsOneWidget);
      expect(find.text('任务待办'), findsOneWidget);
      expect(find.text('人轴责任链'), findsOneWidget);
      expect(find.text('项目知识空间'), findsOneWidget);
    });

    testWidgets('非管理员看不到邀请与归档等管理操作', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      registerOverviewMocks(
        harness,
        permissions: permissionsJson(
          role: 'member',
          isPm: false,
          canEditAll: false,
        ),
      );

      await harness.pumpScreen(tester, const ProjectOverviewScreen(projectId: 11));

      expect(find.text('邀请新成员加入'), findsNothing);
      expect(find.text('项目任务待办 · 3'), findsOneWidget);
    });

    testWidgets('从 /projects/11 跳到 /projects/12 时按新项目 ID 重新加载', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      registerOverviewMocks(harness);
      registerOverviewMocks(harness, projectId: 12);

      final router = await harness.pumpApp(tester, location: '/projects/11');

      expect(find.text('智能客服 2.0'), findsWidgets);
      expect(find.text('需求方案确认'), findsWidgets);

      router.go('/projects/12');
      await tester.pumpAndSettle();

      // 页面状态被 go_router 复用，必须切到 12 的数据，不能残留 11 的内容
      expect(find.text('数据中台'), findsWidgets);
      expect(find.text('智能客服 2.0'), findsNothing);
      expect(find.text('数据迁移脚本'), findsWidgets);
      expect(find.text('需求方案确认'), findsNothing);
      expect(
        harness.helper.history.where((item) =>
            item.method == 'GET' &&
            item.url.path == '/api/v1/projects/12' &&
            item.url.query.isEmpty),
        isNotEmpty,
      );
      expect(
        harness.helper.history.where((item) =>
            item.method == 'GET' &&
            item.url.path == '/api/v1/projects/12/my-permissions'),
        isNotEmpty,
      );
    });

    testWidgets('委托只拿到 tree.edit_subtree 时不显示邀请入口', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      registerOverviewMocks(
        harness,
        permissions: permissionsJson(
          role: 'member',
          isPm: false,
          canEditAll: true,
          canMove: false,
          canDelete: false,
        ),
      );

      await harness.pumpScreen(tester, const ProjectOverviewScreen(projectId: 11));

      // 后端邀请接口要求 member.pull，接口未透出该能力时宁可不显示
      expect(find.text('邀请新成员加入'), findsNothing);
      expect(find.text('项目任务待办 · 3'), findsOneWidget);
    });

    testWidgets('企业管理员可见邀请入口', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      registerOverviewMocks(
        harness,
        permissions: permissionsJson(
          role: 'superadmin',
          isPm: false,
          isSuperadmin: true,
          canEditAll: false,
        ),
      );

      await harness.pumpScreen(tester, const ProjectOverviewScreen(projectId: 11));

      expect(find.text('邀请新成员加入'), findsOneWidget);
    });

    testWidgets('成员统计按现任成员计数，排除已退出成员', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      final projectWithoutCount = projectJson()..remove('member_count');
      registerOverviewMocks(
        harness,
        project: projectWithoutCount,
        tasks: const [],
      );
      harness.helper.whenGet('/projects/11/members', {
        'items': [
          memberJson(userId: 5, nickname: '王宁', role: 'pm'),
          memberJson(userId: 6, nickname: '林悦'),
          memberJson(
            userId: 7,
            nickname: '赵六',
            leftAt: '2026-10-20T02:00:00Z',
          ),
        ],
      });

      await harness.pumpScreen(tester, const ProjectOverviewScreen(projectId: 11));

      expect(find.text('成员 2 人'), findsOneWidget);
    });

    testWidgets('项目任务加载失败时可点击重试并重新发起请求', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      registerOverviewMocks(harness);
      harness.helper.whenGet(
        '/projects/11/tasks',
        {'code': 50000, 'message': '服务端繁忙', 'data': null},
        statusCode: 500,
        query: {'page': '1', 'page_size': '200'},
      );

      await harness.pumpScreen(tester, const ProjectOverviewScreen(projectId: 11));

      expect(find.textContaining('服务端繁忙，点击重试'), findsWidgets);
      final before = harness.helper.history
          .where((item) => item.url.path.endsWith('/tasks'))
          .length;

      await tester.tap(find.textContaining('服务端繁忙，点击重试').first);
      await tester.pumpAndSettle();

      final after = harness.helper.history
          .where((item) => item.url.path.endsWith('/tasks'))
          .length;
      expect(after, greaterThan(before));
    });

    testWidgets('项目详情加载失败时展示可重试错误态', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet(
        '/projects/11',
        {'code': 50000, 'message': '服务端异常', 'data': null},
        statusCode: 500,
      );

      await harness.pumpScreen(tester, const ProjectOverviewScreen(projectId: 11));

      expect(find.text('加载失败'), findsOneWidget);
      expect(find.text('服务端异常'), findsOneWidget);
      final before = harness.helper.history
          .where((item) => item.url.path.endsWith('/projects/11'))
          .length;

      await tester.tap(find.text('重试'));
      await tester.pumpAndSettle();

      final after = harness.helper.history
          .where((item) => item.url.path.endsWith('/projects/11'))
          .length;
      expect(after, greaterThan(before));
    });

    testWidgets('无权限访问项目时展示无权限状态', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenGet(
        '/projects/11',
        {'code': 40301, 'message': '非项目成员', 'data': null},
        statusCode: 403,
      );

      await harness.pumpScreen(tester, const ProjectOverviewScreen(projectId: 11));

      expect(find.text('暂无访问权限'), findsOneWidget);
    });

    testWidgets('权限接口失败时降级提示且不阻塞页面其余内容', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      registerOverviewMocks(harness);
      harness.helper.whenGet(
        '/projects/11/my-permissions',
        {'code': 50000, 'message': '权限服务异常', 'data': null},
        statusCode: 500,
      );

      await harness.pumpScreen(tester, const ProjectOverviewScreen(projectId: 11));

      expect(find.textContaining('权限信息加载失败'), findsOneWidget);
      expect(find.text('邀请新成员加入'), findsNothing);
      expect(find.text('项目任务待办 · 3'), findsOneWidget);
    });

    testWidgets('任务超过分页安全上限时明确提示仅显示前 N 条', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      registerOverviewMocks(harness);
      // 模拟后端忽略 page 参数：每页都返回数据、total 永远更大，永远拉不完
      const perPage = 5;
      for (var page = 1; page <= ProjectsRepository.maxTaskPages; page++) {
        final items = List<Map<String, dynamic>>.generate(
          perPage,
          (index) => taskJson(
            id: (page - 1) * perPage + index + 1,
            title: '任务 ${(page - 1) * perPage + index + 1}',
          ),
        );
        harness.helper.whenGet(
          '/projects/11/tasks',
          {'items': items, 'total': 999999},
          query: {'page': '$page', 'page_size': '200'},
        );
      }

      await harness.pumpScreen(tester, const ProjectOverviewScreen(projectId: 11));

      final loaded = perPage * ProjectsRepository.maxTaskPages;
      expect(find.text('项目任务待办 · $loaded'), findsOneWidget);
      expect(find.textContaining('仅显示前 $loaded 条任务'), findsWidgets);
      expect(find.textContaining('完整数据请到任务列表查看'), findsWidgets);
    });
  });
}
