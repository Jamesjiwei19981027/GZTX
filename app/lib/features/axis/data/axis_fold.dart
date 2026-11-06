import 'dart:math' as math;

import 'axis_models.dart';

/// 第 2 层默认上轴名额（常量 5，超过此名额的第 2 层人员默认折叠）。
const int axisDefaultVisiblePerLevel = 5;

/// 默认展开层数（常量 2，第 1 层根人员 + 第 2 层默认名额内的人；第 3 层及以下默认折叠）。
const int axisDefaultVisibleDepth = 2;

/// 人轴“项目全貌”的折叠状态：哪些人被拉到人轴、哪些折叠行已展开、哪些领导的折叠组被隐藏。
///
/// 遵循产品规则：
/// 1. 仅根人员、拉出人员与当前用户所有上级作为完整卡片上轴；
/// 2. 上轴人员的直属下属中未上轴者默认折叠，在领导卡片正下方垂直排列；
/// 3. 本地状态按操作者与项目隔离持久化（用户 ID + 项目 ID），展开/折叠行仅保存在内存中。
class AxisFoldSpec {
  const AxisFoldSpec({
    this.pulled = const {},
    this.expandedRows = const {},
    this.hiddenStacks = const {},
    this.selfId,
  });

  /// 被当前用户拉到人轴的人员 id。
  final Set<int> pulled;

  /// 已就地展开成完整卡片的折叠行（仅内存）。
  final Set<int> expandedRows;

  /// 折叠组被“下属 n”按钮整体隐藏的领导 id。
  final Set<int> hiddenStacks;

  /// 当前用户自己的人员节点 id；其所有上级默认上轴。
  final int? selfId;
}

/// 上轴人员 = 第 1 层全部 + 第 2 层默认名额内的人 + 拉出的人（父级须上轴）+ 当前用户所有上级。
///
/// 名额分配：按整个项目的第 2 层统计，多根时跨根合计。
/// 拉出的人和当前用户上级链上的人先占名额（他们本身永远上轴，超过 5 也不折叠），
/// 剩余名额按现有显示顺序（根的顺序，再按兄弟排序 sort_order、id）给其余第 2 层人员，排不上的折叠到各自领导下方。
/// 第 3 层及以下：默认折叠。
/// 失效的拉出 id（已删除、父级未上轴）直接忽略；循环算到稳定，防环。
Set<int> axisMemberIds(List<AxisPersonNode> nodes, AxisFoldSpec spec) {
  final byId = {for (final node in nodes) node.id: node};

  int compareNode(AxisPersonNode a, AxisPersonNode b) {
    final order = a.sortOrder.compareTo(b.sortOrder);
    return order != 0 ? order : a.id.compareTo(b.id);
  }

  // 1. 识别根节点（第 1 层人员：parentId 为 null 或 parent 不在 nodes 中）
  final roots = <AxisPersonNode>[];
  final children = <int, List<AxisPersonNode>>{};
  for (final node in nodes) {
    final parentId = node.parentId;
    if (parentId == null || !byId.containsKey(parentId)) {
      roots.add(node);
    } else {
      children.putIfAbsent(parentId, () => []).add(node);
    }
  }

  roots.sort(compareNode);
  for (final list in children.values) {
    list.sort(compareNode);
  }

  // 第 1 层全部上轴
  final members = <int>{for (final r in roots) r.id};

  // 当前用户本人的所有上级上轴（无论在哪一层）
  final ancestors = <int>{};
  final selfId = spec.selfId;
  if (selfId != null && byId.containsKey(selfId)) {
    ancestors.addAll(revealAncestors(nodes, selfId));
  }
  members.addAll(ancestors);

  // 2. 收集整个项目的第 2 层人员列表（按现有显示顺序：根的顺序，再按兄弟排序 sort_order、id）
  final level2Nodes = <AxisPersonNode>[];
  for (final root in roots) {
    final rootChildren = children[root.id];
    if (rootChildren != null) {
      level2Nodes.addAll(rootChildren);
    }
  }

  // 3. 第 2 层名额分配：
  // 拉出的人和当前用户上级链上的人先占名额（他们本身永远上轴，超过 5 也不折叠）
  final tier2Must = <int>{};
  for (final node in level2Nodes) {
    if (spec.pulled.contains(node.id) || ancestors.contains(node.id)) {
      tier2Must.add(node.id);
    }
  }
  members.addAll(tier2Must);

  // 剩余名额分配给其余第 2 层人员
  final remainingQuota =
      math.max(0, axisDefaultVisiblePerLevel - tier2Must.length);
  var allocated = 0;
  for (final node in level2Nodes) {
    if (tier2Must.contains(node.id)) continue;
    if (allocated < remainingQuota) {
      members.add(node.id);
      allocated++;
    }
  }

  // 4. 拉出的人（父级须上轴）：循环算到稳定，防环，失效 id 忽略
  var changed = true;
  while (changed) {
    changed = false;
    for (final id in spec.pulled) {
      final node = byId[id];
      if (node == null || members.contains(id)) continue;
      if (members.contains(node.parentId)) {
        members.add(id);
        changed = true;
      }
    }
  }

  return members;
}

/// id 的全部上级（不含自己），从近到远；遇环或断链即停。
Set<int> revealAncestors(List<AxisPersonNode> nodes, int id) {
  final byId = {for (final node in nodes) node.id: node};
  final result = <int>{};
  var current = byId[id];
  while (current != null) {
    final parentId = current.parentId;
    if (parentId == null || parentId == id || !result.add(parentId)) break;
    current = byId[parentId];
  }
  result.remove(id);
  return result;
}

/// id 及其下被拉出的人（沿直属下属向下，只收 [pulled] 里的），供“收回”。
Set<int> pulledSubtree(List<AxisPersonNode> nodes, int id, Set<int> pulled) {
  final children = <int, List<int>>{};
  for (final node in nodes) {
    final parentId = node.parentId;
    if (parentId != null) children.putIfAbsent(parentId, () => []).add(node.id);
  }
  final result = <int>{id};
  final queue = <int>[id];
  while (queue.isNotEmpty) {
    final current = queue.removeLast();
    for (final child in children[current] ?? const <int>[]) {
      if (pulled.contains(child) && result.add(child)) queue.add(child);
    }
  }
  return result;
}

/// 判断指定人员是否可以“收回”：
/// 只有收回后此人确实会离开人轴才显示。
/// 判定方法：把他及 [pulledSubtree] 从拉出集合移除后重新计算上轴人员，
/// 若他不再上轴才给“收回”；默认名额内的人不显示。根与当前用户上级链仍不提供。
bool canReturnPerson(
  List<AxisPersonNode> nodes,
  AxisFoldSpec? spec,
  int nodeId,
) {
  if (spec == null) return false;
  if (!spec.pulled.contains(nodeId)) return false;
  final byId = {for (final node in nodes) node.id: node};
  final node = byId[nodeId];
  if (node == null) return false;
  // 根人员不提供收回
  final parentId = node.parentId;
  if (parentId == null || !byId.containsKey(parentId)) return false;
  // 当前用户上级链上的人不提供收回
  if (spec.selfId != null &&
      byId.containsKey(spec.selfId) &&
      revealAncestors(nodes, spec.selfId!).contains(nodeId)) {
    return false;
  }
  // 必须当前在上轴人员中
  final currentMembers = axisMemberIds(nodes, spec);
  if (!currentMembers.contains(nodeId)) return false;

  // 判定：把他及 pulledSubtree 从拉出集合移除后重新计算上轴人员
  final subtree = pulledSubtree(nodes, nodeId, spec.pulled);
  final remainingPulled = Set<int>.of(spec.pulled)..removeAll(subtree);
  final nextSpec = AxisFoldSpec(
    pulled: remainingPulled,
    expandedRows: spec.expandedRows,
    hiddenStacks: spec.hiddenStacks,
    selfId: spec.selfId,
  );
  final nextMembers = axisMemberIds(nodes, nextSpec);
  // 他不再上轴才给“收回”
  return !nextMembers.contains(nodeId);
}

/// 计算所有可提供“收回”操作的人员 id 集合。
Set<int> returnableMemberIds(List<AxisPersonNode> nodes, AxisFoldSpec? spec) {
  if (spec == null || spec.pulled.isEmpty) return const {};
  final result = <int>{};
  for (final id in spec.pulled) {
    if (canReturnPerson(nodes, spec, id)) {
      result.add(id);
    }
  }
  return result;
}
