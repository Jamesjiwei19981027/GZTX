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

import '../../helpers/golden_test_helper.dart';
import 'reports_test_fixtures.dart';

/// T07 AI 汇报全页面 iOS 与 Android 双平台截图对比测试
///
/// 运行 `flutter test test/features/reports/report_golden_test.dart --update-goldens` 生成或更新基准图。
/// CI 默认 `--exclude-tags golden` 跳过。
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets(
    'AI 汇报工作台（ai-root）双平台外观对比',
    tags: ['golden'],
    (tester) async {
      final harness = await ReportsTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          ReportHubScreen(
            api: harness.api,
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            projects: const [
              ProjectOption(id: 10, name: 'AI 协同平台'),
              ProjectOption(id: 20, name: '移动重构项目'),
            ],
          ),
        ),
        goldenFileNamePrefix: 'report_hub',
      );
    },
  );

  testWidgets(
    '智能体对话（ai-chat）双平台外观对比',
    tags: ['golden'],
    (tester) async {
      final harness = await ReportsTestHarness.create();
      await testAdaptiveGolden(
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
        goldenFileNamePrefix: 'report_chat',
      );
    },
  );

  testWidgets(
    '写汇报（ai-report-create）双平台外观对比',
    tags: ['golden'],
    (tester) async {
      final harness = await ReportsTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          ReportEditorScreen(
            api: harness.api,
            userId: ReportsTestFixtures.currentUserId,
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            draftStore: harness.draftStore,
            periodLabel: '11 月 2 日—11 月 8 日',
            projects: const [ProjectOption(id: 10, name: 'AI 协同平台')],
          ),
        ),
        goldenFileNamePrefix: 'report_editor',
      );
    },
  );

  testWidgets(
    '汇报提交成功与送达流转（ai-report-submitted）双平台外观对比',
    tags: ['golden'],
    (tester) async {
      final harness = await ReportsTestHarness.create();
      await testAdaptiveGolden(
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
        goldenFileNamePrefix: 'report_submitted',
      );
    },
  );

  testWidgets(
    '单份汇报详情与来源（ai-report-detail）双平台外观对比',
    tags: ['golden'],
    (tester) async {
      final harness = await ReportsTestHarness.create();
      await testAdaptiveGolden(
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
        goldenFileNamePrefix: 'report_detail',
      );
    },
  );

  testWidgets(
    '汇报历史与版本列表双平台外观对比',
    tags: ['golden'],
    (tester) async {
      final harness = await ReportsTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          ReportDetailScreen(
            api: harness.api,
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            mode: ReportDetailMode.history,
          ),
        ),
        goldenFileNamePrefix: 'report_history',
      );
    },
  );

  testWidgets(
    '下属汇报收件箱（ai-inbox）双平台外观对比',
    tags: ['golden'],
    (tester) async {
      final harness = await ReportsTestHarness.create();
      await testAdaptiveGolden(
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
        goldenFileNamePrefix: 'report_inbox',
      );
    },
  );

  testWidgets(
    '待补材料与审阅跟进（ai-review-followup）双平台外观对比',
    tags: ['golden'],
    (tester) async {
      final harness = await ReportsTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          ReportReviewScreen(
            api: harness.api,
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            mode: ReportReviewMode.followup,
          ),
        ),
        goldenFileNamePrefix: 'report_review_followup',
      );
    },
  );

  testWidgets(
    '资料差异与冲突确认（ai-review-conflict）双平台外观对比',
    tags: ['golden'],
    (tester) async {
      final harness = await ReportsTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          ReportReviewScreen(
            api: harness.api,
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            mode: ReportReviewMode.conflict,
          ),
        ),
        goldenFileNamePrefix: 'report_review_conflict',
      );
    },
  );

  testWidgets(
    '项目资料对照（ai-project-contrast）双平台外观对比',
    tags: ['golden'],
    (tester) async {
      final harness = await ReportsTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          ProjectReportScreen(
            api: harness.api,
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            mode: ProjectReportMode.contrast,
          ),
        ),
        goldenFileNamePrefix: 'report_project_contrast',
      );
    },
  );

  testWidgets(
    '项目汇总与发布（ai-project-aggregate）双平台外观对比',
    tags: ['golden'],
    (tester) async {
      final harness = await ReportsTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          ProjectReportScreen(
            api: harness.api,
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            mode: ProjectReportMode.aggregate,
          ),
        ),
        goldenFileNamePrefix: 'report_project_aggregate',
      );
    },
  );

  testWidgets(
    '企业领导层汇报（ai-leadership）双平台外观对比',
    tags: ['golden'],
    (tester) async {
      final harness = await ReportsTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          LeadershipReportScreen(
            api: harness.api,
            companyId: ReportsTestFixtures.companyId,
          ),
        ),
        goldenFileNamePrefix: 'report_leadership',
      );
    },
  );

  testWidgets(
    '汇报智能体绑定管理（ai-agent-bindings）双平台外观对比',
    tags: ['golden'],
    (tester) async {
      final harness = await ReportsTestHarness.create();
      await testAdaptiveGolden(
        tester: tester,
        widget: harness.withProvider(
          ReportReviewScreen(
            api: harness.api,
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            mode: ReportReviewMode.bindings,
          ),
        ),
        goldenFileNamePrefix: 'report_bindings',
      );
    },
  );
}
