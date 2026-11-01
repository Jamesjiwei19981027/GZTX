import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/knowledge/controllers/personal_knowledge_controller.dart';
import 'package:worktodo_app/features/knowledge/controllers/project_knowledge_controller.dart';
import 'package:worktodo_app/features/knowledge/data/knowledge_repository.dart';
import 'package:worktodo_app/features/knowledge/screens/personal_knowledge_view.dart';
import 'package:worktodo_app/features/knowledge/screens/project_knowledge_view.dart';

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
