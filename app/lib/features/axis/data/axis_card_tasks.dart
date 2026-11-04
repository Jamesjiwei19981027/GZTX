import 'axis_models.dart';

enum AxisCardTaskTone {
  over,
  today,
  normal,
  done,
  none,
}

class AxisCardChip {
  const AxisCardChip({
    required this.text,
    required this.tone,
  });

  final String text;
  final AxisCardTaskTone tone;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is AxisCardChip &&
          runtimeType == other.runtimeType &&
          text == other.text &&
          tone == other.tone;

  @override
  int get hashCode => Object.hash(text, tone);

  @override
  String toString() => 'AxisCardChip($text, $tone)';
}

AxisCardChip cardTaskChip(AxisWorkItem item, DateTime today) {
  if (item.isDone) {
    return const AxisCardChip(
      text: '已完成',
      tone: AxisCardTaskTone.done,
    );
  }
  if (item.dueAt == null) {
    return const AxisCardChip(
      text: '无日期',
      tone: AxisCardTaskTone.none,
    );
  }
  final todayZero = DateTime(today.year, today.month, today.day);
  final dueZero = DateTime(item.dueAt!.year, item.dueAt!.month, item.dueAt!.day);
  if (dueZero.isBefore(todayZero)) {
    final diffDays = todayZero.difference(dueZero).inDays;
    return AxisCardChip(
      text: '逾期 $diffDays 天',
      tone: AxisCardTaskTone.over,
    );
  }
  if (dueZero.isAtSameMomentAs(todayZero)) {
    return const AxisCardChip(
      text: '今天',
      tone: AxisCardTaskTone.today,
    );
  }
  final m = item.dueAt!.month.toString().padLeft(2, '0');
  final d = item.dueAt!.day.toString().padLeft(2, '0');
  return AxisCardChip(
    text: '$m/$d',
    tone: AxisCardTaskTone.normal,
  );
}

int cardOverdueCount(List<AxisWorkItem> items, DateTime today) {
  final day = DateTime(today.year, today.month, today.day);
  return items.where((item) {
    if (item.isDone || item.dueAt == null) return false;
    final dueZero = DateTime(item.dueAt!.year, item.dueAt!.month, item.dueAt!.day);
    return dueZero.isBefore(day);
  }).length;
}

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
