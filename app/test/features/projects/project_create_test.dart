import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/projects/screens/project_create_screen.dart';

import 'support/projects_test_harness.dart';

Future<void> _pumpCreate(
  WidgetTester tester,
  ProjectsTestHarness harness, {
  WorkspaceCreateMode mode = WorkspaceCreateMode.project,
}) async {
  await harness.pumpScreen(
    tester,
    ProjectCreateScreen(initialMode: mode),
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('新建项目', () {
    testWidgets('项目名称为空时提示必填且不发请求', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      await _pumpCreate(tester, harness);

      await tester.tap(find.text('立即创建项目'));
      await tester.pumpAndSettle();

      expect(find.text('请输入项目名称'), findsOneWidget);
      expect(
        harness.helper.history.where((item) => item.method == 'POST'),
        isEmpty,
      );
    });

    testWidgets('创建成功后切换全局当前项目并返回上一页', (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      harness.helper.whenPost(
        '/projects',
        projectJson(id: 21, name: '新项目', memberCount: 1),
      );
      await _pumpCreate(tester, harness);

      await tester.enterText(find.byType(TextFormField).first, '新项目');
      await tester.pumpAndSettle();
      await tester.tap(find.text('立即创建项目'));
      await tester.pumpAndSettle();

      final createRequest = harness.helper.history
          .firstWhere((item) => item.method == 'POST');
      expect(createRequest.url.path, '/api/v1/projects');
      expect(createRequest.body, {'name': '新项目', 'company_id': 1});

      expect(auth.currentProject?.id, 21);
      expect(auth.currentProject?.name, '新项目');
      expect(find.text('项目「新项目」已创建'), findsOneWidget);
      resetToastForTesting();
      await tester.pump();
    });

    testWidgets('服务端拒绝时展示后端中文提示', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      harness.helper.whenPost(
        '/projects',
        {'code': 40304, 'message': '需要组织负责人', 'data': null},
        statusCode: 403,
      );
      await _pumpCreate(tester, harness);

      await tester.enterText(find.byType(TextFormField).first, '越权项目');
      await tester.pumpAndSettle();
      await tester.tap(find.text('立即创建项目'));
      await tester.pumpAndSettle();

      expect(find.text('需要组织负责人'), findsOneWidget);
    });

    testWidgets('未加入公司时创建项目给出明确提示', (tester) async {
      final harness = ProjectsTestHarness(company: false);
      await harness.bootstrap();
      await _pumpCreate(tester, harness);

      await tester.enterText(find.byType(TextFormField).first, '孤立项目');
      await tester.pumpAndSettle();
      await tester.tap(find.text('立即创建项目'));
      await tester.pumpAndSettle();

      expect(find.text('未检测到有效企业所属，请先创建或加入公司'), findsOneWidget);
    });
  });

  group('创建新公司', () {
    testWidgets('公司名称为空时提示必填', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      await _pumpCreate(tester, harness, mode: WorkspaceCreateMode.company);

      expect(find.text('创建新公司'), findsOneWidget);
      await tester.tap(find.text('确认创建公司'));
      await tester.pumpAndSettle();

      expect(find.text('请输入公司名称'), findsOneWidget);
    });

    testWidgets('英文代号过滤非法字符后为空时提示重新填写', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      await _pumpCreate(tester, harness, mode: WorkspaceCreateMode.company);

      await tester.enterText(find.byType(TextFormField).at(0), '未来科技');
      await tester.enterText(find.byType(TextFormField).at(1), '未来 科技！');
      await tester.pumpAndSettle();
      await tester.tap(find.text('确认创建公司'));
      await tester.pumpAndSettle();

      expect(find.text('请输入有效的公司英文代号 (slug)'), findsOneWidget);
    });

    testWidgets('创建公司成功后将全局企业切换到新公司', (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      harness.helper.whenPost('/companies', {
        'id': 2,
        'name': '未来科技实业有限公司',
        'slug': 'future-tech',
        'status': 'active',
      });
      harness.helper.whenGet(
        '/projects',
        {'items': <Map<String, dynamic>>[], 'total': 0},
        query: {'company_id': '2', 'as_admin': 'true'},
      );
      await _pumpCreate(tester, harness, mode: WorkspaceCreateMode.company);

      await tester.enterText(
        find.byType(TextFormField).at(0),
        '未来科技实业有限公司',
      );
      await tester.enterText(find.byType(TextFormField).at(1), 'Future-Tech');
      await tester.pumpAndSettle();
      await tester.tap(find.text('确认创建公司'));
      await tester.pumpAndSettle();

      final createRequest = harness.helper.history
          .firstWhere((item) => item.method == 'POST');
      expect(createRequest.body, {
        'name': '未来科技实业有限公司',
        'slug': 'future-tech',
        'policy_preset': 'enterprise_strict',
      });
      expect(auth.currentCompany?.id, 2);
      expect(auth.currentCompany?.name, '未来科技实业有限公司');
      resetToastForTesting();
      await tester.pump();
    });

    testWidgets('公司已创建但切换失败时提示失败并提供重试切换入口', (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      harness.helper.whenPost('/companies', {
        'id': 2,
        'name': '未来科技实业有限公司',
        'slug': 'future-tech',
        'status': 'active',
      });
      // 新建公司后加载其项目列表失败（非 401/403/5xx，会话仍在）
      harness.helper.whenGet(
        '/projects',
        {'code': 42200, 'message': '企业工作区尚未就绪', 'data': null},
        statusCode: 422,
        query: {'company_id': '2', 'as_admin': 'true'},
      );
      await _pumpCreate(tester, harness, mode: WorkspaceCreateMode.company);

      await tester.enterText(
        find.byType(TextFormField).at(0),
        '未来科技实业有限公司',
      );
      await tester.enterText(find.byType(TextFormField).at(1), 'Future-Tech');
      await tester.pumpAndSettle();
      await tester.tap(find.text('确认创建公司'));
      await tester.pumpAndSettle();

      // 公司已创建，但切换回滚到原公司，页面不能提示成功、更不能直接离开
      expect(auth.currentCompany?.id, 1);
      expect(
        find.textContaining('公司「未来科技实业有限公司」已创建，但切换失败'),
        findsOneWidget,
      );
      expect(find.textContaining('重试切换到'), findsOneWidget);
      expect(find.text('确认创建公司'), findsOneWidget);
      expect(
        harness.helper.history
            .where((item) =>
                item.method == 'POST' &&
                item.url.path == '/api/v1/companies')
            .length,
        1,
      );

      // 恢复后重试切换：只重发项目列表请求，不重复创建公司
      harness.helper.whenGet(
        '/projects',
        {'items': <Map<String, dynamic>>[], 'total': 0},
        query: {'company_id': '2', 'as_admin': 'true'},
      );
      await tester.tap(find.textContaining('重试切换到'));
      await tester.pumpAndSettle();

      expect(auth.currentCompany?.id, 2);
      expect(
        harness.helper.history
            .where((item) =>
                item.method == 'POST' &&
                item.url.path == '/api/v1/companies')
            .length,
        1,
      );
      expect(find.text('已切换到公司「未来科技实业有限公司」'), findsOneWidget);
      resetToastForTesting();
      await tester.pump();
    });

    testWidgets('安全策略可切换为创业敏捷模式', (tester) async {
      final harness = ProjectsTestHarness();
      await harness.bootstrap();
      await _pumpCreate(tester, harness, mode: WorkspaceCreateMode.company);

      expect(find.text('企业合规严格模式（强制人轴与逐级汇报）'), findsOneWidget);
      await tester.tap(find.text('企业合规严格模式（强制人轴与逐级汇报）'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('创业敏捷模式（灵活扁平协作）').last);
      await tester.pumpAndSettle();

      expect(find.text('创业敏捷模式（灵活扁平协作）'), findsOneWidget);
    });
  });
}
