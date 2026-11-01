import 'dart:math' as math;
import 'dart:ui';

import 'package:intl/intl.dart';

import '../data/axis_models.dart';
import '../data/axis_view_models.dart';

enum AxisConnectionType { personToPerson, personToMatter }

class AxisConnection {
  const AxisConnection({
    required this.fromId,
    required this.toId,
    required this.type,
    required this.start,
    required this.end,
    required this.bow,
  });

  final int fromId;
  final int toId;
  final AxisConnectionType type;
  final Offset start;
  final Offset end;

  /// 曲线向主干外侧弓出的距离，拖动时会随两张卡片距离变化。
  final double bow;
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

class AxisPlacedMatter {
  const AxisPlacedMatter({
    required this.item,
    required this.ownerId,
    required this.rect,
  });

  final AxisWorkItem item;
  final int ownerId;
  final Rect rect;
}

class AxisTimeTick {
  const AxisTimeTick({required this.at, required this.label});

  final Offset at;
  final String label;
}

class AxisFlowResult {
  const AxisFlowResult({
    required this.people,
    required this.matters,
    required this.connections,
    required this.size,
    required this.spineStart,
    required this.spineEnd,
    required this.ticks,
    required this.autoRects,
  });

  final List<AxisPlacedPerson> people;
  final List<AxisPlacedMatter> matters;
  final List<AxisConnection> connections;
  final Size size;
  final Offset spineStart;
  final Offset spineEnd;
  final List<AxisTimeTick> ticks;

  /// 未叠加手动偏移时的自动位置，用来把拖动结果换算成 `ui_offset`。
  final Map<int, Rect> autoRects;

  AxisPlacedPerson? personById(int id) {
    for (final person in people) {
      if (person.node.id == id) return person;
    }
    return null;
  }
}

/// 人轴画布布局：所有人员排在同一条主干上，事项挂在各自人员侧边。
///
/// - 主干只排人（产品锁定规则）；
/// - 终责人卡片固定在主干终点，偏移由服务端 `final_owner_along_delta` 控制；
/// - 树序按创建顺序，时间序按到期时间排序，并在主干上画时间刻度。
class AxisFlowLayout {
  const AxisFlowLayout._();

  static AxisPlacedPerson? _personOf(
    List<AxisPlacedPerson> people,
    int id,
  ) {
    for (final person in people) {
      if (person.node.id == id) return person;
    }
    return null;
  }

  static const Size personCardSize = Size(220, 96);
  static const Size matterCardSize = Size(152, 56);
  static const double spinePadding = 130;
  static const double matterGap = 14;
  static const double matterSpacing = 62;
  static const int maxVisibleMatters = 3;
  static const double terminalExtraGap = 56;
  static const double crossInset = 92;

  static AxisFlowResult compute({
    required List<AxisPersonNode> nodes,
    required AxisOrientation orientation,
    required AxisSpacing spacing,
    required AxisSort sort,
    Map<int, Offset> offsets = const {},
    double finalOwnerAlongDelta = 0,
    bool resetLayout = false,
    double textScale = 1.0,
  }) {
    final scale = textScale.clamp(1.0, 2.0);
    final personSize = Size(
      personCardSize.width + (scale - 1) * 44,
      personCardSize.height + (scale - 1) * 56,
    );
    final matterSize = Size(
      matterCardSize.width + (scale - 1) * 34,
      matterCardSize.height + (scale - 1) * 30,
    );
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

    int compare(AxisPersonNode a, AxisPersonNode b) {
      if (sort == AxisSort.time) {
        final at = a.dueAt ?? a.startAt;
        final bt = b.dueAt ?? b.startAt;
        if (at == null && bt != null) return 1;
        if (at != null && bt == null) return -1;
        if (at != null && bt != null && at != bt) return at.compareTo(bt);
        return a.sortOrder.compareTo(b.sortOrder);
      }
      final byOrder = a.sortOrder.compareTo(b.sortOrder);
      return byOrder != 0 ? byOrder : a.id.compareTo(b.id);
    }

    roots.sort(compare);
    children.forEach((_, list) => list.sort(compare));

    // 终责人最后排（即使挂在树中，也只出现在轴末一次）。
    final terminal = nodes.where((n) => n.isTerminalPm).toList();
    final terminalNode = terminal.isEmpty ? null : terminal.first;

    final ordered = <AxisPersonNode>[];
    final visited = <int>{};
    void walk(AxisPersonNode node) {
      if (node.isTerminalPm || !visited.add(node.id)) return;
      ordered.add(node);
      for (final child in children[node.id] ?? const <AxisPersonNode>[]) {
        walk(child);
      }
    }

    for (final root in roots) {
      walk(root);
    }
    // 环或缺失父节点的兜底：仍保证所有非终责人员可见。
    for (final node in nodes) {
      if (!node.isTerminalPm && !visited.contains(node.id)) {
        visited.add(node.id);
        ordered.add(node);
      }
    }
    if (terminalNode != null) ordered.add(terminalNode);

    final horizontal = orientation == AxisOrientation.horizontal;
    final gap = spacing.stationGap + (scale - 1) * 44;
    final matterStep = matterSpacing + (scale - 1) * 34;
    var along = spinePadding;
    final people = <AxisPlacedPerson>[];
    final matters = <AxisPlacedMatter>[];
    final autoRects = <int, Rect>{};
    final ticks = <AxisTimeTick>[];

    for (var index = 0; index < ordered.length; index++) {
      final node = ordered[index];
      if (index > 0) {
        along += gap;
        if (node.isTerminalPm) along += terminalExtraGap;
      }
      if (node.isTerminalPm) along += finalOwnerAlongDelta;

      final autoRect = horizontal
          ? Rect.fromCenter(
              center: Offset(along, spinePadding),
              width: personSize.width,
              height: personSize.height,
            )
          : Rect.fromCenter(
              center: Offset(spinePadding, along),
              width: personSize.width,
              height: personSize.height,
            );
      autoRects[node.id] = autoRect;

      final manual = resetLayout ? Offset.zero : (offsets[node.id] ?? Offset.zero);
      final rect = autoRect.shift(manual);
      people.add(AxisPlacedPerson(
        node: node,
        rect: rect,
        station: index,
        isTerminal: node.isTerminalPm,
      ));

      if (sort == AxisSort.time) {
        final at = node.dueAt ?? node.startAt;
        final label = at == null ? '未排期' : DateFormat('MM-dd').format(at);
        ticks.add(AxisTimeTick(
          at: horizontal
              ? Offset(rect.center.dx, rect.top)
              : Offset(rect.left, rect.center.dy),
          label: label,
        ));
      }

      final visibleMatters =
          node.workItems.take(maxVisibleMatters).toList(growable: false);
      for (var i = 0; i < visibleMatters.length; i++) {
        final offsetAlong =
            (i - (visibleMatters.length - 1) / 2) * matterStep;
        final matterRect = horizontal
            ? Rect.fromCenter(
                center: Offset(
                  rect.center.dx + offsetAlong,
                  rect.bottom + matterGap + matterSize.height / 2,
                ),
                width: matterSize.width,
                height: matterSize.height,
              )
            : Rect.fromCenter(
                center: Offset(
                  rect.right + matterGap + matterSize.width / 2,
                  rect.center.dy + offsetAlong,
                ),
                width: matterSize.width,
                height: matterSize.height,
              );
        matters.add(AxisPlacedMatter(
          item: visibleMatters[i],
          ownerId: node.id,
          rect: matterRect,
        ));
      }
    }

    final connections = <AxisConnection>[];
    for (final person in people) {
      final parentId = person.node.parentId;
      if (parentId == null) continue;
      final parent = _personOf(people, parentId);
      if (parent == null) continue;
      final start = horizontal
          ? Offset(parent.rect.right, parent.rect.center.dy)
          : Offset(parent.rect.center.dx, parent.rect.bottom);
      final end = horizontal
          ? Offset(person.rect.left, person.rect.center.dy)
          : Offset(person.rect.center.dx, person.rect.top);
      final distance = (end - start).distance;
      connections.add(AxisConnection(
        fromId: parentId,
        toId: person.node.id,
        type: AxisConnectionType.personToPerson,
        start: start,
        end: end,
        bow: math.min(96, 18 + distance * 0.08),
      ));
    }
    for (final matter in matters) {
      final owner = _personOf(people, matter.ownerId);
      if (owner == null) continue;
      final start = horizontal
          ? Offset(owner.rect.center.dx, owner.rect.bottom)
          : Offset(owner.rect.right, owner.rect.center.dy);
      final end = horizontal
          ? Offset(matter.rect.center.dx, matter.rect.top)
          : Offset(matter.rect.left, matter.rect.center.dy);
      connections.add(AxisConnection(
        fromId: owner.node.id,
        toId: matter.item.id,
        type: AxisConnectionType.personToMatter,
        start: start,
        end: end,
        bow: 0,
      ));
    }

    var maxX = 360.0;
    var maxY = 420.0;
    for (final person in people) {
      maxX = math.max(maxX, person.rect.right);
      maxY = math.max(maxY, person.rect.bottom);
    }
    for (final matter in matters) {
      maxX = math.max(maxX, matter.rect.right);
      maxY = math.max(maxY, matter.rect.bottom);
    }
    final size = Size(maxX + 120, maxY + 140);

    final first = people.isEmpty ? null : people.first;
    final last = people.isEmpty ? null : people.last;
    final spineStart = horizontal
        ? Offset(spinePadding - crossInset, first?.rect.center.dy ?? spinePadding)
        : Offset(first?.rect.center.dx ?? spinePadding, spinePadding - crossInset);
    final spineEnd = horizontal
        ? Offset((last?.rect.center.dx ?? spinePadding) + crossInset,
            last?.rect.center.dy ?? spinePadding)
        : Offset(last?.rect.center.dx ?? spinePadding,
            (last?.rect.center.dy ?? spinePadding) + crossInset);

    return AxisFlowResult(
      people: people,
      matters: matters,
      connections: connections,
      size: size,
      spineStart: spineStart,
      spineEnd: spineEnd,
      ticks: ticks,
      autoRects: autoRects,
    );
  }
}
