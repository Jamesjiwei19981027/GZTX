import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/projects/screens/project_switch_screen.dart';

import 'support/projects_test_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('项目切换', () {
    testWidgets('未加入公司时展示空状态并引导创建公司', (tester) async {
      final harness = ProjectsTestHarness(company: false);
      await harness.bootstrap();
      await harness.pumpScreen(tester, const ProjectSwitchScreen());

      expect(find.text('尚未加入任何公司'), findsOneWidget);
      expect(find.text('创建新企业/团队公司'), findsOneWidget);
      expect(find.text('新建项目'), findsNothing);
    });

    testWidgets('公司下没有项目时展示空状态并引导新建项目', (tester) async {
      final harness = ProjectsTestHarness(projects: false);
      await harness.bootstrap();
      await harness.pumpScreen(tester, const ProjectSwitchScreen());

      expect(find.text('当前工作区暂无项目'), findsOneWidget);
      expect(find.text('新建项目'), findsOneWidget);
    });

    testWidgets('列出全部项目并标记当前选中项目', (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      expect(auth.currentProject?.name, '智能客服 2.0');

      await harness.pumpScreen(tester, const ProjectSwitchScreen());

      expect(find.text('切换工作区与项目'), findsOneWidget);
      expect(find.text('全部项目'), findsOneWidget);
      expect(find.text('智能客服 2.0'), findsOneWidget);
      expect(find.text('数据中台'), findsOneWidget);
      // 当前项目右侧显示对勾
      expect(find.byIcon(Icons.check), findsOneWidget);
    });

    testWidgets('点击其他项目后更新全局当前项目并提示', (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      await harness.pumpScreen(tester, const ProjectSwitchScreen());

      await tester.tap(find.text('数据中台'));
      await tester.pumpAndSettle();

      expect(auth.currentProject?.id, 12);
      expect(auth.currentProject?.name, '数据中台');
      expect(find.text('已切换到「数据中台」'), findsOneWidget);
      resetToastForTesting();
      await tester.pump();
    });

    testWidgets('刷新失败时给出可见提示且不丢失已有列表', (tester) async {
      final harness = ProjectsTestHarness();
      final auth = await harness.bootstrap();
      // 后注册的规则优先命中：刷新请求将失败
      harness.helper.whenGet(
        '/projects',
        Exception('连接超时'),
        query: {'company_id': '1', 'as_admin': 'true'},
      );

      await harness.pumpScreen(tester, const ProjectSwitchScreen());
      await tester.tap(find.byIcon(Icons.refresh));
      await tester.pumpAndSettle();

      expect(auth.projects.length, 2);
      expect(find.textContaining('网络请求失败'), findsOneWidget);
      resetToastForTesting();
      await tester.pump();
    });
  });
}
