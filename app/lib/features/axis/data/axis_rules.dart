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
    this.nodeOrigin,
  });
  final int id;
  final bool isPerson;
  final int? parentId;
  final String? nodeOrigin;
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

  /// 计算以 [nodeId] 为根的人员子树高度（自己算 1 层）。
  static int subtreePersonHeight(int nodeId, List<AxisPersonNode> nodes) {
    final children = nodes.where((node) => node.parentId == nodeId).toList();
    if (children.isEmpty) return 1;
    var maxChildHeight = 0;
    for (final child in children) {
      final h = subtreePersonHeight(child.id, nodes);
      if (h > maxChildHeight) maxChildHeight = h;
    }
    return 1 + maxChildHeight;
  }

  static AxisDropResult validateDrop({
    required AxisDragSubject dragged,
    required AxisDragSubject? target,
    required List<AxisPersonNode> nodes,
    bool allowRootTarget = false,
    bool canAddUnderTarget = true,
    bool hasPermission = true,
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

    final byId = {for (final node in nodes) node.id: node};
    final draggedNode = byId[dragged.id];
    final targetNode = byId[target.id];
    final parentId = draggedNode?.parentId ?? dragged.parentId;
    final draggedOrigin = dragged.nodeOrigin ??
        draggedNode?.nodeOrigin ??
        (parentId == null ? 'project' : 'subordinate');
    final targetOrigin = target.nodeOrigin ??
        targetNode?.nodeOrigin ??
        (targetNode?.parentId == null ? 'project' : 'subordinate');

    // 严格按 CARD-SPEC 第 3 节六条规则顺序判定：
    // 1. 拖的是根节点 →「终责人不能挂到别人下面」
    if (parentId == null) {
      return const AxisDropResult.rejected('终责人不能挂到别人下面');
    }
    // 2. 目标就是当前上级 →「已经是他的上级」
    if (parentId == target.id) {
      return const AxisDropResult.rejected('已经是他的上级');
    }
    // 3. 目标是自己的后代 →「不能挂到自己的下属下面」
    if (descendantPersonIds(dragged.id, nodes).contains(target.id)) {
      return const AxisDropResult.rejected('不能挂到自己的下属下面');
    }
    // 4. 目标层级 + 被拖子树人员高度 > 4 →「人员最多四层」
    final targetLevel = personLevel(target.id, nodes);
    final dragSubtreeHeight = subtreePersonHeight(dragged.id, nodes);
    if (targetLevel + dragSubtreeHeight > axisMaxPersonLevels) {
      return const AxisDropResult.rejected('人员最多四层');
    }
    // 5. 被拖节点 node_origin=='project' 且目标 node_origin=='subordinate' →「项目成员不能挂到下级自建人员下面」
    if (draggedOrigin == 'project' && targetOrigin == 'subordinate') {
      return const AxisDropResult.rejected('项目成员不能挂到下级自建人员下面');
    }
    // 6. 当前用户对源或目标无权限 →「没有权限调整此人的上级」
    if (!canAddUnderTarget || !hasPermission) {
      return const AxisDropResult.rejected('没有权限调整此人的上级');
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
