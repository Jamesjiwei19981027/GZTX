import 'dart:math' as math;
import 'dart:ui';

import '../data/axis_models.dart';
import '../data/axis_view_models.dart';

class AxisConnection {
  const AxisConnection({
    required this.fromId,
    required this.toId,
    required this.start,
    required this.end,
    required this.fromCenter,
    required this.toCenter,
  });

  final int fromId;
  final int toId;
  final Offset start;
  final Offset end;
  final Offset fromCenter;
  final Offset toCenter;

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

class AxisFlowResult {
  const AxisFlowResult({
    required this.people,
    required this.connections,
    required this.size,
    required this.autoRects,
  });

  final List<AxisPlacedPerson> people;
  final List<AxisConnection> connections;
  final Size size;
  final Map<int, Rect> autoRects;

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

  static AxisFlowResult compute({
    required List<AxisPersonNode> nodes,
    required AxisOrientation orientation,
    required AxisSpacing spacing,
    required AxisSort sort,
    Map<int, Offset> offsets = const {},
    bool resetLayout = false,
  }) {
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
        if (item.dueAt != null) dates.add(item.dueAt!);
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

    final horizontal = orientation == AxisOrientation.horizontal;
    final crossCard = horizontal ? personCardSize.height : personCardSize.width;
    final crossGap = siblingGap * spacing.siblingFactor;
    final levelStep =
        (horizontal ? personCardSize.width : personCardSize.height) + levelGap;
    final spanMemo = <int, double>{};

    double spanOf(AxisPersonNode node) {
      final cached = spanMemo[node.id];
      if (cached != null) return cached;
      final childList = children[node.id] ?? const <AxisPersonNode>[];
      if (childList.isEmpty) return spanMemo[node.id] = crossCard;
      final childrenSpan =
          childList.fold<double>(0, (sum, child) => sum + spanOf(child)) +
              crossGap * (childList.length - 1);
      return spanMemo[node.id] = math.max(crossCard, childrenSpan);
    }

    final autoRects = <int, Rect>{};
    var rootCross = 0.0;
    void place(AxisPersonNode node, double crossStart, int level) {
      final nodeSpan = spanOf(node);
      final childList = children[node.id] ?? const <AxisPersonNode>[];
      final along = level * levelStep;
      final cross = crossStart + (nodeSpan - crossCard) / 2;
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

    final connections = <AxisConnection>[];
    for (final person in people) {
      final parentId = person.node.parentId;
      if (parentId == null) continue;
      final parent = personOf(parentId);
      if (parent == null) continue;
      final start = horizontal
          ? Offset(parent.rect.right, parent.rect.center.dy)
          : Offset(parent.rect.center.dx, parent.rect.bottom);
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
        ),
      );
    }

    var maxX = personCardSize.width;
    var maxY = personCardSize.height;
    for (final person in people) {
      maxX = math.max(maxX, person.rect.right);
      maxY = math.max(maxY, person.rect.bottom);
    }
    final size = Size(maxX + 96, maxY + 96);
    return AxisFlowResult(
      people: people,
      connections: connections,
      size: size,
      autoRects: autoRects,
    );
  }
}
