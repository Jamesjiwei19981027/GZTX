import 'dart:ui';

import 'axis_models.dart';
import 'axis_view_models.dart';

class AxisSnapResult {
  const AxisSnapResult({
    required this.position,
    required this.snapped,
    required this.referenceLineStart,
    required this.referenceLineEnd,
  });

  final Offset position;
  final bool snapped;
  final Offset? referenceLineStart;
  final Offset? referenceLineEnd;
}

Set<String> highlightConnectionIds(List<AxisPersonNode> nodes, int? focusId) {
  if (focusId == null) return <String>{};
  final byId = {for (final node in nodes) node.id: node};
  final highlighted = <String>{};
  var current = byId[focusId];
  while (current?.parentId != null) {
    final parentId = current!.parentId!;
    if (!byId.containsKey(parentId)) break;
    highlighted.add('$parentId-${current.id}');
    current = byId[parentId];
  }
  for (final node in nodes) {
    if (node.parentId == focusId) highlighted.add('$focusId-${node.id}');
  }
  return highlighted;
}

AxisSnapResult snapToParentAxis({
  required Offset childTopLeft,
  required Size cardSize,
  required Offset parentTopLeft,
  required AxisOrientation orientation,
  double threshold = 16,
}) {
  final childCenter =
      childTopLeft + Offset(cardSize.width / 2, cardSize.height / 2);
  final parentCenter =
      parentTopLeft + Offset(cardSize.width / 2, cardSize.height / 2);
  final crossDelta = orientation == AxisOrientation.horizontal
      ? childCenter.dy - parentCenter.dy
      : childCenter.dx - parentCenter.dx;
  if (crossDelta.abs() >= threshold) {
    return AxisSnapResult(
      position: childTopLeft,
      snapped: false,
      referenceLineStart: null,
      referenceLineEnd: null,
    );
  }
  final position = orientation == AxisOrientation.horizontal
      ? Offset(childTopLeft.dx, parentTopLeft.dy)
      : Offset(parentTopLeft.dx, childTopLeft.dy);
  final lineStart = orientation == AxisOrientation.horizontal
      ? Offset(parentCenter.dx, parentCenter.dy)
      : Offset(parentCenter.dx, parentCenter.dy);
  final lineEnd = orientation == AxisOrientation.horizontal
      ? Offset(childCenter.dx, parentCenter.dy)
      : Offset(parentCenter.dx, childCenter.dy);
  return AxisSnapResult(
    position: position,
    snapped: true,
    referenceLineStart: lineStart,
    referenceLineEnd: lineEnd,
  );
}
