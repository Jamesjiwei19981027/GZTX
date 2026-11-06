import 'axis_models.dart';

/// 人轴“项目全貌”的折叠状态：哪些人被拉到人轴、哪些折叠行已展开、哪些领导的折叠组被隐藏。
///
/// 只在本机生效，不进树节点数据。
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

/// 上轴人员：根人员 + 当前用户的所有上级 + 被拉出且父级也上轴的人。
///
/// 失效的拉出 id（已删除、父级未上轴）直接忽略；循环算到稳定，防环。
Set<int> axisMemberIds(List<AxisPersonNode> nodes, AxisFoldSpec spec) {
  final byId = {for (final node in nodes) node.id: node};
  final members = <int>{};
  for (final node in nodes) {
    if (node.parentId == null || !byId.containsKey(node.parentId)) {
      members.add(node.id);
    }
  }
  final selfId = spec.selfId;
  if (selfId != null && byId.containsKey(selfId)) {
    members.addAll(revealAncestors(nodes, selfId));
  }
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
