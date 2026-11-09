import 'dart:math' as math;
import 'dart:ui';

import '../data/axis_fold.dart';
import '../data/axis_models.dart';
import '../data/axis_view_models.dart';
import '../data/axis_timeline.dart';

class AxisConnection {
  const AxisConnection({
    required this.fromId,
    required this.toId,
    required this.start,
    required this.end,
    required this.fromCenter,
    required this.toCenter,
    this.fromRect,
  });

  final int fromId;
  final int toId;
  final Offset start;
  final Offset end;
  final Offset fromCenter;
  final Offset toCenter;

  /// 出发方的占位矩形：领导卡片加上他的折叠组。画线时以它为锚点，
  /// 连线才会从折叠组外沿出发，不压在折叠行背后。
  final Rect? fromRect;

  String get id => '$fromId-$toId';
}

class AxisPlacedPerson {
  const AxisPlacedPerson({
    required this.node,
    required this.rect,
    required this.station,
    required this.isTerminal,
  });

  final AxisPersonNode node;
  final Rect rect;
  final int station;
  final bool isTerminal;

  Offset get center => rect.center;

  AxisPlacedPerson translated(Offset delta) => AxisPlacedPerson(
        node: node,
        rect: rect.shift(delta),
        station: station,
        isTerminal: isTerminal,
      );
}

/// 领导卡片下方折叠组里的一位下属：折叠时是一行，展开后是完整卡片。
class AxisFoldedMember {
  const AxisFoldedMember({
    required this.node,
    required this.rect,
    required this.expanded,
  });

  final AxisPersonNode node;
  final Rect rect;
  final bool expanded;
}

/// 一位领导的折叠组：竖线从领导卡片底部连到第一行。
class AxisFoldedStack {
  const AxisFoldedStack({
    required this.leaderId,
    required this.stemStart,
    required this.stemEnd,
    required this.members,
  });

  final int leaderId;
  final Offset stemStart;
  final Offset stemEnd;
  final List<AxisFoldedMember> members;
}

class AxisFlowResult {
  const AxisFlowResult({
    required this.people,
    required this.connections,
    required this.size,
    required this.autoRects,
    this.minCorner = Offset.zero,
    this.stacks = const [],
    this.bounds,
    this.timeline,
  });

  final List<AxisPlacedPerson> people;

  /// 折叠组（fold 为 null 时为空）。
  final List<AxisFoldedStack> stacks;
  final List<AxisConnection> connections;
  final Size size;
  final Map<int, Rect> autoRects;

  /// 卡片可被拖到负坐标；这里记录左上角的最小值（不大于 0），供“适应屏幕”使用。
  final Offset minCorner;

  /// 全部卡片与折叠组的真实外接范围（含负坐标，不含画布边距）。
  final Rect? bounds;
  final AxisTimeline? timeline;

  /// 全部卡片占据的范围，含负坐标；“适应屏幕”按它居中。
  Rect get contentBounds =>
      bounds ??
      Rect.fromLTRB(minCorner.dx, minCorner.dy, size.width, size.height);

  AxisPlacedPerson? personById(int id) {
    for (final person in people) {
      if (person.node.id == id) return person;
    }
    return null;
  }
}

class AxisFlowLayout {
  const AxisFlowLayout._();

  static const Size personCardSize = Size(240, 168);
  static const double levelGap = 88;
  static const double siblingGap = 48;
  static const double foldedRowHeight = 44;
  static const double foldedRowGap = 6;
  static const double foldedStemHeight = 12;

  static AxisFlowResult compute({
    required List<AxisPersonNode> nodes,
    required AxisOrientation orientation,
    required AxisSpacing spacing,
    required AxisSort sort,
    Map<int, Offset> offsets = const {},
    bool resetLayout = false,
    AxisFoldSpec? fold,
  }) {
    final memberIds = fold == null ? null : axisMemberIds(nodes, fold);
    final allNodes = nodes;
    if (memberIds != null) {
      nodes = [
        for (final node in allNodes)
          if (memberIds.contains(node.id)) node,
      ];
    }
    final byId = {for (final node in nodes) node.id: node};
    final children = <int, List<AxisPersonNode>>{};
    final roots = <AxisPersonNode>[];
    for (final node in nodes) {
      if (node.parentId == null || !byId.containsKey(node.parentId)) {
        roots.add(node);
      } else {
        children.putIfAbsent(node.parentId!, () => []).add(node);
      }
    }

    DateTime? nearestDue(AxisPersonNode node) {
      final dates = <DateTime>[];
      for (final item in node.workItems) {
        if (item.dueAt != null && !item.isDone) dates.add(item.dueAt!);
      }
      if (dates.isEmpty) return null;
      dates.sort();
      return dates.first;
    }

    int compare(AxisPersonNode a, AxisPersonNode b) {
      if (sort == AxisSort.time) {
        final at = nearestDue(a);
        final bt = nearestDue(b);
        if (at == null && bt != null) return 1;
        if (at != null && bt == null) return -1;
        if (at != null && bt != null) {
          final byDate = at.compareTo(bt);
          if (byDate != 0) return byDate;
        }
      }
      final byOrder = a.sortOrder.compareTo(b.sortOrder);
      return byOrder != 0 ? byOrder : a.id.compareTo(b.id);
    }

    roots.sort(compare);
    for (final list in children.values) {
      list.sort(compare);
    }

    // 折叠组：上轴领导的直属下属里没上轴的人，一行一张排在领导正下方。
    final foldedOf = <int, List<AxisPersonNode>>{};
    if (memberIds != null) {
      for (final node in allNodes) {
        final parentId = node.parentId;
        if (memberIds.contains(node.id) ||
            parentId == null ||
            !memberIds.contains(parentId) ||
            fold!.hiddenStacks.contains(parentId)) {
          continue;
        }
        foldedOf.putIfAbsent(parentId, () => []).add(node);
      }
      for (final list in foldedOf.values) {
        list.sort(compare);
      }
    }

    double stackHeight(int leaderId) {
      final list = foldedOf[leaderId];
      if (list == null || list.isEmpty) return 0;
      var total = foldedStemHeight + foldedRowGap * (list.length - 1);
      for (final member in list) {
        total += fold!.expandedRows.contains(member.id)
            ? personCardSize.height
            : foldedRowHeight;
      }
      return total;
    }

    // 足迹 = 卡片 + 折叠组；横向计入 cross 跨度，纵向计入层高。
    double footprintOf(AxisPersonNode node) =>
        personCardSize.height + stackHeight(node.id);

    final horizontal = orientation == AxisOrientation.horizontal;
    final crossGap = siblingGap * spacing.siblingFactor;
    final levelStep =
        (horizontal ? personCardSize.width : personCardSize.height) + levelGap;
    final spanMemo = <int, double>{};

    double crossOf(AxisPersonNode node) =>
        horizontal ? footprintOf(node) : personCardSize.width;

    double spanOf(AxisPersonNode node) {
      final cached = spanMemo[node.id];
      if (cached != null) return cached;
      final own = crossOf(node);
      final childList = children[node.id] ?? const <AxisPersonNode>[];
      if (childList.isEmpty) return spanMemo[node.id] = own;
      final childrenSpan =
          childList.fold<double>(0, (sum, child) => sum + spanOf(child)) +
              crossGap * (childList.length - 1);
      return spanMemo[node.id] = math.max(own, childrenSpan);
    }

    // 纵向每层的起点：上一层最大足迹 + 层间距；横向沿用固定层宽。
    final levelHeights = <int, double>{};
    void measure(AxisPersonNode node, int level) {
      levelHeights[level] =
          math.max(levelHeights[level] ?? 0, footprintOf(node));
      for (final child in children[node.id] ?? const <AxisPersonNode>[]) {
        measure(child, level + 1);
      }
    }

    for (final root in roots) {
      measure(root, 0);
    }
    final levelStarts = <int, double>{};
    double alongOf(int level) {
      if (horizontal) return level * levelStep;
      final cached = levelStarts[level];
      if (cached != null) return cached;
      if (level == 0) return levelStarts[0] = 0;
      return levelStarts[level] =
          alongOf(level - 1) + (levelHeights[level - 1] ?? 0) + levelGap;
    }

    final autoRects = <int, Rect>{};
    var rootCross = 0.0;
    void place(AxisPersonNode node, double crossStart, int level) {
      final nodeSpan = spanOf(node);
      final childList = children[node.id] ?? const <AxisPersonNode>[];
      final along = alongOf(level);
      final cross = crossStart + (nodeSpan - crossOf(node)) / 2;
      final rect = horizontal
          ? Rect.fromLTWH(
              along,
              cross,
              personCardSize.width,
              personCardSize.height,
            )
          : Rect.fromLTWH(
              cross,
              along,
              personCardSize.width,
              personCardSize.height,
            );
      autoRects[node.id] = rect;
      var childCross = crossStart;
      for (final child in childList) {
        place(child, childCross, level + 1);
        childCross += spanOf(child) + crossGap;
      }
    }

    for (final root in roots) {
      place(root, rootCross, 0);
      rootCross += spanOf(root) + crossGap * 2;
    }

    final people = <AxisPlacedPerson>[];
    for (var i = 0; i < nodes.length; i++) {
      final node = nodes[i];
      final autoRect = autoRects[node.id];
      if (autoRect == null) continue;
      final manual =
          resetLayout ? Offset.zero : (offsets[node.id] ?? Offset.zero);
      people.add(
        AxisPlacedPerson(
          node: node,
          rect: autoRect.shift(manual),
          station: i,
          isTerminal: node.isTerminalPm,
        ),
      );
    }

    AxisPlacedPerson? personOf(int id) {
      for (final person in people) {
        if (person.node.id == id) return person;
      }
      return null;
    }

    final stacks = <AxisFoldedStack>[];
    for (final person in people) {
      final list = foldedOf[person.node.id];
      if (list == null || list.isEmpty) continue;
      final rect = person.rect;
      final stemStart = Offset(rect.center.dx, rect.bottom);
      final stemEnd = Offset(rect.center.dx, rect.bottom + foldedStemHeight);
      var top = stemEnd.dy;
      final members = <AxisFoldedMember>[];
      for (final node in list) {
        final expanded = fold!.expandedRows.contains(node.id);
        final height = expanded ? personCardSize.height : foldedRowHeight;
        members.add(
          AxisFoldedMember(
            node: node,
            rect: Rect.fromLTWH(rect.left, top, personCardSize.width, height),
            expanded: expanded,
          ),
        );
        top += height + foldedRowGap;
      }
      stacks.add(
        AxisFoldedStack(
          leaderId: person.node.id,
          stemStart: stemStart,
          stemEnd: stemEnd,
          members: members,
        ),
      );
    }

    final stackBottomOf = <int, double>{
      for (final stack in stacks)
        if (stack.members.isNotEmpty)
          stack.leaderId: stack.members.last.rect.bottom,
    };
    final connections = <AxisConnection>[];
    for (final person in people) {
      final parentId = person.node.parentId;
      if (parentId == null) continue;
      final parent = personOf(parentId);
      if (parent == null) continue;
      // 有折叠组时，占位矩形向下延伸到最后一行的底部。
      final stackBottom = stackBottomOf[parent.node.id];
      final fromRect = stackBottom == null
          ? parent.rect
          : Rect.fromLTRB(
              parent.rect.left,
              parent.rect.top,
              parent.rect.right,
              math.max(parent.rect.bottom, stackBottom),
            );
      final start = horizontal
          ? Offset(fromRect.right, parent.rect.center.dy)
          : Offset(fromRect.center.dx, fromRect.bottom);
      final end = horizontal
          ? Offset(person.rect.left, person.rect.center.dy)
          : Offset(person.rect.center.dx, person.rect.top);
      connections.add(
        AxisConnection(
          fromId: parent.node.id,
          toId: person.node.id,
          start: start,
          end: end,
          fromCenter: parent.rect.center,
          toCenter: person.rect.center,
          fromRect: fromRect,
        ),
      );
    }

    var maxX = personCardSize.width;
    var maxY = personCardSize.height;
    var minX = 0.0;
    var minY = 0.0;
    // 真实外接范围：只统计卡片与折叠行，不含原点和边距。
    var realMinX = double.infinity;
    var realMinY = double.infinity;
    var realMaxX = double.negativeInfinity;
    var realMaxY = double.negativeInfinity;
    void cover(Rect r) {
      realMinX = math.min(realMinX, r.left);
      realMinY = math.min(realMinY, r.top);
      realMaxX = math.max(realMaxX, r.right);
      realMaxY = math.max(realMaxY, r.bottom);
    }

    for (final person in people) {
      cover(person.rect);
      maxX = math.max(maxX, person.rect.right);
      maxY = math.max(maxY, person.rect.bottom);
      minX = math.min(minX, person.rect.left);
      minY = math.min(minY, person.rect.top);
    }
    for (final stack in stacks) {
      for (final member in stack.members) {
        cover(member.rect);
        maxX = math.max(maxX, member.rect.right);
        maxY = math.max(maxY, member.rect.bottom);
        minX = math.min(minX, member.rect.left);
        minY = math.min(minY, member.rect.top);
      }
    }
    final cross = (horizontal ? realMinY : realMinX);
    final timeline = sort == AxisSort.time
        ? buildAxisTimeline(allNodes,
            orientation: orientation,
            cross: (cross.isFinite ? math.min(0, cross) : 0) - 100)
        : null;
    if (timeline != null && timeline.items.isNotEmpty) {
      cover(timeline.bounds);
      minX = math.min(minX, timeline.bounds.left);
      minY = math.min(minY, timeline.bounds.top);
      maxX = math.max(maxX, timeline.bounds.right);
      maxY = math.max(maxY, timeline.bounds.bottom);
    }
    final size = Size(maxX + 96, maxY + 96);
    return AxisFlowResult(
      people: people,
      connections: connections,
      size: size,
      autoRects: autoRects,
      minCorner: Offset(minX, minY),
      stacks: stacks,
      timeline: timeline,
      bounds: realMinX.isFinite
          ? Rect.fromLTRB(realMinX, realMinY, realMaxX, realMaxY)
          : Rect.fromLTWH(0, 0, personCardSize.width, personCardSize.height),
    );
  }
}
