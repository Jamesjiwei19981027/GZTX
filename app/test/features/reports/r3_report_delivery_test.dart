import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/reports/screens/project_report_screen.dart';
import 'package:worktodo_app/features/reports/screens/report_detail_screen.dart';
import 'package:worktodo_app/features/reports/data/reports_api.dart';
import 'package:worktodo_app/features/reports/models/report_models.dart';
import 'package:worktodo_app/design/design.dart';

import 'reports_test_fixtures.dart';

const draftSummary = {
  'id': 601,
  'project_id': 10,
  'status': 'aggregated',
  'summary_text': '待发布的项目成果',
  'created_at': '2026-11-01T08:00:00Z'
};
const publishedSummary = {
  'id': 600,
  'project_id': 10,
  'status': 'published',
  'summary_text': '上周已发布的完整项目摘要',
  'published_at': '2026-11-01T09:00:00Z',
  'published_by_name': '项目负责人'
};

void main() {
  testWidgets('已发布摘要可读时原始成员汇报403不阻断查看', (tester) async {
    tester.view.physicalSize = const Size(430, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final h = await ReportsTestHarness.create();
    h.helper.whenGet('/projects/10/report-summaries', {
      'items': [publishedSummary],
      'can_publish': false
    });
    h.helper.whenGet(
        '/projects/10/agent-reports', {'code': 403, 'message': '无权查看成员汇报'},
        statusCode: 403);
    await tester.pumpWidget(
        h.wrapRouted(ProjectReportScreen(api: h.api, projectId: 10)));
    await tester.pumpAndSettle();
    expect(find.text('查看已发布版本 600'), findsOneWidget);
    expect(find.text('上周已发布的完整项目摘要'), findsOneWidget);
  });

  testWidgets('聚合延迟切项目解锁新项目且A到B到A不接旧结果', (tester) async {
    tester.view.physicalSize = const Size(430, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final h = await ReportsTestHarness.create();
    final api = _DelayedAggregateApi(h.helper.buildClient());
    final current = ValueNotifier(10);
    addTearDown(current.dispose);
    await tester.pumpWidget(h.wrapRouted(ValueListenableBuilder<int>(
        valueListenable: current,
        builder: (context, pid, _) =>
            ProjectReportScreen(api: api, projectId: pid))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('生成 / 更新项目汇总'));
    await tester.pump();
    current.value = 20;
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<AppButton>(find.widgetWithText(AppButton, '生成 / 更新项目汇总'))
            .onPressed,
        isNotNull);
    current.value = 10;
    await tester.pumpAndSettle();
    api.pending.complete(const ProjectReportAggregate(
        id: 999, projectId: 10, status: 'aggregated', summaryText: '迟到的旧聚合结果'));
    await tester.pumpAndSettle();
    expect(find.text('迟到的旧聚合结果'), findsNothing);
    expect(find.text('已基于已提交的下属汇报生成最新项目汇总摘要'), findsNothing);
  });
  test('汇总列表、确认发布与汇报核验使用真实新接口', () async {
    final h = await ReportsTestHarness.create();
    h.helper.whenGet('/projects/10/report-summaries', {
      'items': [draftSummary, publishedSummary],
      'can_publish': true
    });
    h.helper.whenPost('/projects/10/report-summaries/601/publish',
        {...draftSummary, 'status': 'published'});
    h.helper.whenPost('/reports/501/review', {
      ...ReportsTestFixtures.submittedReportJson,
      'can_review': true,
      'review': {
        'decision': 'returned',
        'comment': '请补验收依据',
        'reviewer_user_id': 20,
        'reviewed_at': '2026-11-09T08:00:00Z'
      }
    });
    final summaries = await h.api.listSummaries(10);
    expect(summaries.canPublish, true);
    expect(summaries.items.first.id, 601);
    expect((await h.api.publishSummary(10, 601)).isPublished, true);
    final report =
        await h.api.reviewReport(501, decision: 'returned', comment: '请补验收依据');
    expect(report.review?.comment, '请补验收依据');
    expect(h.helper.history.last.body,
        {'decision': 'returned', 'comment': '请补验收依据'});
  });

  testWidgets('项目汇总确认后发布并可查看已发布版本全文', (tester) async {
    tester.view.physicalSize = const Size(430, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final h = await ReportsTestHarness.create();
    h.helper.whenGet('/projects/10/report-summaries', {
      'items': [draftSummary, publishedSummary],
      'can_publish': true
    });
    h.helper.whenPost('/projects/10/report-summaries/601/publish',
        {...draftSummary, 'status': 'published'});
    await tester.pumpWidget(
        h.wrapRouted(ProjectReportScreen(api: h.api, projectId: 10)));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('确认发布项目摘要'));
    await tester.tap(find.text('确认发布项目摘要'));
    await tester.pumpAndSettle();
    expect(
        h.helper.history.where(
            (r) => r.method == 'POST' && r.url.path.endsWith('/publish')),
        isEmpty);
    await tester.tap(find.text('确认发布').last);
    await tester.pumpAndSettle();
    expect(
        h.helper.history.where(
            (r) => r.method == 'POST' && r.url.path.endsWith('/601/publish')),
        hasLength(1));
    expect(find.text('项目摘要已发布'), findsOneWidget);
    await tester.ensureVisible(find.text('查看已发布版本 600'));
    await tester.tap(find.text('查看已发布版本 600'));
    await tester.pumpAndSettle();
    expect(find.text('上周已发布的完整项目摘要'), findsWidgets);
  });

  testWidgets('成员只有已发布版本查看能力', (tester) async {
    final h = await ReportsTestHarness.create();
    h.helper.whenGet('/projects/10/report-summaries', {
      'items': [publishedSummary],
      'can_publish': false
    });
    await tester.pumpWidget(
        h.wrapRouted(ProjectReportScreen(api: h.api, projectId: 10)));
    await tester.pumpAndSettle();
    expect(find.text('确认发布项目摘要'), findsNothing);
    expect(find.text('生成 / 更新项目汇总'), findsNothing);
  });

  testWidgets('负责人可保存退回意见，重新打开详情仍可读', (tester) async {
    tester.view.physicalSize = const Size(430, 2200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final h = await ReportsTestHarness.create();
    h.helper.whenGet('/reports/501',
        {...ReportsTestFixtures.submittedReportJson, 'can_review': true});
    h.helper.whenPost('/reports/501/review', {
      ...ReportsTestFixtures.submittedReportJson,
      'can_review': true,
      'review': {
        'decision': 'returned',
        'comment': '请补充验收清单',
        'reviewer_user_id': 20,
        'reviewed_at': '2026-11-09T08:00:00Z'
      }
    });
    await tester.pumpWidget(h.wrapRouted(ReportDetailScreen(
        api: h.api, projectId: 10, reportId: 501, fromManager: true)));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.byKey(const ValueKey('report-review-comment-501')), '请补充验收清单');
    await tester.tap(find.text('退回修改'));
    await tester.pumpAndSettle();
    expect(find.text('核验意见已保存并通知成员'), findsOneWidget);
    expect(find.text('请补充验收清单'), findsWidgets);
    expect(h.helper.history.last.body,
        {'decision': 'returned', 'comment': '请补充验收清单'});
  });

  testWidgets('成员可读核验结果和快照但无核验按钮', (tester) async {
    final h = await ReportsTestHarness.create();
    h.helper.whenGet('/reports/501', {
      ...ReportsTestFixtures.submittedReportJson,
      'can_review': false,
      'review': {
        'decision': 'approved',
        'comment': '验收完成',
        'reviewer_user_id': 20,
        'reviewed_at': '2026-11-09T08:00:00Z'
      }
    });
    await tester.pumpWidget(h.wrapRouted(
        ReportDetailScreen(api: h.api, projectId: 10, reportId: 501)));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('验收完成'),
      200,
      scrollable: find
          .descendant(
            of: find.byType(ListView).last,
            matching: find.byType(Scrollable),
          )
          .first,
    );
    expect(find.text('验收完成'), findsOneWidget);
    expect(find.text('退回修改'), findsNothing);
  });
}

class _DelayedAggregateApi extends ReportsApi {
  _DelayedAggregateApi(super.client);
  final pending = Completer<ProjectReportAggregate>();
  @override
  Future<ProjectReportAggregate> aggregateProject(int projectId) =>
      pending.future;
}
