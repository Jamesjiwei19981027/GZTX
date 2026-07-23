import 'dart:math' as math;
import 'dart:ui';

import '../models/models.dart';
import 'work_tree_prefs.dart';

class FlatTreeNode {
  FlatTreeNode({
    required this.node,
    required this.index,
    required this.children,
  });

  final TreeNodeItem node;
  final int index;
  /// 该人员下的事项子节点（工作项/里程碑/范围），不进主干。
  final List<TreeNodeItem> children;
}

class PlacedNode {
  PlacedNode({
    required this.node,
    required this.center,
    required this.side,
    required this.children,
    this.isOrigin = false,
  });

  final TreeNodeItem node;
  final Offset center;
  final int side; // -1 or 1
  final List<TreeNodeItem> children;
  final bool isOrigin;

  PlacedNode shifted(Offset delta) => PlacedNode(
        node: node,
        center: center + delta,
        side: side,
        children: children,
        isOrigin: isOrigin,
      );
}

class PreviewChild {
  PreviewChild({
    required this.node,
    required this.center,
    required this.overflowCount,
    this.firstHiddenChild,
    this.parentPersonId,
  });

  final TreeNodeItem node;
  final Offset center;
  final int overflowCount;
  final TreeNodeItem? firstHiddenChild;
  final int? parentPersonId;

  PreviewChild shifted(Offset delta) => PreviewChild(
        node: node,
        center: center + delta,
        overflowCount: overflowCount,
        firstHiddenChild: firstHiddenChild,
        parentPersonId: parentPersonId,
      );
}

class TimeMark {
  TimeMark({
    required this.at,
    required this.label,
    required this.nodeId,
    this.ownerPersonId,
    this.onAxis,
  });

  final DateTime at;
  final String label;
  final int nodeId;
  final int? ownerPersonId;
  /// 映射到画布坐标（全局尺上的点）
  final Offset? onAxis;

  TimeMark copyWith({Offset? onAxis}) => TimeMark(
        at: at,
        label: label,
        nodeId: nodeId,
        ownerPersonId: ownerPersonId,
        onAxis: onAxis ?? this.onAxis,
      );
}

class WorkTreeLayoutResult {
  WorkTreeLayoutResult({
    required this.placed,
    required this.axisStart,
    required this.axisEnd,
    required this.contentBounds,
    required this.previews,
    required this.focusNodeId,
    this.originNodeId,
    this.rangeStart,
    this.rangeEnd,
    this.globalMarks = const [],
    this.rulerStart,
    this.rulerEnd,
  });

  final List<PlacedNode> placed;
  final Offset axisStart;
  final Offset axisEnd;
  final Rect contentBounds;
  final List<PreviewChild> previews;
  final int? focusNodeId;
  final int? originNodeId;
  final DateTime? rangeStart;
  final DateTime? rangeEnd;
  final List<TimeMark> globalMarks;
  final Offset? rulerStart;
  final Offset? rulerEnd;

  PlacedNode? byId(int id) {
    for (final p in placed) {
      if (p.node.id == id) return p;
    }
    return null;
  }

  bool containsNode(int id) {
    if (byId(id) != null) return true;
    for (final p in previews) {
      if (p.node.id == id) return true;
    }
    return false;
  }
}

class WorkTreeLayout {
  static const Size cardSize = Size(196, 92);
  static const Size previewSize = Size(148, 52);
  static const double axisStep = 180; // 无日期时的最小站距
  static const double minStationGap = 168;
  static const double pxPerDay = 36;
  static const int minRangeDays = 28;
  static const double sideGap = 132;
  static const double previewGap = 58;
  static const int previewLimit = 6;
  static const double padding = 300;
  static const double boundsPad = 100;
  static const double rulerOffset = 56;

  static bool hasLeaderOnSpine(List<TreeNodeItem> roots, int? ownerUserId) {
    if (ownerUserId == null) return false;
    bool walk(TreeNodeItem n) {
      if (n.isPerson && n.isAssignedTo(ownerUserId)) return true;
      for (final c in n.children) {
        if (walk(c)) return true;
      }
      return false;
    }

    return roots.any(walk);
  }

  /// 仅人员走主干：深度优先；事项挂在各自父人员下。
  static List<FlatTreeNode> flattenPersons(
    List<TreeNodeItem> roots,
    WorkTreeSort sort, {
    int? finalOwnerUserId,
  }) {
    final orderedRoots = List<TreeNodeItem>.from(roots);
    // 根排序：负责人根放最后，便于 DFS 时落在末端附近
    if (finalOwnerUserId != null) {
      orderedRoots.sort((a, b) {
        final ao = a.isPerson && a.isAssignedTo(finalOwnerUserId) ? 1 : 0;
        final bo = b.isPerson && b.isAssignedTo(finalOwnerUserId) ? 1 : 0;
        if (ao != bo) return ao.compareTo(bo);
        return a.id.compareTo(b.id);
      });
    }

    final persons = <TreeNodeItem>[];
    final mattersOf = <int, List<TreeNodeItem>>{};

    void walk(TreeNodeItem n) {
      if (n.isPerson) {
        persons.add(n);
        final matters = <TreeNodeItem>[];
        for (final c in n.children) {
          if (c.isPerson) {
            walk(c);
          } else {
            matters.add(c);
          }
        }
        mattersOf[n.id] = matters;
      } else {
        // 非人员根（遗留）：暂不进主干，其人员子孙仍收集
        for (final c in n.children) {
          walk(c);
        }
      }
    }

    for (final r in orderedRoots) {
      walk(r);
    }

    // 终点：最终负责人排到主干末端（独一无二）
    if (finalOwnerUserId != null && persons.length > 1) {
      final idx = persons.indexWhere((p) => p.isAssignedTo(finalOwnerUserId));
      if (idx >= 0 && idx != persons.length - 1) {
        final owner = persons.removeAt(idx);
        persons.add(owner);
      }
    }

    List<TreeNodeItem> ordered;
    if (sort == WorkTreeSort.time) {
      ordered = List<TreeNodeItem>.from(persons)
        ..sort((a, b) {
          final ta = a.eventTime;
          final tb = b.eventTime;
          if (ta == null && tb == null) return a.id.compareTo(b.id);
          if (ta == null) return 1;
          if (tb == null) return -1;
          return ta.compareTo(tb);
        });
      // 时间排序后仍把负责人钉在终点
      if (finalOwnerUserId != null) {
        final idx = ordered.indexWhere((p) => p.isAssignedTo(finalOwnerUserId));
        if (idx >= 0 && idx != ordered.length - 1) {
          final o = ordered.removeAt(idx);
          ordered.add(o);
        }
      }
    } else {
      ordered = persons;
    }

    return [
      for (var i = 0; i < ordered.length; i++)
        FlatTreeNode(
          node: ordered[i],
          index: i,
          children: mattersOf[ordered[i].id] ?? const [],
        ),
    ];
  }

  static int? resolveFocusId({
    required List<FlatTreeNode> flat,
    required int? userId,
    required int? lastNodeId,
  }) {
    if (flat.isEmpty) return null;
    final mine = flat.where((f) => f.node.isAssignedTo(userId)).toList();
    if (mine.isNotEmpty) {
      return mine.first.node.id;
    }
    if (lastNodeId != null && flat.any((f) => f.node.id == lastNodeId)) {
      return lastNodeId;
    }
    return flat.first.node.id;
  }

  static DateTime? _parse(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    return DateTime.tryParse(raw);
  }

  static DateTime? nodeEventTime(TreeNodeItem n) {
    for (final raw in [n.milestoneAt, n.dueAt, n.startAt]) {
      final t = _parse(raw);
      if (t != null) return t;
    }
    return null;
  }

  static DateTime? personAnchorTime(TreeNodeItem person, List<TreeNodeItem> matters) {
    DateTime? best;
    void consider(DateTime? t) {
      if (t == null) return;
      if (best == null || t.isBefore(best!)) best = t;
    }

    consider(nodeEventTime(person));
    for (final m in matters) {
      consider(nodeEventTime(m));
    }
    return best;
  }

  /// 将时间映射到轴上距离，并强制最小站距（过近则整体拉长）。
  static List<double> _stationOffsets({
    required List<DateTime?> times,
    required DateTime rangeStart,
    required DateTime rangeEnd,
  }) {
    final n = times.length;
    if (n == 0) return const [];
    if (n == 1) return const [0];

    final spanMs = math.max(
      1,
      rangeEnd.millisecondsSinceEpoch - rangeStart.millisecondsSinceEpoch,
    );
    final daySpan = math.max(
      minRangeDays,
      rangeEnd.difference(rangeStart).inDays.abs(),
    );
    final axisLen = math.max(
      (n - 1) * minStationGap,
      daySpan * pxPerDay,
    );

    final offsets = List<double>.generate(n, (i) {
      final t = times[i];
      if (t == null) return i / (n - 1) * axisLen;
      final u = ((t.millisecondsSinceEpoch - rangeStart.millisecondsSinceEpoch) /
              spanMs)
          .clamp(0.0, 1.0);
      return u * axisLen;
    });

    for (var i = 1; i < n; i++) {
      if (offsets[i] < offsets[i - 1] + minStationGap) {
        offsets[i] = offsets[i - 1] + minStationGap;
      }
    }
    return offsets;
  }

  static WorkTreeLayoutResult layout({
    required List<TreeNodeItem> roots,
    required WorkTreeAxis axis,
    required WorkTreeSort sort,
    required int? userId,
    required int? lastNodeId,
    required int? expandedNodeId,
    int visibleLevels = 3,
    int? finalOwnerUserId,
    DateTime? projectStart,
    DateTime? projectEnd,
    double leaderAlongDelta = 0,
  }) {
    final flatAll = flattenPersons(
      roots,
      sort,
      finalOwnerUserId: finalOwnerUserId,
    );
    final focusId = resolveFocusId(
      flat: flatAll,
      userId: userId,
      lastNodeId: lastNodeId,
    );

    final maxDepth = (visibleLevels - 1).clamp(0, 64);
    final flat = [
      for (final f in flatAll)
        if (f.node.depth <= maxDepth) f,
    ];
    final reindexed = [
      for (var i = 0; i < flat.length; i++)
        FlatTreeNode(node: flat[i].node, index: i, children: flat[i].children),
    ];

    if (reindexed.isEmpty) {
      return WorkTreeLayoutResult(
        placed: const [],
        axisStart: Offset.zero,
        axisEnd: const Offset(400, 0),
        contentBounds: const Rect.fromLTWH(0, 0, 400, 400),
        previews: const [],
        focusNodeId: null,
      );
    }

    // —— 先收集时间，决定轴长与站位 ——
    final rawMarks = <TimeMark>[];
    void collect(TreeNodeItem n, int? ownerPersonId) {
      final owner = n.isPerson ? n.id : ownerPersonId;
      if (n.nodeTypeKey == 'milestone' ||
          n.dueAt != null ||
          n.milestoneAt != null) {
        final at = nodeEventTime(n);
        if (at != null) {
          rawMarks.add(
            TimeMark(
              at: at,
              label: n.title,
              nodeId: n.id,
              ownerPersonId: owner,
            ),
          );
        }
      }
      for (final c in n.children) {
        collect(c, owner);
      }
    }

    for (final r in roots) {
      collect(r, r.isPerson ? r.id : null);
    }

    final personTimes = [
      for (final f in reindexed) personAnchorTime(f.node, f.children),
    ];

    DateTime? rangeStart = projectStart;
    DateTime? rangeEnd = projectEnd;
    void expandRange(DateTime? t) {
      if (t == null) return;
      rangeStart =
          rangeStart == null ? t : (t.isBefore(rangeStart!) ? t : rangeStart);
      rangeEnd = rangeEnd == null ? t : (t.isAfter(rangeEnd!) ? t : rangeEnd);
    }

    for (final m in rawMarks) {
      expandRange(m.at);
    }
    for (final t in personTimes) {
      expandRange(t);
    }

    if (rangeStart != null && rangeEnd != null) {
      if (!rangeEnd!.isAfter(rangeStart!)) {
        rangeEnd = rangeStart!.add(const Duration(days: minRangeDays));
      }
      final spanDays = rangeEnd!.difference(rangeStart!).inDays.abs();
      if (spanDays < minRangeDays) {
        final extra = Duration(days: ((minRangeDays - spanDays) / 2).ceil());
        rangeStart = rangeStart!.subtract(extra);
        rangeEnd = rangeEnd!.add(extra);
      } else {
        final pad = Duration(days: math.max(3, spanDays ~/ 8));
        rangeStart = rangeStart!.subtract(pad);
        rangeEnd = rangeEnd!.add(pad);
      }
    }

    final List<double> baseOffsets;
    if (rangeStart != null && rangeEnd != null) {
      baseOffsets = _stationOffsets(
        times: personTimes,
        rangeStart: rangeStart!,
        rangeEnd: rangeEnd!,
      );
    } else {
      baseOffsets = [
        for (var i = 0; i < reindexed.length; i++) i * axisStep,
      ];
    }

    int? leaderId;
    var leaderIndex = -1;
    if (finalOwnerUserId != null) {
      for (var i = 0; i < reindexed.length; i++) {
        if (reindexed[i].node.isAssignedTo(finalOwnerUserId)) {
          leaderId = reindexed[i].node.id;
          leaderIndex = i;
          break;
        }
      }
    }
    // 无明确 PM 指派时，不把「第一个人」误标成负责人终点
    final hasExplicitLeader = leaderId != null;

    // 负责人钉在轴终点：比其余站更靠后一截
    final offsets = List<double>.from(baseOffsets);
    if (hasExplicitLeader && leaderIndex >= 0) {
      double maxOther = 0;
      for (var i = 0; i < offsets.length; i++) {
        if (i == leaderIndex) continue;
        if (offsets[i] > maxOther) maxOther = offsets[i];
      }
      offsets[leaderIndex] =
          maxOther + minStationGap * 1.65 + (leaderAlongDelta < 0 ? 0 : leaderAlongDelta);
    }

    final axisLen = offsets.isEmpty ? axisStep : offsets.reduce(math.max);

    var placed = <PlacedNode>[];
    for (var i = 0; i < reindexed.length; i++) {
      final f = reindexed[i];
      final isLeader = hasExplicitLeader && f.node.id == leaderId;
      final along = offsets[i];
      late final Offset center;
      if (isLeader) {
        // 终点：直接坐在轴上，不当侧向站点
        center = axis == WorkTreeAxis.vertical
            ? Offset(padding, padding + along)
            : Offset(padding + along, padding);
      } else {
        final side = i.isEven ? -1 : 1;
        if (axis == WorkTreeAxis.vertical) {
          center = Offset(
            padding + (side < 0 ? -sideGap : sideGap),
            padding + along,
          );
        } else {
          center = Offset(
            padding + along,
            padding + (side < 0 ? -sideGap : sideGap),
          );
        }
      }
      placed.add(
        PlacedNode(
          node: f.node,
          center: center,
          side: isLeader ? 0 : (i.isEven ? -1 : 1),
          children: f.children,
          isOrigin: isLeader,
        ),
      );
    }

    PlacedNode? leaderPlaced;
    for (final p in placed) {
      if (p.isOrigin) {
        leaderPlaced = p;
        break;
      }
    }

    var axisStart = axis == WorkTreeAxis.vertical
        ? Offset(padding, padding - minStationGap * 0.45)
        : Offset(padding - minStationGap * 0.45, padding);
    // 轴终点收束到负责人中心（或内容末端）
    var axisEnd = leaderPlaced != null
        ? (axis == WorkTreeAxis.vertical
            ? Offset(padding, leaderPlaced.center.dy)
            : Offset(leaderPlaced.center.dx, padding))
        : (axis == WorkTreeAxis.vertical
            ? Offset(padding, padding + axisLen + minStationGap * 0.45)
            : Offset(padding + axisLen + minStationGap * 0.45, padding));

    // 侧挂事项
    var previews = <PreviewChild>[];
    for (final parent in placed) {
      final kids = parent.children;
      if (kids.isEmpty) continue;
      final showAll = expandedNodeId == parent.node.id;
      final visible =
          showAll ? kids.take(previewLimit).toList() : kids.take(3).toList();
      final overflow = math.max(0, kids.length - visible.length);
      final firstHidden = overflow > 0 ? kids[visible.length] : null;
      for (var i = 0; i < visible.length; i++) {
        late final Offset c;
        final outward = parent.side == 0
            ? 1.0
            : (parent.side < 0 ? -1.0 : 1.0);
        if (axis == WorkTreeAxis.vertical) {
          c = Offset(
            parent.center.dx +
                outward * (sideGap + 20 + previewSize.width / 2),
            parent.center.dy + (i - (visible.length - 1) / 2) * previewGap,
          );
        } else {
          c = Offset(
            parent.center.dx +
                (i - (visible.length - 1) / 2) * (previewSize.width + 10),
            parent.center.dy +
                outward * (sideGap + 16 + previewSize.height / 2),
          );
        }
        previews.add(
          PreviewChild(
            node: visible[i],
            center: c,
            overflowCount: (i == visible.length - 1) ? overflow : 0,
            firstHiddenChild: (i == visible.length - 1) ? firstHidden : null,
            parentPersonId: parent.node.id,
          ),
        );
      }
    }

    // 时间刻度直接落在主干上（不再旁挂尺）
    var globalMarks = <TimeMark>[];
    if (rangeStart != null && rangeEnd != null && rawMarks.isNotEmpty) {
      final spanMs = math.max(
        1,
        rangeEnd!.millisecondsSinceEpoch - rangeStart!.millisecondsSinceEpoch,
      );
      final drawLen = axis == WorkTreeAxis.vertical
          ? (axisEnd.dy - axisStart.dy)
          : (axisEnd.dx - axisStart.dx);
      for (final m in rawMarks) {
        final u = ((m.at.millisecondsSinceEpoch -
                    rangeStart!.millisecondsSinceEpoch) /
                spanMs)
            .clamp(0.0, 1.0);
        final onAxis = axis == WorkTreeAxis.vertical
            ? Offset(axisStart.dx, axisStart.dy + drawLen * u)
            : Offset(axisStart.dx + drawLen * u, axisStart.dy);
        globalMarks.add(m.copyWith(onAxis: onAxis));
      }
    }

    var minX = axisStart.dx;
    var minY = axisStart.dy;
    var maxX = axisEnd.dx;
    var maxY = axisEnd.dy;
    void expand(Offset c, Size s) {
      minX = math.min(minX, c.dx - s.width / 2);
      maxX = math.max(maxX, c.dx + s.width / 2);
      minY = math.min(minY, c.dy - s.height / 2);
      maxY = math.max(maxY, c.dy + s.height / 2);
    }

    for (final p in placed) {
      expand(p.center, cardSize);
    }
    for (final p in previews) {
      expand(p.center, previewSize);
    }
    for (final m in globalMarks) {
      if (m.onAxis != null) expand(m.onAxis!, const Size(56, 36));
    }

    final raw = Rect.fromLTRB(
      minX - boundsPad,
      minY - boundsPad,
      maxX + boundsPad,
      maxY + boundsPad,
    );
    final shift = Offset(-raw.left, -raw.top);
    placed = [for (final p in placed) p.shifted(shift)];
    previews = [for (final p in previews) p.shifted(shift)];
    axisStart += shift;
    axisEnd += shift;
    globalMarks = [
      for (final m in globalMarks)
        m.copyWith(onAxis: m.onAxis == null ? null : m.onAxis! + shift),
    ];

    return WorkTreeLayoutResult(
      placed: placed,
      axisStart: axisStart,
      axisEnd: axisEnd,
      contentBounds: Rect.fromLTWH(0, 0, raw.width, raw.height),
      previews: previews,
      focusNodeId: focusId,
      originNodeId: leaderId,
      rangeStart: rangeStart,
      rangeEnd: rangeEnd,
      globalMarks: globalMarks,
      rulerStart: null,
      rulerEnd: null,
    );
  }
}
