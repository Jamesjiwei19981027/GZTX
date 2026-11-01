import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/knowledge/controllers/personal_knowledge_controller.dart';
import 'package:worktodo_app/features/knowledge/controllers/project_knowledge_controller.dart';
import 'package:worktodo_app/features/knowledge/data/knowledge_repository.dart';
import 'package:worktodo_app/features/knowledge/models/knowledge_models.dart';
import 'package:worktodo_app/features/knowledge/screens/personal_knowledge_view.dart';
import 'package:worktodo_app/features/knowledge/screens/project_knowledge_view.dart';
import 'package:worktodo_app/features/knowledge/widgets/link_editor_sheet.dart';
import 'package:worktodo_app/features/knowledge/widgets/summary_sheet.dart';

import '../../helpers/golden_test_helper.dart';
import '../../helpers/mock_api_client.dart';
import '../../helpers/responsive_checker.dart';
import 'knowledge_test_support.dart';

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

  MockApiClientHelper personalHelper() {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/personal-knowledge', spaceWithTwoEntries);
    return helper;
  }

  MockApiClientHelper projectHelper() {
    final helper = MockApiClientHelper();
    helper.whenGet('/projects/7/knowledge-space', projectCatalogWithPermission);
    return helper;
  }

  testWidgets(
    '我的知识页双平台外观',
    tags: ['golden'],
    (tester) async {
      final controller = await personalController(personalHelper());
      await testAdaptiveGolden(
        tester: tester,
        widget: Scaffold(
          body: PersonalKnowledgeView(controller: controller, companyId: 3),
        ),
        goldenFileNamePrefix: 'knowledge_personal',
      );
    },
  );

  testWidgets(
    '关联图双平台外观',
    tags: ['golden'],
    (tester) async {
      final controller = await personalController(personalHelper());
      controller.setViewMode(KnowledgeViewMode.graph);
      await testAdaptiveGolden(
        tester: tester,
        widget: Scaffold(
          body: PersonalKnowledgeView(controller: controller, companyId: 3),
        ),
        goldenFileNamePrefix: 'knowledge_graph',
      );
    },
  );

  testWidgets(
    '项目知识页双平台外观',
    tags: ['golden'],
    (tester) async {
      final controller = await projectController(projectHelper());
      await testAdaptiveGolden(
        tester: tester,
        widget: Scaffold(
          body: ProjectKnowledgeView(
            controller: controller,
            onSavedToPersonal: () {},
          ),
        ),
        goldenFileNamePrefix: 'knowledge_project',
      );
    },
  );

  testWidgets(
    '总结浮层双平台外观',
    tags: ['golden'],
    (tester) async {
      await testAdaptiveGolden(
        tester: tester,
        widget: Scaffold(
          body: SummarySheet(
            summary: const ProjectKnowledgeSummary(
              id: 88,
              title: '设计联调验收注意事项',
              bodyText: '八项接口已通过验收，两项待复核。',
              sources: [
                KnowledgeSummarySource(
                  pageId: 4,
                  title: '八项接口通过验收',
                  quote: '八项接口通过验收',
                ),
              ],
            ),
            onSave: (title, body, tags) async => true,
          ),
        ),
        goldenFileNamePrefix: 'knowledge_summary_sheet',
      );
    },
  );

  testWidgets(
    '关联编辑浮层双平台外观',
    tags: ['golden'],
    (tester) async {
      final controller = await personalController(personalHelper());
      await testAdaptiveGolden(
        tester: tester,
        widget: Scaffold(
          body: LinkEditorSheet(
            entries: controller.entries,
            links: controller.links,
            titleOf: (id) => controller.entryTitleOf(id) ?? '已删除的笔记',
            onSave: ({
              int? linkId,
              required int sourceEntryId,
              required int targetEntryId,
              required String label,
            }) async =>
                true,
            onDelete: (linkId) async => true,
          ),
        ),
        goldenFileNamePrefix: 'knowledge_link_editor_sheet',
      );
    },
  );

  testWidgets('我的知识与项目知识在窄屏、宽屏、200% 字号、深色模式下不溢出', (tester) async {
    final personal = await personalController(personalHelper());
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: PersonalKnowledgeView(controller: personal, companyId: 3),
    );

    final graph = await personalController(personalHelper());
    graph.setViewMode(KnowledgeViewMode.graph);
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: PersonalKnowledgeView(controller: graph, companyId: 3),
    );

    final project = await projectController(projectHelper());
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: ProjectKnowledgeView(
        controller: project,
        onSavedToPersonal: () {},
      ),
    );
  });
}
