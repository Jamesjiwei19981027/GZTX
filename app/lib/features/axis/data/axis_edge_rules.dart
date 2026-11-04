import 'dart:math' as math;
import 'dart:ui';

import 'axis_models.dart';
import 'axis_view_models.dart';

enum RectSide { left, right, top, bottom }

double round2(double n) => (n * 100).roundToDouble() / 100;

String _formatNum(double n) {
  final r = round2(n);
  if (r == r.roundToDouble()) {
    return r.toInt().toString();
  }
  return r
      .toStringAsFixed(2)
      .replaceAll(RegExp(r'0+$'), '')
      .replaceAll(RegExp(r'\.$'), '');
}

class BorderAnchor {
  const BorderAnchor({
    required this.x,
    required this.y,
    required this.side,
  });

  final double x;
  final double y;
  final RectSide side;

  Offset get offset => Offset(x, y);

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is BorderAnchor &&
          runtimeType == other.runtimeType &&
          x == other.x &&
          y == other.y &&
          side == other.side;

  @override
  int get hashCode => Object.hash(x, y, side);

  @override
  String toString() => 'BorderAnchor(x: $x, y: $y, side: $side)';
}

BorderAnchor borderAnchor(Rect rect, double tx, double ty) {
  final dx = tx - rect.center.dx;
  final dy = ty - rect.center.dy;
  final hw = rect.width / 2;
  final hh = rect.height / 2;
  if (dx == 0 && dy == 0) {
    return BorderAnchor(
      x: round2(rect.right),
      y: round2(rect.center.dy),
      side: RectSide.right,
    );
  }
  final scaleX = dx != 0 ? hw / dx.abs() : double.infinity;
  final scaleY = dy != 0 ? hh / dy.abs() : double.infinity;
  final t = math.min(scaleX, scaleY);
  final side = scaleX <= scaleY
      ? (dx > 0 ? RectSide.right : RectSide.left)
      : (dy > 0 ? RectSide.bottom : RectSide.top);
  return BorderAnchor(
    x: round2(rect.center.dx + dx * t),
    y: round2(rect.center.dy + dy * t),
    side: side,
  );
}

Offset controlPoint(BorderAnchor anchor, double k) {
  switch (anchor.side) {
    case RectSide.right:
      return Offset(anchor.x + k, anchor.y);
    case RectSide.left:
      return Offset(anchor.x - k, anchor.y);
    case RectSide.bottom:
      return Offset(anchor.x, anchor.y + k);
    case RectSide.top:
      return Offset(anchor.x, anchor.y - k);
  }
}

class FloatingEdgeGeometry {
  const FloatingEdgeGeometry({
    required this.from,
    required this.to,
    required this.control1,
    required this.control2,
  });

  final BorderAnchor from;
  final BorderAnchor to;
  final Offset control1;
  final Offset control2;

  Path toPath() {
    return Path()
      ..moveTo(from.x, from.y)
      ..cubicTo(
        control1.dx,
        control1.dy,
        control2.dx,
        control2.dy,
        to.x,
        to.y,
      );
  }

  String toSvgPath() {
    return 'M ${_formatNum(from.x)} ${_formatNum(from.y)} '
        'C ${_formatNum(control1.dx)} ${_formatNum(control1.dy)}, '
        '${_formatNum(control2.dx)} ${_formatNum(control2.dy)}, '
        '${_formatNum(to.x)} ${_formatNum(to.y)}';
  }
}

FloatingEdgeGeometry floatingEdgeGeometry(
  Rect source,
  Rect target, [
  BorderAnchor? sourceAnchor,
]) {
  final from = sourceAnchor ??
      borderAnchor(source, target.center.dx, target.center.dy);
  final to = borderAnchor(
    target,
    sourceAnchor?.x ?? source.center.dx,
    sourceAnchor?.y ?? source.center.dy,
  );
  final dist = math.sqrt(
    (to.x - from.x) * (to.x - from.x) + (to.y - from.y) * (to.y - from.y),
  );
  final k = round2(math.min(160.0, math.max(28.0, dist * 0.42)));
  final c1 = controlPoint(from, k);
  final c2 = controlPoint(to, k);
  return FloatingEdgeGeometry(
    from: from,
    to: to,
    control1: Offset(round2(c1.dx), round2(c1.dy)),
    control2: Offset(round2(c2.dx), round2(c2.dy)),
  );
}

String floatingEdgePath(
  Rect source,
  Rect target, [
  BorderAnchor? sourceAnchor,
]) =>
    floatingEdgeGeometry(source, target, sourceAnchor).toSvgPath();

Path floatingEdgeToPath(
  Rect source,
  Rect target, [
  BorderAnchor? sourceAnchor,
]) =>
    floatingEdgeGeometry(source, target, sourceAnchor).toPath();

class StraightEdgeGeometry {
  const StraightEdgeGeometry({
    required this.from,
    required this.to,
  });

  final BorderAnchor from;
  final BorderAnchor to;

  Path toPath() {
    return Path()
      ..moveTo(from.x, from.y)
      ..lineTo(to.x, to.y);
  }

  String toSvgPath() {
    return 'M ${_formatNum(from.x)} ${_formatNum(from.y)} L ${_formatNum(to.x)} ${_formatNum(to.y)}';
  }
}

StraightEdgeGeometry straightEdgeGeometry(Rect source, Rect target) {
  final from = borderAnchor(source, target.center.dx, target.center.dy);
  final to = borderAnchor(target, source.center.dx, source.center.dy);
  return StraightEdgeGeometry(from: from, to: to);
}

String straightEdgePath(Rect source, Rect target) =>
    straightEdgeGeometry(source, target).toSvgPath();

Path straightEdgeToPath(Rect source, Rect target) =>
    straightEdgeGeometry(source, target).toPath();

BorderAnchor subordinatePortAnchor(
  Rect source,
  List<Rect> targets,
  AxisOrientation orientation,
) {
  final double tx;
  final double ty;
  if (targets.isNotEmpty) {
    tx =
        targets.map((t) => t.center.dx).reduce((a, b) => a + b) /
        targets.length;
    ty =
        targets.map((t) => t.center.dy).reduce((a, b) => a + b) /
        targets.length;
  } else {
    tx =
        source.center.dx +
        (orientation == AxisOrientation.horizontal ? source.width : 0);
    ty =
        source.center.dy +
        (orientation == AxisOrientation.vertical ? source.height : 0);
  }
  final anchor = borderAnchor(source, tx, ty);
  final w = source.width;
  final h = source.height;
  final left = source.left;
  final right = source.right;
  final top = source.top;
  final bottom = source.bottom;
  final double distance;
  switch (anchor.side) {
    case RectSide.top:
      distance = anchor.x - left;
      break;
    case RectSide.right:
      distance = w + anchor.y - top;
      break;
    case RectSide.bottom:
      distance = w + h + right - anchor.x;
      break;
    case RectSide.left:
      distance = 2 * w + h + bottom - anchor.y;
      break;
  }
  final perimeter = 2 * (w + h);
  if (perimeter == 0) return anchor;
  final p = (distance + 32) % perimeter;
  if (p < w) return BorderAnchor(x: round2(left + p), y: top, side: RectSide.top);
  if (p < w + h) {
    return BorderAnchor(x: right, y: round2(top + p - w), side: RectSide.right);
  }
  if (p < 2 * w + h) {
    return BorderAnchor(
      x: round2(right - p + w + h),
      y: bottom,
      side: RectSide.bottom,
    );
  }
  return BorderAnchor(
    x: left,
    y: round2(bottom - p + 2 * w + h),
    side: RectSide.left,
  );
}

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

/// 计算拖放指示气泡在视口坐标系中的矩形位置。
///
/// [targetRect] 目标卡片在视口坐标系中的矩形。
/// [bubbleSize] 气泡本身的尺寸。
/// [viewportSize] 可视区域（画布视口）的尺寸。
/// [margin] 距视口边缘的保留间距，默认 8 逻辑像素。
/// [gap] 气泡与目标卡片边缘的垂直间距，默认 6 逻辑像素。
///
/// 规则：
/// 1. 默认置于目标卡片上方，水平居中对齐目标卡片。
/// 2. 上方放不下（即顶部超出视口 margin）时，放到目标卡片下方。
/// 3. 若下方也超出视口底部，则夹紧在视口内。
/// 4. 水平方向左右严格留 [margin] 逻辑像素（即 clamp 在 margin 到 viewport.width - margin - bubbleWidth 之间）。
Rect clampDropBubble({
  required Rect targetRect,
  required Size bubbleSize,
  required Size viewportSize,
  double margin = 8.0,
  double gap = 6.0,
}) {
  final idealLeft = targetRect.center.dx - bubbleSize.width / 2;
  final maxLeft = math.max(margin, viewportSize.width - margin - bubbleSize.width);
  final left = idealLeft.clamp(margin, maxLeft);

  final fitsOnTop = (targetRect.top - bubbleSize.height - gap) >= margin;
  double top;
  if (fitsOnTop) {
    top = targetRect.top - bubbleSize.height - gap;
  } else {
    top = targetRect.bottom + gap;
    final maxTop = math.max(margin, viewportSize.height - margin - bubbleSize.height);
    if (top > maxTop) {
      top = maxTop;
    }
  }
  if (top < margin) {
    top = margin;
  }

  return Rect.fromLTWH(left, top, bubbleSize.width, bubbleSize.height);
}

