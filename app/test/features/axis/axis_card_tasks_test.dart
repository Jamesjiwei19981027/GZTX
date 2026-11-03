import 'package:flutter_test/flutter_test.dart';
import 'package:worktodo_app/features/axis/data/axis_card_tasks.dart';
import 'package:worktodo_app/features/axis/data/axis_models.dart';

AxisWorkItem item(
  int id, {
  DateTime? dueAt,
  String status = 'in_progress',
  int percent = 0,
}) =>
    AxisWorkItem(
      id: id,
      title: '任务$id',
      nodeTypeKey: 'work_item',
      status: status,
      percent: percent,
      dueAt: dueAt,
    );

List<int> ids(List<AxisWorkItem> items) => items.map((e) => e.id).toList();

void main() {
  final today = DateTime(2026, 11, 3, 15, 30);

  group('sortCardTasks 排序', () {
    test('已逾期在最前（按截止日期升序），然后未逾期升序，无日期最后', () {
      final tasks = [
        item(1),
        item(2, dueAt: DateTime(2026, 11, 20)),
        item(3, dueAt: DateTime(2026, 11, 5)),
        item(4, dueAt: DateTime(2026, 10, 20)),
        item(5, dueAt: DateTime(2026, 10, 1)),
      ];
      expect(ids(sortCardTasks(tasks, today)), [5, 4, 3, 2, 1]);
    });

    test('同一天按 id 升序；无日期的也按 id 升序', () {
      final day = DateTime(2026, 11, 9);
      final tasks = [
        item(9),
        item(7, dueAt: day),
        item(8),
        item(3, dueAt: day),
      ];
      expect(ids(sortCardTasks(tasks, today)), [3, 7, 8, 9]);
    });

    test('已完成的排在所有未完成之后（状态完成或进度 100）', () {
      final tasks = [
        item(1, dueAt: DateTime(2026, 9, 1), status: 'done'),
        item(2, dueAt: DateTime(2026, 9, 2), status: 'completed'),
        item(3, dueAt: DateTime(2026, 9, 3), percent: 100),
        item(4),
        item(5, dueAt: DateTime(2026, 12, 31)),
      ];
      expect(ids(sortCardTasks(tasks, today)), [5, 4, 1, 2, 3]);
    });

    test('今天到期不算逾期，仍按日期排在未逾期里', () {
      final tasks = [
        item(1, dueAt: DateTime(2026, 11, 3, 8)),
        item(2, dueAt: DateTime(2026, 11, 2)),
      ];
      final summary = summarizeCardTasks(tasks, today);
      expect(ids(sortCardTasks(tasks, today)), [2, 1]);
      expect(summary.overdueIds, {2});
    });

    test('不修改传入的列表', () {
      final tasks = [item(2), item(1)];
      sortCardTasks(tasks, today);
      expect(ids(tasks), [2, 1]);
    });
  });

  group('summarizeCardTasks 摘要', () {
    test('0 项：无可见任务，隐藏数为 0', () {
      final s = summarizeCardTasks(const [], today);
      expect(s.visible, isEmpty);
      expect(s.total, 0);
      expect(s.hiddenCount, 0);
    });

    test('1、2 项全部可见，隐藏数为 0', () {
      for (final n in [1, 2]) {
        final s =
            summarizeCardTasks([for (var i = 1; i <= n; i++) item(i)], today);
        expect(s.visible.length, n);
        expect(s.total, n);
        expect(s.hiddenCount, 0);
      }
    });

    test('超过 2 项：最多显示 2 条，隐藏数 = 总数 - 2', () {
      final tasks = [
        item(1, dueAt: DateTime(2026, 11, 1)),
        item(2, dueAt: DateTime(2026, 11, 4)),
        item(3),
        item(4),
        item(5),
      ];
      final s = summarizeCardTasks(tasks, today);
      expect(ids(s.visible), [1, 2]);
      expect(s.total, 5);
      expect(s.hiddenCount, 3);
      expect(s.overdueIds, {1});
      expect(s.isOverdue(s.visible.first), isTrue);
      expect(s.isOverdue(s.visible.last), isFalse);
    });

    test('已完成的任务即使过了截止日期也不算逾期', () {
      final s = summarizeCardTasks([
        item(1, dueAt: DateTime(2026, 10, 1), status: 'done'),
        item(2, dueAt: DateTime(2026, 10, 2)),
      ], today);
      expect(s.overdueIds, {2});
    });
  });
}
