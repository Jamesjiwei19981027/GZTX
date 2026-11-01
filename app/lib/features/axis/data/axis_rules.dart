import 'package:intl/intl.dart';

import 'axis_models.dart';

/// 拖放校验结果。
class AxisDropResult {
  const AxisDropResult.allowed()
      : allowed = true,
        reason = null;

  const AxisDropResult.rejected(this.reason) : allowed = false;

  final bool allowed;
  final String? reason;
}

/// 拖拽对象（人员卡片或人员下挂的事项卡片）。
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

/// 人员管理最多三层（后端 `tree_service.assert_person_limit` 同口径）。
const int axisMaxPersonLevels = 3;

/// 人轴拖放规则。
///
/// 这些规则与后端 `tree_service.assert_shape` / `assert_person_limit` /
/// `assert_distinct_supervisor` 对齐，只用于客户端提前提示；最终以后端返回为准，
/// 后端拒绝时直接展示后端中文原因。
class AxisRules {
  const AxisRules._();

  /// 计算某人员节点当前处在第几层（根人员 = 1）。
  static int personLevel(int nodeId, List<AxisPersonNode> nodes) {
    final byId = {for (final node in nodes) node.id: node};
    var level = 0;
    int? current = nodeId;
    final seen = <int>{};
    while (current != null && !seen.contains(current)) {
      seen.add(current);
      final node = byId[current];
      if (node == null) break;
      level += 1;
      current = node.parentId;
    }
    return level;
  }

  /// 某节点的全部人员后代（不含自己）。
  static Set<int> descendantPersonIds(int nodeId, List<AxisPersonNode> nodes) {
    final result = <int>{};
    final queue = <int>[nodeId];
    while (queue.isNotEmpty) {
      final current = queue.removeAt(0);
      for (final node in nodes) {
        if (node.parentId == current && result.add(node.id)) {
          queue.add(node.id);
        }
      }
    }
    return result;
  }

  /// 校验一次拖放是否可以改变上下级关系。
  ///
  /// [targetId] 为 null 表示拖到空白处（在画布中表示只调整位置，不改变上级），
  /// 仅显式“设为顶层负责人”才会传 null 并配合 [allowRootTarget]。
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
      if (!allowRootTarget) {
        // 画布空白处 = 调整卡片位置，由布局逻辑处理。
        return const AxisDropResult.allowed();
      }
      if (!dragged.isPerson) {
        return const AxisDropResult.rejected('主干只能排人，事项不能成为顶层节点');
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

    final descendants = descendantPersonIds(dragged.id, nodes);
    if (descendants.contains(target.id)) {
      return const AxisDropResult.rejected('不能移动到自己的下级里，否则会形成闭环');
    }

    final targetLevel = personLevel(target.id, nodes);
    if (targetLevel + 1 > axisMaxPersonLevels) {
      return const AxisDropResult.rejected(
        '人员管理最多允许三层，请调整上级或移交到其他人员',
      );
    }

    if (!canAddUnderTarget) {
      return const AxisDropResult.rejected('目标人员未开放“新增直属下属”权限');
    }

    return const AxisDropResult.allowed();
  }

  /// 调整上级的候选项：排除自己、自己的全部后代、以及与当前人员同一自然人的节点。
  /// 与网页 `MoveSupervisorForm` 的过滤口径一致。
  static List<AxisPersonNode> supervisorCandidates({
    required AxisPersonNode? current,
    required List<AxisPersonNode> nodes,
    String query = '',
  }) {
    final descendants =
        current == null ? <int>{} : descendantPersonIds(current.id, nodes);
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

  /// 终责卡位置只有项目经理或项目创建人能调（后端
  /// `PUT /projects/{id}/final-owner-position` 相同限制）。
  static bool canAdjustFinalOwner({
    required AxisProjectInfo? project,
    required int? userId,
  }) {
    if (project == null || userId == null) return false;
    return userId == project.pmUserId || userId == project.createdBy;
  }

  /// 委托有效期：所选本地日期当天 23:59:59 换成 UTC。
  /// 与网页 `api/delegations.ts::delegationValidTo` 一致。
  static String? delegationValidTo(DateTime? day) {
    if (day == null) return null;
    final localEndOfDay = DateTime(day.year, day.month, day.day, 23, 59, 59);
    return localEndOfDay.toUtc().toIso8601String();
  }

  static String formatDateOnly(DateTime? date) =>
      date == null ? '' : DateFormat('yyyy-MM-dd').format(date);

  static String formatDateTime(DateTime? date) =>
      date == null ? '' : DateFormat('yyyy-MM-dd HH:mm').format(date);
}
