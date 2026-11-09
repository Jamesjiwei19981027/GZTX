import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/knowledge/controllers/project_knowledge_controller.dart';
import 'package:worktodo_app/features/knowledge/data/knowledge_repository.dart';
import 'package:worktodo_app/features/knowledge/screens/project_knowledge_view.dart';
import 'package:worktodo_app/features/knowledge/widgets/summary_sheet.dart';

import '../../helpers/mock_api_client.dart';
import 'knowledge_test_support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<ProjectKnowledgeController> buildController(
    MockApiClientHelper helper,
  ) async {
    final controller = ProjectKnowledgeController(
      repository: KnowledgeRepository(helper.buildClient()),
      projectId: 7,
    );
    await controller.load();
    return controller;
  }

  testWidgets('没有总结权限的成员看不到总结按钮，只能看到权限提示', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/knowledge-space', projectCatalogNoPermission);
    final controller = await buildController(helper);

    await pumpKnowledgeView(
      tester,
      ProjectKnowledgeView(controller: controller, onSavedToPersonal: () {}),
    );

    expect(find.text('AI 总结到我的知识'), findsNothing);
    expect(find.text('请联系项目经理开通 AI 总结权限'), findsOneWidget);
    expect(find.text('管理总结授权'), findsNothing);
    expect(find.text('八项接口通过验收'), findsOneWidget);
    expect(find.text('AI 整理 · 已发布'), findsOneWidget);
    expect(find.text('项目共享笔记'), findsOneWidget);
  });

  testWidgets('有权限时生成总结、确认后沉淀到个人知识并切回我的知识', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/knowledge-space', projectCatalogWithPermission);
    helper.whenPost('/projects/7/knowledge-space/summaries', {
      'id': 88,
      'title': '设计联调验收注意事项',
      'body_text': '八项接口已通过验收。',
      'sources': [
        {'page_id': 4, 'title': '八项接口通过验收', 'quote': '八项接口通过验收'},
      ],
      'page_ids': [4],
      'status': 'draft',
      'provider': 'openai',
      'model_source': 'company',
      'personal_entry_id': null,
    });
    helper.whenPost('/projects/7/knowledge-space/summaries/88/save', {
      'entry': {
        'id': 55,
        'title': '设计联调验收注意事项',
        'body_text': '八项接口已通过验收。',
        'tags': <String>[],
        'source_type': 'project_summary',
        'source_id': 88,
        'source_ref': <String, dynamic>{},
        'updated_at': null,
      },
      'already_saved': false,
    });
    final controller = await buildController(helper);
    var savedCallback = false;

    await pumpKnowledgeView(
      tester,
      ProjectKnowledgeView(
        controller: controller,
        onSavedToPersonal: () => savedCallback = true,
      ),
    );

    expect(find.text('AI 总结到我的知识'), findsOneWidget);
    await tester.enterText(find.byType(EditableText).first, '提炼验收要点');
    await tester.tap(find.text('AI 总结到我的知识'));
    await tester.pumpAndSettle();

    expect(find.byType(SummarySheet), findsOneWidget);
    expect(find.text('总结草稿'), findsOneWidget);
    expect(find.text('八项接口通过验收'), findsWidgets);

    await tester.tap(find.text('确认存入我的知识'));
    await tester.pumpAndSettle();

    expect(savedCallback, isTrue);
    expect(controller.summary!.isSaved, isTrue);
    expect(controller.summary!.personalEntryId, 55);
    final request = helper.history.last;
    expect(
      request.url.path,
      '/api/v1/projects/7/knowledge-space/summaries/88/save',
    );
    expect(request.body['title'], '设计联调验收注意事项');
    await drainToasts(tester);
  });

  testWidgets('生成总结失败时给出服务端提示，不生成假草稿', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/knowledge-space', projectCatalogWithPermission);
    helper.whenPost(
      '/projects/7/knowledge-space/summaries',
      '{"code":409,"message":"请先在设置中启用 AI，再尝试整理"}',
      statusCode: 409,
    );
    final controller = await buildController(helper);

    await pumpKnowledgeView(
      tester,
      ProjectKnowledgeView(controller: controller, onSavedToPersonal: () {}),
    );
    await tester.tap(find.text('AI 总结到我的知识'));
    await tester.pumpAndSettle();

    expect(find.byType(SummarySheet), findsNothing);
    expect(controller.summary, isNull);
    expect(controller.error, '请先在设置中启用 AI，再尝试整理');
    await drainToasts(tester);
  });

  testWidgets('项目经理可以给成员开通总结权限', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/knowledge-space', projectCatalogWithPermission);
    helper.whenPut('/projects/7/knowledge-space/grants/12', {
      'user_id': 12,
      'name': '李四',
      'can_summarize': true,
      'is_manager': false,
    });
    final controller = await buildController(helper);

    await pumpKnowledgeView(
      tester,
      ProjectKnowledgeView(controller: controller, onSavedToPersonal: () {}),
    );

    await tester.tap(find.text('管理总结授权'));
    await tester.pumpAndSettle();

    expect(find.text('张三'), findsOneWidget);
    expect(find.text('项目经理 · 默认授权'), findsOneWidget);
    expect(find.text('李四'), findsOneWidget);

    await tester.tap(find.byType(AppSwitch).last);
    await tester.pumpAndSettle();

    final request = helper.history.last;
    expect(request.method, 'PUT');
    expect(request.url.path, '/api/v1/projects/7/knowledge-space/grants/12');
    expect(request.body, {'can_summarize': true});
  });

  testWidgets('无访问权限时展示无权限状态', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet(
      '/projects/7/knowledge-space',
      '{"code":403,"message":"需要在职公司成员与当前项目成员资格"}',
      statusCode: 403,
    );
    final controller = ProjectKnowledgeController(
      repository: KnowledgeRepository(helper.buildClient()),
      projectId: 7,
    );
    await controller.load();

    await pumpKnowledgeView(
      tester,
      ProjectKnowledgeView(controller: controller, onSavedToPersonal: () {}),
    );

    expect(controller.forbidden, isTrue);
    expect(find.text('暂无访问权限'), findsOneWidget);
  });

  testWidgets('读取失败展示重试入口，重试成功后显示共享资料', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet(
      '/projects/7/knowledge-space',
      '{"code":500,"message":"服务暂时不可用"}',
      statusCode: 500,
    );
    final controller = ProjectKnowledgeController(
      repository: KnowledgeRepository(helper.buildClient()),
      projectId: 7,
    );
    await controller.load();

    await pumpKnowledgeView(
      tester,
      ProjectKnowledgeView(controller: controller, onSavedToPersonal: () {}),
    );

    expect(find.text('项目知识读取失败'), findsOneWidget);
    expect(find.text('服务暂时不可用'), findsOneWidget);

    helper.whenGet('/projects/7/knowledge-space', projectCatalogWithPermission);
    await tester.tap(find.text('重试'));
    await tester.pumpAndSettle();

    expect(find.text('八项接口通过验收'), findsOneWidget);
  });

  testWidgets('点开共享资料可以看到正文与原始依据', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/knowledge-space', projectCatalogNoPermission);
    final controller = await buildController(helper);

    await pumpKnowledgeView(
      tester,
      ProjectKnowledgeView(controller: controller, onSavedToPersonal: () {}),
    );

    await tester.tap(find.text('八项接口通过验收'));
    await tester.pumpAndSettle();

    expect(find.byType(PageDetailSheet), findsOneWidget);
    expect(find.text('八项接口通过验收，两项待复核'), findsWidgets);
    expect(find.text('“八项接口通过验收”'), findsOneWidget);
    expect(find.text('验收纪要.pdf · 材料 #12 · 第 3–5 行'), findsOneWidget);
  });

  testWidgets('来源关系图可以展开，节点可点开共享页', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/knowledge-space', projectCatalogNoPermission);
    final controller = await buildController(helper);

    await pumpKnowledgeView(
      tester,
      ProjectKnowledgeView(controller: controller, onSavedToPersonal: () {}),
    );

    await tester.tap(find.text('查看来源关系图'));
    await tester.pumpAndSettle();

    expect(find.text('收起来源关系图'), findsOneWidget);
    expect(find.text('材料包 #12'), findsOneWidget);

    await tester.tap(find.text('八项接口通过验收').last);
    await tester.pumpAndSettle();
    expect(find.byType(PageDetailSheet), findsOneWidget);
  });

  testWidgets('空资料时提示暂无共享知识', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/knowledge-space', {
      'scope': {'company_id': 3, 'project_id': 7, 'owner_user_id': 11},
      'pages': <dynamic>[],
      'permissions': {'can_summarize': true, 'can_manage_grants': false},
      'members': <dynamic>[],
    });
    final controller = await buildController(helper);

    await pumpKnowledgeView(
      tester,
      ProjectKnowledgeView(controller: controller, onSavedToPersonal: () {}),
    );

    expect(find.text('暂无共享知识'), findsOneWidget);
    expect(find.text('暂无共享资料，暂时无法总结'), findsOneWidget);
  });
}
