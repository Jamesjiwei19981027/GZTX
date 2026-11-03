import 'package:intl/intl.dart';

import 'axis_models.dart';

class AxisDropResult {
  const AxisDropResult.allowed() : allowed = true, reason = null;
  const AxisDropResult.rejected(this.reason) : allowed = false;
  final bool allowed;
  final String? reason;
}

class AxisDragSubject {
  const AxisDragSubject({
    required this.id,
    required this.isPerson,
    this.parentId,
  });
  final int id;
  final bool isPerson;
  final int? parentId;
}

/// 人员最多四层（终责人 + 三层下属）。
const int axisMaxPersonLevels = 4;

class AxisRules {
  const AxisRules._();

  static int personLevel(int nodeId, List<AxisPersonNode> nodes) {
    final byId = {for (final node in nodes) node.id: node};
    var level = 0;
    int? current = nodeId;
    final seen = <int>{};
    while (current != null && seen.add(current)) {
      final node = byId[current];
      if (node == null) break;
      level++;
      current = node.parentId;
    }
    return level;
  }

  static Set<int> descendantPersonIds(int nodeId, List<AxisPersonNode> nodes) {
    final result = <int>{};
    final queue = <int>[nodeId];
    while (queue.isNotEmpty) {
      final current = queue.removeAt(0);
      for (final node in nodes) {
        if (node.parentId == current && result.add(node.id)) queue.add(node.id);
      }
    }
    return result;
  }

  static AxisDropResult validateDrop({
    required AxisDragSubject dragged,
    required AxisDragSubject? target,
    required List<AxisPersonNode> nodes,
    bool allowRootTarget = false,
    bool canAddUnderTarget = true,
  }) {
    if (target != null && target.id == dragged.id) {
      return const AxisDropResult.rejected('不能放到自己身上');
    }
    if (target == null) {
      // 拖到画布空白处 = 只调整卡片位置，不改变上级。
      if (!allowRootTarget) return const AxisDropResult.allowed();
      // 显式“设为顶层”：只能是人；且已有终责根时，非根人员不能再成为根。
      if (!dragged.isPerson) {
        return const AxisDropResult.rejected('主干只排人，事项不能成为顶层节点');
      }
      final hasRoot = nodes.any((node) => node.parentId == null);
      if (hasRoot && dragged.parentId != null) {
        return const AxisDropResult.rejected('已有终责人，不能把人员拖到根位置');
      }
      return const AxisDropResult.allowed();
    }
    if (!dragged.isPerson) {
      if (!target.isPerson) {
        return const AxisDropResult.rejected('事项只能挂在「人」下面，不能挂到其它事项上');
      }
      return const AxisDropResult.allowed();
    }
    if (!target.isPerson) {
      return const AxisDropResult.rejected('主干只排人：人员不能挂到事项下面');
    }
    if (descendantPersonIds(dragged.id, nodes).contains(target.id)) {
      return const AxisDropResult.rejected('不能移动到自己的下级里，否则会形成闭环');
    }
    if (dragged.parentId == null) {
      return const AxisDropResult.rejected('根节点不能拖到其他人员下面');
    }
    if (personLevel(target.id, nodes) + 1 > axisMaxPersonLevels) {
      return const AxisDropResult.rejected('人员最多四层（终责人 + 三层下属），请调整上级或移交到其他人员');
    }
    if (!canAddUnderTarget) {
      return const AxisDropResult.rejected('目标人员未开放“新增直属下属”权限');
    }
    return const AxisDropResult.allowed();
  }

  static List<AxisPersonNode> supervisorCandidates({
    required AxisPersonNode? current,
    required List<AxisPersonNode> nodes,
    String query = '',
  }) {
    final descendants = current == null
        ? <int>{}
        : descendantPersonIds(current.id, nodes);
    final q = query.trim().toLowerCase();
    return nodes.where((candidate) {
      if (current != null && candidate.id == current.id) return false;
      if (descendants.contains(candidate.id)) return false;
      if (current != null &&
          candidate.ownerUserIds.any(current.ownerUserIds.contains)) {
        return false;
      }
      if (q.isEmpty) return true;
      return candidate.name.toLowerCase().contains(q) ||
          candidate.roleTitle.toLowerCase().contains(q);
    }).toList();
  }

  static String? delegationValidTo(DateTime? day) {
    if (day == null) return null;
    return DateTime(
      day.year,
      day.month,
      day.day,
      23,
      59,
      59,
    ).toUtc().toIso8601String();
  }

  static String formatDateOnly(DateTime? date) =>
      date == null ? '' : DateFormat('yyyy-MM-dd').format(date);
  static String formatDateTime(DateTime? date) =>
      date == null ? '' : DateFormat('yyyy-MM-dd HH:mm').format(date);
}
