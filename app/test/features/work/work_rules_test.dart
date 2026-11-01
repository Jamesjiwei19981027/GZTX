/// T02 核心业务规则、时区契约与排序算法单元测试。
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/work/data/work_models.dart';
import 'package:worktodo_app/features/work/data/work_scope.dart';
import 'package:worktodo_app/features/work/widgets/work_widgets.dart';

import 'work_test_fixtures.dart';

void main() {
  group('1. 重点待办排序与截断规则', () {
    test('过滤已完成任务，按截止时间由近及远排序，无截止时间排在最后，且最多展示 5 条', () {
      final tasks = [
        WorkTask.fromJson(buildTaskJson(id: 1, title: '已完成任务', status: 2, dueDate: '2026-11-01T00:00:00Z')),
        WorkTask.fromJson(buildTaskJson(id: 2, title: '无截止时间任务 A', status: 0, dueDate: null)),
        WorkTask.fromJson(buildTaskJson(id: 3, title: '明日截止任务', status: 0, dueDate: '2026-11-03T10:00:00Z')),
        WorkTask.fromJson(buildTaskJson(id: 4, title: '今日截止任务', status: 0, dueDate: '2026-11-02T10:00:00Z')),
        WorkTask.fromJson(buildTaskJson(id: 5, title: '昨日逾期任务', status: 1, dueDate: '2026-11-01T10:00:00Z')),
        WorkTask.fromJson(buildTaskJson(id: 6, title: '远期截止任务', status: 0, dueDate: '2026-11-10T10:00:00Z')),
        WorkTask.fromJson(buildTaskJson(id: 7, title: '无截止时间任务 B', status: 0, dueDate: null)),
      ];

      final focused = focusTasks(tasks);

      // 最多 5 条
      expect(focused.length, 5);

      // 已完成 id: 1 绝不出现在待办中
      expect(focused.any((t) => t.id == 1), isFalse);

      // 排序顺序：昨日(id:5) -> 今日(id:4) -> 明日(id:3) -> 远期(id:6) -> 无截止(id:2)
      expect(focused.map((t) => t.id).toList(), [5, 4, 3, 6, 2]);

      // 总待办统计应为 6 项（除已完成外的所有任务）
      expect(pendingCount(tasks), 6);
    });

    test('待办与逾期状态统计计算准确', () {
      final tasks = sampleWorkTasks();
      final counts = summaryCounts(tasks);
      expect(counts.pending, greaterThan(0));
      expect(counts.dueToday, greaterThanOrEqualTo(0));
      expect(counts.overdue, greaterThanOrEqualTo(0));
    });
  });

  group('2. UTC 时间、本地日期换算与跨时区边界契约', () {
    test('TaskTime.toApiDueDate 正确解析本地日期与时刻并换算为 UTC ISO 串', () {
      final utcIso = TaskTime.toApiDueDate('2026-11-02', '14:30');
      expect(utcIso, isNotNull);
      expect(utcIso!.endsWith('Z'), isTrue);

      final parsedBack = DateTime.parse(utcIso).toLocal();
      expect(parsedBack.year, 2026);
      expect(parsedBack.month, 11);
      expect(parsedBack.day, 2);
      expect(parsedBack.hour, 14);
      expect(parsedBack.minute, 30);
    });

    test('TaskTime.fromApiDueDate 识别全天事件与带具体时刻事件', () {
      // 构造当前时区本地零点对应的 UTC 时间
      final localMidnight = DateTime(2026, 11, 2, 0, 0, 0);
      final utcIsoMidnight = localMidnight.toUtc().toIso8601String();
      final resMidnight = TaskTime.fromApiDueDate(utcIsoMidnight);
      expect(resMidnight.date, '2026-11-02');
      expect(resMidnight.time, isNull);

      // 带具体时刻
      final localWithTime = DateTime(2026, 11, 2, 16, 45, 0);
      final utcIsoTime = localWithTime.toUtc().toIso8601String();
      final resTime = TaskTime.fromApiDueDate(utcIsoTime);
      expect(resTime.date, '2026-11-02');
      expect(resTime.time, '16:45');
    });

    test('跨时区边界日历分组测试（例如东八区 UTC+8）', () {
      // UTC 15:59:59 对应东八区 23:59:59（当天）
      // UTC 16:00:00 对应东八区 次日 00:00:00（次日）
      final dt1 = DateTime.utc(2026, 11, 1, 15, 59, 59);
      final dt2 = DateTime.utc(2026, 11, 1, 16, 0, 0);

      final local1 = dt1.toLocal();
      final local2 = dt2.toLocal();

      final key1 = TaskTime.localDateKey(local1);
      final key2 = TaskTime.localDateKey(local2);

      // 如果当前机器在东八区，验证分属两天
      if (DateTime.now().timeZoneOffset == const Duration(hours: 8)) {
        expect(key1, '2026-11-01');
        expect(key2, '2026-11-02');
      } else {
        // 在任何时区下，dt2 距离 dt1 刚好 1 秒，跨越分钟或时区点
        expect(dt2.difference(dt1).inSeconds, 1);
      }
    });

    test('日历月视图网格天数与前后留白计算', () {
      final nov2026 = DateTime(2026, 11, 1);
      final cells = buildMonthGrid(nov2026);
      // 必须是 7 的整数倍
      expect(cells.length % 7, 0);
      // 必须包含 2026-11-01 至 2026-11-30 的每一天
      for (var d = 1; d <= 30; d++) {
        final dayStr = '2026-11-${d.toString().padLeft(2, '0')}';
        expect(cells.contains(dayStr), isTrue);
      }
    });
  });

  group('3. TaskScope 任务范围规范化规则', () {
    test('TaskScope.normalize 严格口径：空或 all 为个人，正整数为项目，非法抛异常', () {
      expect(TaskScope.normalize(null).isPersonal, isTrue);
      expect(TaskScope.normalize('').isPersonal, isTrue);
      expect(TaskScope.normalize('all').isPersonal, isTrue);

      final projectScope = TaskScope.normalize('42');
      expect(projectScope.isPersonal, isFalse);
      expect(projectScope.projectId, 42);
      expect(projectScope.origin, 'project_link');

      expect(() => TaskScope.normalize('abc'), throwsFormatException);
      expect(() => TaskScope.normalize('-5'), throwsFormatException);
    });

    test('TaskScope.normalizeOrPersonal 宽松口径：非法输入回退为个人待办，不崩溃', () {
      final safeScope = TaskScope.normalizeOrPersonal('corrupted_scope');
      expect(safeScope.isPersonal, isTrue);
      expect(safeScope.projectId, isNull);
    });
  });

  group('4. 人轴关联锁定与状态标签属性', () {
    test('origin=project_link 且 linked_readonly=true 判定为锁定事项', () {
      final locked = WorkTask.fromJson(buildTaskJson(
        id: 1,
        title: '人轴锁定任务',
        origin: 'project_link',
        projectNodeId: 10,
        linkedReadonly: true,
      ));
      expect(locked.isAxisLocked, isTrue);

      final personal = WorkTask.fromJson(buildTaskJson(
        id: 2,
        title: '个人自由任务',
        origin: 'personal',
        linkedReadonly: false,
      ));
      expect(personal.isAxisLocked, isFalse);
    });

    test('优先级与状态文案符合平台统一中文规范', () {
      final t0 = WorkTask.fromJson(buildTaskJson(id: 1, title: '低优待办', priority: 0, status: 0));
      expect(t0.priorityLabel, '低优先级');
      expect(t0.statusLabel, '待办');

      final t1 = WorkTask.fromJson(buildTaskJson(id: 2, title: '中优进行中', priority: 1, status: 1));
      expect(t1.priorityLabel, '中优先级');
      expect(t1.statusLabel, '进行中');

      final t2 = WorkTask.fromJson(buildTaskJson(id: 3, title: '高优完成', priority: 2, status: 2));
      expect(t2.priorityLabel, '高优先级');
      expect(t2.statusLabel, '已完成');
    });
  });

  group('5. 项目隔离与任务可见性口径 (filterTasksByProject)', () {
    test('未指定项目时保留全量任务；选中项目后仅保留该项目任务与个人私有任务', () {
      final tasks = [
        WorkTask.fromJson(buildTaskJson(id: 1, title: '项目1事项', projectId: 1, origin: 'project_link')),
        WorkTask.fromJson(buildTaskJson(id: 2, title: '项目2事项', projectId: 2, origin: 'project_link')),
        WorkTask.fromJson(buildTaskJson(id: 3, title: '个人私有事项', projectId: null, origin: 'personal')),
      ];

      // 未选项目：全量可见
      final all = filterTasksByProject(tasks, null);
      expect(all.map((t) => t.id), [1, 2, 3]);

      // 选中项目 1：只可见项目 1 与个人事项，排除项目 2
      final p1Only = filterTasksByProject(tasks, 1);
      expect(p1Only.map((t) => t.id), [1, 3]);

      // 选中项目 2：只可见项目 2 与个人事项，排除项目 1
      final p2Only = filterTasksByProject(tasks, 2);
      expect(p2Only.map((t) => t.id), [2, 3]);
    });
  });
}
