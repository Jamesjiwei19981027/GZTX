import 'axis_models.dart';

class AxisCardTaskSummary {
  const AxisCardTaskSummary({
    required this.visible,
    required this.total,
    required this.hiddenCount,
    required this.overdueIds,
  });

  final List<AxisWorkItem> visible;
  final int total;
  final int hiddenCount;
  final Set<int> overdueIds;

  bool isOverdue(AxisWorkItem item) => overdueIds.contains(item.id);
}

List<AxisWorkItem> sortCardTasks(List<AxisWorkItem> items, DateTime today) {
  final day = DateTime(today.year, today.month, today.day);
  final sorted = [...items];
  sorted.sort((a, b) {
    final aDone = a.isDone;
    final bDone = b.isDone;
    if (aDone != bDone) return aDone ? 1 : -1;
    final aDue = a.dueAt;
    final bDue = b.dueAt;
    final aOverdue = !aDone && aDue != null && aDue.isBefore(day);
    final bOverdue = !bDone && bDue != null && bDue.isBefore(day);
    if (aOverdue != bOverdue) return aOverdue ? -1 : 1;
    if (aDue == null && bDue != null) return 1;
    if (aDue != null && bDue == null) return -1;
    if (aDue != null && bDue != null) {
      final byDate = aDue.compareTo(bDue);
      if (byDate != 0) return byDate;
    }
    return a.id.compareTo(b.id);
  });
  return sorted;
}

AxisCardTaskSummary summarizeCardTasks(
  List<AxisWorkItem> items,
  DateTime today,
) {
  final sorted = sortCardTasks(items, today);
  final day = DateTime(today.year, today.month, today.day);
  final overdue = sorted
      .where(
        (item) =>
            !item.isDone && item.dueAt != null && item.dueAt!.isBefore(day),
      )
      .map((item) => item.id)
      .toSet();
  return AxisCardTaskSummary(
    visible: sorted.take(2).toList(growable: false),
    total: sorted.length,
    hiddenCount: sorted.length > 2 ? sorted.length - 2 : 0,
    overdueIds: overdue,
  );
}
