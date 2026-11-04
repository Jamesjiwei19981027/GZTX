import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/data/axis_report_helpers.dart';
import 'package:worktodo_app/features/reports/models/report_models.dart'
    hide reportStatusLabel;

AgentReport createReport({
  required int id,
  required int? authorUserId,
  required String status,
  int sourceCount = 0,
  String? submittedAt,
  String? createdAt,
}) {
  return AgentReport(
    id: id,
    authorUserId: authorUserId,
    status: status,
    summaryText: '测试汇报摘要',
    sourceCount: sourceCount,
    submittedAt: submittedAt,
    createdAt: createdAt,
  );
}

void main() {
  group('latestReportByUser 每人取本项目最新一份汇报', () {
    test('同一作者多份汇报取 id 最大的最新一份，不同作者各自取最新', () {
      final reports = [
        createReport(id: 1, authorUserId: 101, status: 'draft'),
        createReport(
          id: 3,
          authorUserId: 101,
          status: 'submitted',
          submittedAt: '2026-11-04T08:00:00Z',
        ),
        createReport(id: 2, authorUserId: 101, status: 'draft'),
        createReport(id: 4, authorUserId: 102, status: 'draft', sourceCount: 2),
      ];

      final latest = latestReportByUser(reports);
      expect(latest.length, 2);
      expect(latest[101]?.id, 3);
      expect(latest[101]?.status, 'submitted');
      expect(latest[102]?.id, 4);
      expect(latest[102]?.sourceCount, 2);
    });

    test('id 小但提交时间更新的汇报胜出', () {
      final latest = latestReportByUser([
        createReport(
          id: 9,
          authorUserId: 101,
          status: 'submitted',
          submittedAt: '2026-11-04T08:00:00Z',
        ),
        createReport(
          id: 2,
          authorUserId: 101,
          status: 'submitted',
          submittedAt: '2026-11-04T09:00:00Z',
        ),
      ]);
      expect(latest[101]?.id, 2);
    });

    test('时间按时刻比较，不受时区写法影响', () {
      // 18:00+08:00 = 10:00Z，晚于 09:30Z；按字符串比较会选错（id 更大的那份）。
      final latest = latestReportByUser([
        createReport(
          id: 5,
          authorUserId: 101,
          status: 'submitted',
          submittedAt: '2026-11-04T09:30:00Z',
        ),
        createReport(
          id: 1,
          authorUserId: 101,
          status: 'submitted',
          submittedAt: '2026-11-04T18:00:00+08:00',
        ),
      ]);
      expect(latest[101]?.id, 1);
    });

    test('未提交时用创建时间；时间相同、缺失或解析失败时比 id', () {
      final byCreated = latestReportByUser([
        createReport(
            id: 8,
            authorUserId: 1,
            status: 'draft',
            createdAt: '2026-11-04T01:00:00Z'),
        createReport(
            id: 3,
            authorUserId: 1,
            status: 'draft',
            createdAt: '2026-11-04T02:00:00Z'),
      ]);
      expect(byCreated[1]?.id, 3);

      final same = latestReportByUser([
        createReport(
            id: 3,
            authorUserId: 2,
            status: 'draft',
            createdAt: '2026-11-04T02:00:00Z'),
        createReport(
            id: 7,
            authorUserId: 2,
            status: 'draft',
            createdAt: '2026-11-04T02:00:00Z'),
      ]);
      expect(same[2]?.id, 7);

      final broken = latestReportByUser([
        createReport(
            id: 4,
            authorUserId: 3,
            status: 'draft',
            createdAt: '不是时间'),
        createReport(
            id: 6,
            authorUserId: 3,
            status: 'draft',
            createdAt: '2026-11-04T02:00:00Z'),
      ]);
      expect(broken[3]?.id, 6);
    });

    test('authorUserId 为 null 时忽略', () {
      final reports = [
        createReport(id: 1, authorUserId: null, status: 'draft'),
      ];
      expect(latestReportByUser(reports), isEmpty);
    });
  });

  group('reportStatusLabel 与 formatReportPresentation 汇报展示规则', () {
    test('无汇报时：文案为「暂无汇报」，无图标，灰色', () {
      expect(reportStatusLabel(null), '暂无汇报');

      final presLight = formatReportPresentation(null, isDark: false);
      expect(presLight.text, '暂无汇报');
      expect(presLight.icon, isNull);

      final presDark = formatReportPresentation(null, isDark: true);
      expect(presDark.text, '暂无汇报');
      expect(presDark.icon, isNull);
    });

    test('草稿状态：文案为「草稿待提交 · N 条来源」，蓝色', () {
      final draft = createReport(
        id: 10,
        authorUserId: 1,
        status: 'draft',
        sourceCount: 3,
      );
      expect(reportStatusLabel(draft), '草稿待提交 · 3 条来源');

      final pres = formatReportPresentation(draft, isDark: false);
      expect(pres.text, '草稿待提交 · 3 条来源');
      expect(pres.icon, Icons.description_outlined);
    });

    test('已提交状态：按本地时区格式化为「MM-DD HH:mm 已提交」，绿色对勾', () {
      // 构造固定时间：2026-11-04 14:30:00 本地时间
      final localTarget = DateTime(2026, 11, 4, 14, 30);
      final submitted = createReport(
        id: 20,
        authorUserId: 1,
        status: 'submitted',
        submittedAt: localTarget.toUtc().toIso8601String(),
      );

      final label = reportStatusLabel(submitted);
      expect(label, '11-04 14:30 已提交');

      final pres = formatReportPresentation(submitted, isDark: false);
      expect(pres.text, '11-04 14:30 已提交');
      expect(pres.icon, Icons.check_circle);
    });

    test('已汇总 aggregated 状态同样视为已提交', () {
      final localTarget = DateTime(2026, 5, 20, 9, 5);
      final aggregated = createReport(
        id: 21,
        authorUserId: 1,
        status: 'aggregated',
        submittedAt: localTarget.toUtc().toIso8601String(),
      );

      expect(reportStatusLabel(aggregated), '05-20 09:05 已提交');
    });

    test('时间解析失败时优雅降级为「已提交」', () {
      final invalidTime = createReport(
        id: 22,
        authorUserId: 1,
        status: 'submitted',
        submittedAt: 'invalid-date',
      );
      expect(reportStatusLabel(invalidTime), '已提交');
    });
  });
}
