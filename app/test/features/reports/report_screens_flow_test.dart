import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/design/design.dart';
import 'package:worktodo_app/features/reports/screens/agent_chat_screen.dart';
import 'package:worktodo_app/features/reports/screens/leadership_report_screen.dart';
import 'package:worktodo_app/features/reports/screens/project_report_screen.dart';
import 'package:worktodo_app/features/reports/screens/report_detail_screen.dart';
import 'package:worktodo_app/features/reports/screens/report_editor_screen.dart';
import 'package:worktodo_app/features/reports/screens/report_hub_screen.dart';
import 'package:worktodo_app/features/reports/screens/report_inbox_screen.dart';
import 'package:worktodo_app/features/reports/screens/report_review_screen.dart';
import 'package:worktodo_app/features/reports/routes.dart';
import 'package:worktodo_app/features/reports/widgets/report_ui.dart';

import 'reports_test_fixtures.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('AgentChatScreen 组件与交互测试', () {
    testWidgets('未选项目时展示选择项目提示与空状态', (tester) async {
      final harness = await ReportsTestHarness.create();
      await tester.pumpWidget(
        harness.wrapRouted(
          AgentChatScreen(
            api: harness.api,
            projectId: 0,
            projectName: '未选择项目',
            projects: const [ProjectOption(id: 10, name: 'AI 协同平台')],
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('未选择项目'), findsOneWidget);
      expect(find.text('请选择具体项目'), findsOneWidget);
      expect(find.text('智能体会话与上下文按项目隔离，请先切换到具体项目。'), findsOneWidget);
    });

    testWidgets('选定项目后展示隔离提示，并可发送对话接收回复', (tester) async {
      final harness = await ReportsTestHarness.create();
      await tester.pumpWidget(
        harness.wrapRouted(
          AgentChatScreen(
            api: harness.api,
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            userName: '测试下属',
            draftStore: harness.draftStore,
            projects: const [ProjectOption(id: 10, name: 'AI 协同平台')],
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('测试下属的项目 AI · 上下文仅限当前项目（AI 协同平台）'), findsOneWidget);

      // 输入消息
      final inputFinder = find.byType(TextField);
      expect(inputFinder, findsOneWidget);
      await tester.enterText(inputFinder, '今天完成了原生汇报模块代码编写');
      await tester.pump();

      // 点击发送按钮（带有 send 图标的按钮）
      final sendFinder = find.byWidgetPredicate(
        (widget) => widget is AppIcon && widget.name == 'send',
      );
      expect(sendFinder, findsOneWidget);
      await tester.tap(sendFinder);
      await tester.pump();

      // 展示发送中与回复
      await tester.pumpAndSettle();
      expect(find.text('今天完成了原生汇报模块代码编写'), findsOneWidget);
      expect(find.textContaining('已为您记录今天的工作进展'), findsOneWidget);

      // 点击“加入汇报草稿”按钮
      final addToDraftFinder = find.text('加入汇报草稿');
      expect(addToDraftFinder, findsOneWidget);
      await tester.tap(addToDraftFinder);
      await tester.pumpAndSettle();

      // 验证草稿已被正确存入本地
      final draft = await harness.draftStore.load(
        userId: ReportsTestFixtures.currentUserId,
        projectId: ReportsTestFixtures.projectId,
      );
      expect(draft, isNotNull);
      expect(draft!.summary, contains('已为您记录今天的工作进展'));
    });
  });

  group('ReportEditorScreen 写汇报与直属领导判定测试', () {
    testWidgets('服务端解析直属领导是自己时展示红色警示并禁止提交', (tester) async {
      final invalidReport = {
        ...ReportsTestFixtures.draftReportJson,
        'parent_user_id': ReportsTestFixtures.currentUserId,
      };

      final harness = await ReportsTestHarness.create();
      harness.helper.whenGet(
        '/reports/my',
        {
          'items': [invalidReport],
        },
        query: {'project_id': '${ReportsTestFixtures.projectId}'},
      );

      await tester.pumpWidget(
        harness.wrapRouted(
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
      await tester.pumpAndSettle();

      // 校验直属领导卡片显示“直属领导不能是自己”
      expect(find.text('直属领导不能是自己'), findsOneWidget);
      expect(find.text('直属领导不能是自己。请在人轴画布或设置中指定您的直属上级后再提交。'), findsOneWidget);

      // 确认提交按钮由于 supervisor.isSelf 为禁用状态 (onPressed == null)
      final submitButton = tester.widget<AppButton>(
        find.widgetWithText(AppButton, '确认提交'),
      );
      expect(submitButton.onPressed, isNull);
    });

    testWidgets('项目经理打开没有服务端草稿时直属领导为空且提交按钮可用 (P1)', (tester) async {
      final pmUserId = ReportsTestFixtures.supervisorUserId; // 20 (项目经理)
      final harness = await ReportsTestHarness.create();
      // 服务端没有草稿
      harness.helper.whenGet(
        '/reports/my',
        {'items': <Map<String, dynamic>>[]},
        query: {'project_id': '${ReportsTestFixtures.projectId}'},
      );

      await tester.pumpWidget(
        harness.wrapRouted(
          ReportEditorScreen(
            api: harness.api,
            userId: pmUserId,
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            draftStore: harness.draftStore,
            projects: const [ProjectOption(id: 10, name: 'AI 协同平台')],
          ),
        ),
      );
      await tester.pumpAndSettle();

      // 直属领导显示“未指定直属领导”，而不是“直属领导不能是自己”
      expect(find.text('未指定直属领导'), findsOneWidget);
      expect(find.text('直属领导不能是自己'), findsNothing);

      // 输入内容
      final textFields = find.byType(TextField);
      await tester.enterText(textFields.first, '项目整体推进顺利');
      await tester.pump();

      // 确认提交按钮不被禁用
      final submitButton = tester.widget<AppButton>(
        find.widgetWithText(AppButton, '确认提交'),
      );
      expect(submitButton.onPressed, isNotNull);
    });

    testWidgets('有中间层领导的成员打开时展示真实中间层领导而非项目经理 (P1)', (tester) async {
      const intermediateLeaderId = 30;
      final membersWithIntermediate = [
        ...ReportsTestFixtures.membersJson,
        {
          'user_id': intermediateLeaderId,
          'display_name': '中间层组长王五',
          'role': 'leader',
          'left_at': null,
        },
      ];
      final memberReportWithIntermediate = {
        ...ReportsTestFixtures.draftReportJson,
        'parent_user_id': intermediateLeaderId,
      };

      final harness = await ReportsTestHarness.create();
      harness.helper.whenGet(
        '/projects/${ReportsTestFixtures.projectId}/members',
        {'items': membersWithIntermediate},
      );
      harness.helper.whenGet(
        '/reports/my',
        {
          'items': [memberReportWithIntermediate],
        },
        query: {'project_id': '${ReportsTestFixtures.projectId}'},
      );

      await tester.pumpWidget(
        harness.wrapRouted(
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
      await tester.pumpAndSettle();

      // 验证展示的是真实中间层组长王五，而不是项目经理李四
      expect(find.text('中间层组长王五'), findsOneWidget);
      expect(find.text('直属领导李四'), findsNothing);
    });

    testWidgets('刚输入完未满300毫秒自动保存前切换项目，旧项目草稿被安全保存且不串到新项目 (P2)', (tester) async {
      final harness = await ReportsTestHarness.create();
      final currentUserId = ReportsTestFixtures.currentUserId;
      const project10Id = ReportsTestFixtures.projectId;
      const project20Id = ReportsTestFixtures.otherProjectId;

      // 首次以项目 10 渲染
      await tester.pumpWidget(
        harness.wrapRouted(
          ReportEditorScreen(
            api: harness.api,
            userId: currentUserId,
            projectId: project10Id,
            projectName: 'AI 协同平台',
            draftStore: harness.draftStore,
            projects: const [
              ProjectOption(id: project10Id, name: 'AI 协同平台'),
              ProjectOption(id: project20Id, name: '移动重构项目'),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();

      // 在输入框中输入最新文字
      final textFields = find.byType(TextField);
      expect(textFields, findsNWidgets(2));
      const freshText = '刚刚输入的紧急工作进展，尚未经过300毫秒延迟';
      await tester.enterText(textFields.first, freshText);
      await tester.pump(); // 仅触发变更，绝对不等待 300ms 计时器

      // 立即通过修改 widget 参数切换为项目 20
      await tester.pumpWidget(
        harness.wrapRouted(
          ReportEditorScreen(
            api: harness.api,
            userId: currentUserId,
            projectId: project20Id,
            projectName: '移动重构项目',
            draftStore: harness.draftStore,
            projects: const [
              ProjectOption(id: project10Id, name: 'AI 协同平台'),
              ProjectOption(id: project20Id, name: '移动重构项目'),
            ],
          ),
        ),
      );
      await tester.pumpAndSettle();

      // 验证旧项目 10 的草稿已被安全落盘，且包含刚刚输入的新内容
      final project10Draft = await harness.draftStore.load(
        userId: currentUserId,
        projectId: project10Id,
      );
      expect(project10Draft, isNotNull);
      expect(project10Draft!.summary, contains(freshText));

      // 验证新项目 20 独立干净，未串入旧项目的内容
      final project20Draft = await harness.draftStore.load(
        userId: currentUserId,
        projectId: project20Id,
      );
      expect(project20Draft?.summary.contains(freshText) ?? false, isFalse);
    });

    testWidgets('正常直属领导下可从本地草稿恢复内容并提交', (tester) async {
      final harness = await ReportsTestHarness.create();
      // 预先写入本地隔离草稿
      await harness.draftStore.save(
        userId: ReportsTestFixtures.currentUserId,
        projectId: ReportsTestFixtures.projectId,
        summary: '【已完成】本地缓存的工作草稿',
        draftReportId: 503,
      );

      await tester.pumpWidget(
        harness.wrapRouted(
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
      await tester.pumpAndSettle();

      // 检查草稿内容恢复
      expect(find.text('【已完成】本地缓存的工作草稿'), findsOneWidget);
      expect(find.text('直属领导李四'), findsOneWidget);

      // 提交草稿
      final submitBtn = find.text('确认提交');
      expect(submitBtn, findsOneWidget);
      await tester.tap(submitBtn);
      await tester.pumpAndSettle();

      // 提交后草稿被清理
      final cleared = await harness.draftStore.load(
        userId: ReportsTestFixtures.currentUserId,
        projectId: ReportsTestFixtures.projectId,
      );
      expect(cleared, isNull);
    });
  });

  group('ReportDetailScreen 汇报详情与送达状态测试', () {
    testWidgets('submitted 模式展示送达流转与 G01 暂不可确认回执', (tester) async {
      final harness = await ReportsTestHarness.create();
      await tester.pumpWidget(
        harness.wrapRouted(
          ReportDetailScreen(
            api: harness.api,
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            reportId: 501,
            mode: ReportDetailMode.submitted,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('汇报提交与送达'), findsOneWidget);
      expect(find.textContaining('直属领导李四'), findsOneWidget);
      // G01: 智能体接收状态严格显示“状态暂不可确认”
      expect(find.text('状态暂不可确认'), findsOneWidget);
      expect(find.text('暂无独立 AI 处理回执，以直属领导与人轴状态为准'), findsOneWidget);
    });

    testWidgets('detail 模式展示汇报内容、快照与来源证据', (tester) async {
      final harness = await ReportsTestHarness.create();
      await tester.pumpWidget(
        harness.wrapRouted(
          ReportDetailScreen(
            api: harness.api,
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            reportId: 501,
            mode: ReportDetailMode.detail,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('汇报详情与版本'), findsOneWidget);
      expect(find.textContaining('完成 AI 汇报原生页面重写与双端测试'), findsOneWidget);
      expect(find.text('完成汇报收件箱与审阅模块'), findsOneWidget);
      expect(find.text('提交自动化测试报告及截图'), findsOneWidget);
    });

    testWidgets('history 模式展示汇报列表与状态筛选', (tester) async {
      final harness = await ReportsTestHarness.create();
      await tester.pumpWidget(
        harness.wrapRouted(
          ReportDetailScreen(
            api: harness.api,
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            mode: ReportDetailMode.history,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('汇报历史与版本'), findsOneWidget);
      expect(find.text('全部'), findsOneWidget);
      expect(find.text('已提交'), findsOneWidget);
      expect(find.text('草稿'), findsWidgets);
    });
  });

  group('ReportInboxScreen 收件箱与标记已读测试', () {
    testWidgets('收件箱展示未读红点，点击标记已读', (tester) async {
      final harness = await ReportsTestHarness.create();
      await tester.pumpWidget(
        harness.wrapRouted(
          ReportInboxScreen(
            api: harness.api,
            userId: ReportsTestFixtures.supervisorUserId, // 领导视角查阅直属下属汇报
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            projects: const [ProjectOption(id: 10, name: 'AI 协同平台')],
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('下属汇报收件箱'), findsOneWidget);
      expect(find.textContaining('下属张三提交的今日工作汇报'), findsOneWidget);
      expect(find.text('未读'), findsOneWidget);

      // 点击汇报行打开并标记已读，自动跳转到汇报详情
      final row = find.textContaining('下属张三提交的今日工作汇报');
      await tester.tap(row);
      await tester.pumpAndSettle();

      // 验证触发标记已读请求，并跳转至详情页
      expect(
        harness.helper.history.any(
          (record) =>
              record.method == 'PUT' &&
              record.url.path.endsWith('/reports/inbox/502/read'),
        ),
        isTrue,
      );
      expect(find.text('汇报详情页'), findsOneWidget);
    });
  });

  group('ReportReviewScreen 审阅跟进与冲突处理测试', () {
    testWidgets('followup 模式展示审阅内容与跟进建议', (tester) async {
      final harness = await ReportsTestHarness.create();
      await tester.pumpWidget(
        harness.wrapRouted(
          ReportReviewScreen(
            api: harness.api,
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            mode: ReportReviewMode.followup,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('待补材料与上级追问'), findsOneWidget);
      expect(find.text('请补充验收材料与最终清单'), findsOneWidget);
      expect(find.text('更新汇报草稿'), findsOneWidget);
    });

    testWidgets('conflict 模式展示资料差异与冲突项', (tester) async {
      final harness = await ReportsTestHarness.create();
      await tester.pumpWidget(
        harness.wrapRouted(
          ReportReviewScreen(
            api: harness.api,
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            mode: ReportReviewMode.conflict,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('资料差异确认'), findsOneWidget);
      expect(find.textContaining('资料差异'), findsWidgets);
    });

    testWidgets('汇总后汇报状态变为 aggregated 时冲突核验页仍能展示冲突且不显示暂无资料差异 (P2)', (tester) async {
      final harness = await ReportsTestHarness.create();
      final aggregatedReports = [
        {
          'id': 601,
          'project_id': ReportsTestFixtures.projectId,
          'binding_id': 101,
          'author_user_id': ReportsTestFixtures.currentUserId,
          'parent_user_id': ReportsTestFixtures.supervisorUserId,
          'status': 'aggregated', // 后端汇总后状态为 aggregated
          'summary_text': '汇总源汇报A',
          'payload_json': {
            'task_snapshot': [
              {'id': 201, 'title': '安全规范审计', 'status': 'done'},
            ],
          },
        },
        {
          'id': 602,
          'project_id': ReportsTestFixtures.projectId,
          'binding_id': 102,
          'author_user_id': 12,
          'parent_user_id': ReportsTestFixtures.supervisorUserId,
          'status': 'aggregated', // 同样为 aggregated
          'summary_text': '汇总源汇报B',
          'payload_json': {
            'task_snapshot': [
              {'id': 201, 'title': '安全规范审计', 'status': 'failed'},
            ],
          },
        },
      ];

      harness.helper.whenGet(
        '/projects/${ReportsTestFixtures.projectId}/agent-reports',
        {'items': aggregatedReports},
      );

      await tester.pumpWidget(
        harness.wrapRouted(
          ReportReviewScreen(
            api: harness.api,
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            mode: ReportReviewMode.conflict,
          ),
        ),
      );
      await tester.pumpAndSettle();

      // 断言：检测到任务状态分歧并展示，绝不出现“暂无资料差异”
      expect(find.text('暂无资料差异'), findsNothing);
      expect(find.textContaining('任务状态不一致'), findsOneWidget);
      expect(find.textContaining('done / failed'), findsOneWidget);
    });

    testWidgets('bindings 模式展示汇报智能体绑定与同步操作', (tester) async {
      final harness = await ReportsTestHarness.create();
      await tester.pumpWidget(
        harness.wrapRouted(
          ReportReviewScreen(
            api: harness.api,
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            mode: ReportReviewMode.bindings,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('项目智能体绑定管理'), findsOneWidget);
      expect(find.text('个人项目汇报智能体'), findsOneWidget);
      expect(find.text('项目汇报智能体'), findsOneWidget);

      final syncBtn = find.text('同步人轴智能体');
      expect(syncBtn, findsOneWidget);
      await tester.tap(syncBtn);
      await tester.pumpAndSettle();

      expect(find.textContaining('同步成功，当前项目已绑定'), findsOneWidget);
    });
  });

  group('ProjectReportScreen 项目汇总与对照测试', () {
    testWidgets('contrast 模式展示完成情况与对照', (tester) async {
      final harness = await ReportsTestHarness.create();
      await tester.pumpWidget(
        harness.wrapRouted(
          ProjectReportScreen(
            api: harness.api,
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            mode: ProjectReportMode.contrast,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('项目资料对照'), findsOneWidget);
      expect(find.text('已提交汇报'), findsOneWidget);
      expect(find.text('差异项'), findsOneWidget);
    });

    testWidgets('aggregate 模式展示项目汇总并支持生成', (tester) async {
      tester.view.physicalSize = const Size(430, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final harness = await ReportsTestHarness.create();
      await tester.pumpWidget(
        harness.wrapRouted(
          ProjectReportScreen(
            api: harness.api,
            projectId: ReportsTestFixtures.projectId,
            projectName: 'AI 协同平台',
            mode: ProjectReportMode.aggregate,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('项目汇总与发布'), findsOneWidget);
      final aggregateBtn = find.text('生成 / 更新项目汇总');
      expect(aggregateBtn, findsOneWidget);
      await tester.tap(aggregateBtn);
      await tester.pumpAndSettle();

      expect(find.textContaining('AI 协同平台本周期整体完成度 85%'), findsOneWidget);
    });
  });

  group('LeadershipReportScreen 领导层汇报测试', () {
    testWidgets('展示企业最新汇报并支持重新汇总', (tester) async {
      final harness = await ReportsTestHarness.create();
      await tester.pumpWidget(
        harness.wrapRouted(
          LeadershipReportScreen(
            api: harness.api,
            companyId: ReportsTestFixtures.companyId,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('领导层项目总览'), findsOneWidget);
      expect(find.textContaining('企业各项目汇总概览'), findsOneWidget);

      final refreshBtn = find.text('汇总项目摘要');
      expect(refreshBtn, findsOneWidget);
      await tester.tap(refreshBtn);
      await tester.pumpAndSettle();

      expect(find.textContaining('企业各项目汇总概览'), findsOneWidget);
    });
  });

  group('ReportHubScreen 汇报总览工作台测试', () {
    testWidgets('展示各汇报功能入口卡片与项目信息', (tester) async {
      tester.view.physicalSize = const Size(430, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final harness = await ReportsTestHarness.create();
      await tester.pumpWidget(
        harness.wrapRouted(
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
      );
      await tester.pumpAndSettle();

      expect(find.text('AI 汇报与助手'), findsOneWidget);
      expect(find.text('我的项目 AI'), findsOneWidget);
      expect(find.text('告诉 AI 最新进展'), findsOneWidget);
      expect(find.text('整理本周汇报'), findsOneWidget);
      expect(find.text('汇报历史与版本'), findsOneWidget);
      expect(find.text('下属汇报收件箱'), findsOneWidget);
      expect(find.text('项目资料对照'), findsOneWidget);
      expect(find.text('项目汇总与发布'), findsOneWidget);
      expect(find.text('智能体绑定管理'), findsOneWidget);
      expect(find.text('领导层项目总览'), findsOneWidget);
    });

    testWidgets('新项目无任何绑定和收件时项目经理仍展示管理区与智能体绑定管理入口 (P2)', (tester) async {
      tester.view.physicalSize = const Size(430, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      const newProjectId = 99;
      final pmUserId = ReportsTestFixtures.supervisorUserId; // 20
      final harness = await ReportsTestHarness.create(
        user: ReportsTestFixtures.supervisorJson,
      );

      // 新项目没有任何智能体绑定、无汇报、无收件
      harness.helper.whenGet(
        '/projects/$newProjectId/report-agents/bindings',
        {'items': <Map<String, dynamic>>[]},
      );
      harness.helper.whenGet(
        '/projects/$newProjectId/agent-reports',
        {'items': <Map<String, dynamic>>[]},
      );
      harness.helper.whenGet(
        '/projects/$newProjectId/members',
        {
          'items': [
            {
              'user_id': pmUserId,
              'display_name': '直属领导李四',
              'role': 'pm', // 项目经理
              'left_at': null,
            },
          ],
        },
      );
      harness.helper.whenGet(
        '/reports/my',
        {'items': <Map<String, dynamic>>[]},
        query: {'project_id': '$newProjectId'},
      );
      harness.helper.whenGet(
        '/reports/inbox',
        {'items': <Map<String, dynamic>>[]},
      );

      await tester.pumpWidget(
        harness.wrapRouted(
          ReportHubScreen(
            api: harness.api,
            projectId: newProjectId,
            projectName: '全新未初始化项目',
            userId: pmUserId,
            projects: const [ProjectOption(id: newProjectId, name: '全新未初始化项目')],
          ),
        ),
      );
      await tester.pumpAndSettle();

      // 断言管理区如实展示，包含智能体绑定管理入口
      expect(find.text('管理者能力'), findsOneWidget);
      expect(find.text('智能体绑定管理'), findsOneWidget);
      expect(find.text('同步并管理项目内汇报智能体'), findsOneWidget);
    });
  });

  group('Reports 路由与项目隔离切换测试 (P1)', () {
    testWidgets('在写汇报页 /reports/create?projectId=10 切换到项目 20 时更新路由参数、项目名与提交请求', (tester) async {
      tester.view.physicalSize = const Size(430, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final harness = await ReportsTestHarness.create();
      // 使用真实的 reportsRoutes 路由栈挂载，初始路由带 projectId=10
      await tester.pumpWidget(
        harness.wrapRouted(
          const SizedBox(),
          routes: reportsRoutes,
          initialLocation: '/reports/create?projectId=10',
        ),
      );
      await tester.pumpAndSettle();

      // 验证初始项目为项目 10（AI 协同平台）
      expect(find.text('AI 协同平台'), findsWidgets);

      // 打开项目切换弹窗并选择项目 20（移动重构项目）
      final projectBar = find.byType(ReportProjectBar);
      expect(projectBar, findsOneWidget);
      await tester.tap(projectBar);
      await tester.pumpAndSettle();

      final targetProjectOption = find.text('移动重构项目').last;
      await tester.tap(targetProjectOption);
      await tester.pumpAndSettle();

      // 断言项目名更新为移动重构项目（而不是旧项目）
      expect(find.text('移动重构项目'), findsWidgets);

      // 输入汇报内容并点击提交
      final textFields = find.byType(TextField);
      expect(textFields, findsNWidgets(2));
      await tester.enterText(textFields.first, '本周完成移动端重构');
      await tester.enterText(textFields.last, '下周进行全量测试');
      await tester.pump();

      // 点击确认提交
      final submitBtn = find.text('确认提交');
      expect(submitBtn, findsOneWidget);
      await tester.tap(submitBtn);
      await tester.pumpAndSettle();

      // 验证网络请求包含对项目 20 (otherProjectId) 的提交
      final postRequests = harness.helper.history
          .where((r) => r.method == 'POST' && r.url.path.contains('/projects/20/agent-reports'))
          .toList();
      expect(postRequests.isNotEmpty, isTrue);
    });

    testWidgets('在对话页切换项目时更新路由参数且项目名与上下文隔离到新项目', (tester) async {
      tester.view.physicalSize = const Size(430, 2000);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final harness = await ReportsTestHarness.create();
      // 挂载对话页 /reports/chat?projectId=10
      await tester.pumpWidget(
        harness.wrapRouted(
          const SizedBox(),
          routes: reportsRoutes,
          initialLocation: '/reports/chat?projectId=10',
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('AI 协同平台'), findsWidgets);
      expect(find.textContaining('上下文仅限当前项目（AI 协同平台）'), findsOneWidget);

      // 切换到项目 20
      await tester.tap(find.byType(ReportProjectBar));
      await tester.pumpAndSettle();
      await tester.tap(find.text('移动重构项目').last);
      await tester.pumpAndSettle();

      expect(find.text('移动重构项目'), findsWidgets);
      expect(find.textContaining('上下文仅限当前项目（移动重构项目）'), findsOneWidget);
    });
  });
}
