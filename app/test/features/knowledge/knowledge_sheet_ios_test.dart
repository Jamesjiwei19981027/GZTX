import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/knowledge/controllers/personal_knowledge_controller.dart';
import 'package:worktodo_app/features/knowledge/controllers/project_knowledge_controller.dart';
import 'package:worktodo_app/features/knowledge/data/knowledge_repository.dart';
import 'package:worktodo_app/features/knowledge/screens/personal_knowledge_view.dart';
import 'package:worktodo_app/features/knowledge/screens/project_knowledge_view.dart';
import 'package:worktodo_app/features/knowledge/widgets/link_editor_sheet.dart';
import 'package:worktodo_app/features/knowledge/widgets/suggestion_sheet.dart';
import 'package:worktodo_app/features/knowledge/widgets/summary_sheet.dart';

import '../../helpers/mock_api_client.dart';
import 'knowledge_test_support.dart';

/// iOS 上底部浮层默认既不能点背景关闭、也不能下拉关闭，
/// 所以每个浮层必须自己提供明确的关闭方式。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Future<PersonalKnowledgeController> personalController(
    MockApiClientHelper helper,
  ) async {
    final controller = PersonalKnowledgeController(
      repository: KnowledgeRepository(helper.buildClient()),
      projectId: 7,
      userId: 11,
    );
    await controller.load();
    return controller;
  }

  Future<ProjectKnowledgeController> projectController(
    MockApiClientHelper helper,
  ) async {
    final controller = ProjectKnowledgeController(
      repository: KnowledgeRepository(helper.buildClient()),
      projectId: 7,
    );
    await controller.load();
    return controller;
  }

  /// 关闭按钮既不能提交，也不能依赖背景点击或下拉
  Future<void> tapClose(WidgetTester tester) async {
    await tester.tap(find.byTooltip('关闭'));
    await tester.pumpAndSettle();
  }

  testWidgets('iOS：管理总结授权浮层可以不提交直接关闭', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/knowledge-space', projectCatalogWithPermission);
    final controller = await projectController(helper);

    await pumpKnowledgeViewIos(
      tester,
      ProjectKnowledgeView(controller: controller, onSavedToPersonal: () {}),
    );
    await tester.tap(find.text('管理总结授权'));
    await tester.pumpAndSettle();

    expect(find.text('李四'), findsOneWidget);
    await tapClose(tester);

    expect(find.text('李四'), findsNothing);
    expect(
      helper.history.any((record) => record.method == 'PUT'),
      isFalse,
    );
  });

  testWidgets('iOS：总结浮层可以不提交直接关闭', (tester) async {
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
    final controller = await projectController(helper);

    await pumpKnowledgeViewIos(
      tester,
      ProjectKnowledgeView(controller: controller, onSavedToPersonal: () {}),
    );
    await tester.tap(find.text('AI 总结到我的知识'));
    await tester.pumpAndSettle();

    expect(find.byType(SummarySheet), findsOneWidget);
    await tapClose(tester);

    expect(find.byType(SummarySheet), findsNothing);
    expect(controller.summary?.isSaved, isFalse);
    expect(
      helper.history.any((record) =>
          record.url.path ==
          '/api/v1/projects/7/knowledge-space/summaries/88/save'),
      isFalse,
    );
  });

  testWidgets('iOS：AI 关联建议浮层可以不确认直接关闭', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/personal-knowledge', spaceWithTwoEntries);
    helper.whenPost('/projects/7/personal-knowledge/sync', {
      'created': 0,
      'skipped': 2,
    });
    helper.whenPost('/projects/7/personal-knowledge/assist', {
      'analyzed': 2,
      'suggestions': [
        {
          'source_entry_id': 21,
          'target_entry_id': 22,
          'label': '提供验收依据',
          'reason': '两条笔记都指向同一批验收项',
          'source_quote': '客户确认先做验收清单',
          'target_quote': '接口全部通过',
          'source_fingerprint': 'aaa',
          'target_fingerprint': 'bbb',
        },
      ],
    });
    final controller = await personalController(helper);

    await pumpKnowledgeViewIos(
      tester,
      PersonalKnowledgeView(controller: controller, companyId: 3),
    );
    await tester.tap(find.text('AI 整理'));
    await tester.pumpAndSettle();

    expect(find.byType(SuggestionSheet), findsOneWidget);
    await tapClose(tester);

    expect(find.byType(SuggestionSheet), findsNothing);
    expect(controller.links, isEmpty);
    expect(
      helper.history.any((record) =>
          record.url.path ==
          '/api/v1/projects/7/personal-knowledge/assist/apply'),
      isFalse,
    );
  });

  testWidgets('iOS：关联编辑浮层可以不做修改直接关闭', (tester) async {
    final helper = MockApiClientHelper();
    helper.whenGet(
      '/projects/7/personal-knowledge',
      spaceWithTwoEntriesAndLink,
    );
    final controller = await personalController(helper);

    await pumpKnowledgeViewIos(
      tester,
      PersonalKnowledgeView(controller: controller, companyId: 3),
    );
    await tester.tap(find.text('更多'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('手动调整关联'));
    await tester.pumpAndSettle();

    expect(find.byType(LinkEditorSheet), findsOneWidget);
    expect(find.text('已有 1 条关联'), findsOneWidget);
    await tapClose(tester);

    expect(find.byType(LinkEditorSheet), findsNothing);
    expect(controller.links.single.id, 9);
    expect(
      helper.history.any((record) =>
          record.method != 'GET'),
      isFalse,
    );
  });
}
