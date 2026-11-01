import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/reports/screens/agent_chat_screen.dart';
import 'package:worktodo_app/features/reports/screens/leadership_report_screen.dart';
import 'package:worktodo_app/features/reports/screens/project_report_screen.dart';
import 'package:worktodo_app/features/reports/screens/report_detail_screen.dart';
import 'package:worktodo_app/features/reports/screens/report_editor_screen.dart';
import 'package:worktodo_app/features/reports/screens/report_hub_screen.dart';
import 'package:worktodo_app/features/reports/screens/report_inbox_screen.dart';
import 'package:worktodo_app/features/reports/screens/report_review_screen.dart';
import 'package:worktodo_app/features/reports/widgets/report_ui.dart';

import '../../helpers/responsive_checker.dart';
import 'reports_test_fixtures.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('AI 汇报工作台（ReportHubScreen）多尺寸与极端无障碍适配', (tester) async {
    final harness = await ReportsTestHarness.create();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: harness.withProvider(
        ReportHubScreen(
          api: harness.api,
          projectId: ReportsTestFixtures.projectId,
          projectName: 'AI 协同平台',
          projects: const [ProjectOption(id: 10, name: 'AI 协同平台')],
        ),
      ),
    );
  });

  testWidgets('智能体对话页（AgentChatScreen）多尺寸与极端无障碍适配', (tester) async {
    final harness = await ReportsTestHarness.create();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: harness.withProvider(
        AgentChatScreen(
          api: harness.api,
          projectId: ReportsTestFixtures.projectId,
          projectName: 'AI 协同平台',
          userName: '测试下属',
          projects: const [ProjectOption(id: 10, name: 'AI 协同平台')],
        ),
      ),
    );
  });

  testWidgets('写汇报页（ReportEditorScreen）多尺寸与极端无障碍适配', (tester) async {
    final harness = await ReportsTestHarness.create();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: harness.withProvider(
        ReportEditorScreen(
          api: harness.api,
          userId: ReportsTestFixtures.currentUserId,
          projectId: ReportsTestFixtures.projectId,
          projectName: 'AI 协同平台',
          draftStore: harness.draftStore,
          projects: const [ProjectOption(id: 10, name: 'AI 协同平台')],
        ),
      ),
    );
  });

  testWidgets('汇报提交与送达页（ReportDetailScreen submitted）多尺寸与极端无障碍适配', (tester) async {
    final harness = await ReportsTestHarness.create();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: harness.withProvider(
        ReportDetailScreen(
          api: harness.api,
          projectId: ReportsTestFixtures.projectId,
          projectName: 'AI 协同平台',
          reportId: 501,
          mode: ReportDetailMode.submitted,
        ),
      ),
    );
  });

  testWidgets('汇报详情页（ReportDetailScreen detail）多尺寸与极端无障碍适配', (tester) async {
    final harness = await ReportsTestHarness.create();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: harness.withProvider(
        ReportDetailScreen(
          api: harness.api,
          projectId: ReportsTestFixtures.projectId,
          projectName: 'AI 协同平台',
          reportId: 501,
          mode: ReportDetailMode.detail,
        ),
      ),
    );
  });

  testWidgets('下属汇报收件箱（ReportInboxScreen）多尺寸与极端无障碍适配', (tester) async {
    final harness = await ReportsTestHarness.create();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: harness.withProvider(
        ReportInboxScreen(
          api: harness.api,
          userId: ReportsTestFixtures.supervisorUserId,
          projectId: ReportsTestFixtures.projectId,
          projectName: 'AI 协同平台',
          projects: const [ProjectOption(id: 10, name: 'AI 协同平台')],
        ),
      ),
    );
  });

  testWidgets('项目资料对照页（ProjectReportScreen contrast）多尺寸与极端无障碍适配', (tester) async {
    final harness = await ReportsTestHarness.create();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: harness.withProvider(
        ProjectReportScreen(
          api: harness.api,
          projectId: ReportsTestFixtures.projectId,
          projectName: 'AI 协同平台',
          mode: ProjectReportMode.contrast,
        ),
      ),
    );
  });

  testWidgets('项目汇总与发布页（ProjectReportScreen aggregate）多尺寸与极端无障碍适配', (tester) async {
    final harness = await ReportsTestHarness.create();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: harness.withProvider(
        ProjectReportScreen(
          api: harness.api,
          projectId: ReportsTestFixtures.projectId,
          projectName: 'AI 协同平台',
          mode: ProjectReportMode.aggregate,
        ),
      ),
    );
  });

  testWidgets('企业领导层汇报页（LeadershipReportScreen）多尺寸与极端无障碍适配', (tester) async {
    final harness = await ReportsTestHarness.create();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: harness.withProvider(
        LeadershipReportScreen(
          api: harness.api,
          companyId: ReportsTestFixtures.companyId,
        ),
      ),
    );
  });

  testWidgets('智能体绑定管理页（ReportReviewScreen bindings）多尺寸与极端无障碍适配', (tester) async {
    final harness = await ReportsTestHarness.create();
    await ResponsiveChecker.checkAdaptiveLayout(
      tester: tester,
      widget: harness.withProvider(
        ReportReviewScreen(
          api: harness.api,
          projectId: ReportsTestFixtures.projectId,
          projectName: 'AI 协同平台',
          mode: ReportReviewMode.bindings,
        ),
      ),
    );
  });
}
