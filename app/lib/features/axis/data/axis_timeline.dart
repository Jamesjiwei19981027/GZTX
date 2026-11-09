import 'dart:math' as math;
import 'dart:ui';

import 'axis_models.dart';
import 'axis_view_models.dart';

class AxisTimelineItem {
  const AxisTimelineItem(
      {required this.owner,
      required this.item,
      required this.along,
      required this.lane,
      required this.anchor,
      required this.rect});
  final AxisPersonNode owner;
  final AxisWorkItem item;
  final double along;
  final int lane;
  final Offset anchor;
  final Rect rect;
}

class AxisTimelineTick {
  const AxisTimelineTick(this.date, this.anchor);
  final DateTime date;
  final Offset anchor;
}

class AxisTimeline {
  const AxisTimeline(
      {required this.items,
      required this.ticks,
      required this.start,
      required this.end,
      required this.bounds});
  final List<AxisTimelineItem> items;
  final List<AxisTimelineTick> ticks;
  final Offset start;
  final Offset end;
  final Rect bounds;
}

/// 真实日期决定轴向坐标；同日或邻近日期只在垂直方向分道，锚点不挪日期。
AxisTimeline buildAxisTimeline(List<AxisPersonNode> nodes,
    {required AxisOrientation orientation, double cross = -100}) {
  final dated = <({AxisPersonNode owner, AxisWorkItem item, int day})>[];
  for (final owner in nodes) {
    for (final item in owner.workItems) {
      final due = item.dueAt;
      if (due == null) continue;
      final day =
          DateTime.utc(due.year, due.month, due.day).millisecondsSinceEpoch ~/
              Duration.millisecondsPerDay;
      dated.add((owner: owner, item: item, day: day));
    }
  }
  dated.sort((a, b) {
    final byDate = a.day.compareTo(b.day);
    if (byDate != 0) return byDate;
    final byOwner = a.owner.id.compareTo(b.owner.id);
    return byOwner != 0 ? byOwner : a.item.id.compareTo(b.item.id);
  });
  if (dated.isEmpty) {
    return const AxisTimeline(
        items: [],
        ticks: [],
        start: Offset.zero,
        end: Offset.zero,
        bounds: Rect.zero);
  }
  final min = dated.first.day, max = dated.last.day;
  final span = math.max(640, math.min(2400, dated.length * 180)).toDouble();
  final days = math.max(1, max - min);
  final scale = span / days;
  final horizontal = orientation == AxisOrientation.horizontal;
  Offset point(double along) =>
      horizontal ? Offset(along, cross) : Offset(cross, along);
  final laneEnds = <double>[];
  final items = <AxisTimelineItem>[];
  var bounds =
      Rect.fromPoints(point(80), point(160 + days * scale)).inflate(30);
  for (final entry in dated) {
    final along = 120 + (entry.day - min) * scale;
    var lane = laneEnds.indexWhere((end) => along - end >= 220);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.add(along);
    } else {
      laneEnds[lane] = along;
    }
    final rect = horizontal
        ? Rect.fromLTWH(along - 110, cross - 130 - lane * 110, 220, 88)
        : Rect.fromLTWH(cross - 250 - lane * 250, along - 44, 220, 88);
    items.add(AxisTimelineItem(
        owner: entry.owner,
        item: entry.item,
        along: along,
        lane: lane,
        anchor: point(along),
        rect: rect));
    bounds = bounds.expandToInclude(rect);
  }
  final count = math.min(6, days);
  final ticks = [
    for (var i = 0; i <= count; i++)
      AxisTimelineTick(
          DateTime.fromMillisecondsSinceEpoch(
              (min + (days * i / count).round()) * Duration.millisecondsPerDay,
              isUtc: true),
          point(120 + (days * i / count).round() * scale)),
  ];
  return AxisTimeline(
      items: items,
      ticks: ticks,
      start: point(80),
      end: point(160 + days * scale),
      bounds: bounds);
}
