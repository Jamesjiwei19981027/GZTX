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
  final List<TreeNodeItem> children;
}

class PlacedNode {
  PlacedNode({
    required this.node,
    required this.center,
    required this.side,
    required this.children,
  });

  final TreeNodeItem node;
  final Offset center;
  final int side; // -1 or 1
  final List<TreeNodeItem> children;

  PlacedNode shifted(Offset delta) => PlacedNode(
        node: node,
        center: center + delta,
        side: side,
        children: children,
      );
}

class PreviewChild {
  PreviewChild({
    required this.node,
    required this.center,
    required this.overflowCount,
    this.firstHiddenChild,
  });

  final TreeNodeItem node;
  final Offset center;
  final int overflowCount;
  /// When overflowCount > 0, jump target on the main axis.
  final TreeNodeItem? firstHiddenChild;

  PreviewChild shifted(Offset delta) => PreviewChild(
        node: node,
        center: center + delta,
        overflowCount: overflowCount,
        firstHiddenChild: firstHiddenChild,
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
  });

  final List<PlacedNode> placed;
  final Offset axisStart;
  final Offset axisEnd;
  /// Always origin-based: left/top ≈ 0 so canvas SizedBox can use width/height directly.
  final Rect contentBounds;
  final List<PreviewChild> previews;
  final int? focusNodeId;

  PlacedNode? byId(int id) {
    for (final p in placed) {
      if (p.node.id == id) return p;
    }
    return null;
  }

  bool containsNode(int id) => byId(id) != null;
}

class WorkTreeLayout {
  static const Size cardSize = Size(168, 76);
  static const Size previewSize = Size(140, 56);
  static const double axisStep = 112;
  static const double sideGap = 132;
  static const double previewGap = 64;
  static const int previewLimit = 8;
  static const double padding = 280;
  static const double boundsPad = 80;

  static List<FlatTreeNode> flatten(
    List<TreeNodeItem> roots,
    WorkTreeSort sort,
  ) {
    final byId = <int, TreeNodeItem>{};
    final childMap = <int, List<TreeNodeItem>>{};

    void walk(TreeNodeItem n) {
      byId[n.id] = n;
      childMap[n.id] = List<TreeNodeItem>.from(n.children);
      for (final c in n.children) {
        walk(c);
      }
    }

    for (final r in roots) {
      walk(r);
    }

    final List<TreeNodeItem> ordered;
    if (sort == WorkTreeSort.tree) {
      ordered = [];
      void dfs(TreeNodeItem n) {
        ordered.add(n);
        for (final c in n.children) {
          dfs(c);
        }
      }

      for (final r in roots) {
        dfs(r);
      }
    } else {
      ordered = byId.values.toList()
        ..sort((a, b) {
          final ta = a.sortTime;
          final tb = b.sortTime;
          if (ta == null && tb == null) return a.id.compareTo(b.id);
          if (ta == null) return 1;
          if (tb == null) return -1;
          final cmp = ta.compareTo(tb);
          return cmp != 0 ? cmp : a.id.compareTo(b.id);
        });
    }

    return [
      for (var i = 0; i < ordered.length; i++)
        FlatTreeNode(
          node: ordered[i],
          index: i,
          children: childMap[ordered[i].id] ?? const [],
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
      mine.sort((a, b) {
        final aOpen = a.node.isDone ? 1 : 0;
        final bOpen = b.node.isDone ? 1 : 0;
        if (aOpen != bOpen) return aOpen.compareTo(bOpen);
        final ta = a.node.sortTime;
        final tb = b.node.sortTime;
        if (ta == null && tb == null) return b.node.id.compareTo(a.node.id);
        if (ta == null) return 1;
        if (tb == null) return -1;
        return tb.compareTo(ta);
      });
      return mine.first.node.id;
    }
    if (lastNodeId != null && flat.any((f) => f.node.id == lastNodeId)) {
      return lastNodeId;
    }
    return flat.first.node.id;
  }

  static WorkTreeLayoutResult layout({
    required List<TreeNodeItem> roots,
    required WorkTreeAxis axis,
    required WorkTreeSort sort,
    required int? userId,
    required int? lastNodeId,
    required int? expandedNodeId,
  }) {
    final flat = flatten(roots, sort);
    final focusId = resolveFocusId(
      flat: flat,
      userId: userId,
      lastNodeId: lastNodeId,
    );

    if (flat.isEmpty) {
      return WorkTreeLayoutResult(
        placed: const [],
        axisStart: Offset.zero,
        axisEnd: const Offset(0, 400),
        contentBounds: const Rect.fromLTWH(0, 0, 400, 400),
        previews: const [],
        focusNodeId: null,
      );
    }

    var placed = <PlacedNode>[];
    for (final f in flat) {
      final side = f.index.isEven ? -1 : 1;
      late final Offset center;
      if (axis == WorkTreeAxis.vertical) {
        center = Offset(
          padding + (side < 0 ? -sideGap : sideGap),
          padding + f.index * axisStep,
        );
      } else {
        center = Offset(
          padding + f.index * axisStep,
          padding + (side < 0 ? -sideGap : sideGap),
        );
      }
      placed.add(
        PlacedNode(
          node: f.node,
          center: center,
          side: side,
          children: f.children,
        ),
      );
    }

    final first = placed.first.center;
    final last = placed.last.center;
    var axisStart = axis == WorkTreeAxis.vertical
        ? Offset(padding, first.dy - axisStep * 0.4)
        : Offset(first.dx - axisStep * 0.4, padding);
    var axisEnd = axis == WorkTreeAxis.vertical
        ? Offset(padding, last.dy + axisStep * 0.4)
        : Offset(last.dx + axisStep * 0.4, padding);

    var previews = <PreviewChild>[];
    if (expandedNodeId != null) {
      PlacedNode? parent;
      for (final p in placed) {
        if (p.node.id == expandedNodeId) {
          parent = p;
          break;
        }
      }
      if (parent != null && parent.children.isNotEmpty) {
        final kids = parent.children;
        final visible = kids.take(previewLimit).toList();
        final overflow = math.max(0, kids.length - visible.length);
        final firstHidden = overflow > 0 ? kids[previewLimit] : null;
        for (var i = 0; i < visible.length; i++) {
          late final Offset c;
          if (axis == WorkTreeAxis.vertical) {
            final outward = parent.side < 0 ? -1.0 : 1.0;
            c = Offset(
              parent.center.dx +
                  outward * (sideGap + 24 + previewSize.width / 2),
              parent.center.dy + (i - (visible.length - 1) / 2) * previewGap,
            );
          } else {
            final outward = parent.side < 0 ? -1.0 : 1.0;
            c = Offset(
              parent.center.dx +
                  (i - (visible.length - 1) / 2) * (previewSize.width + 12),
              parent.center.dy +
                  outward * (sideGap + 20 + previewSize.height / 2),
            );
          }
          previews.add(
            PreviewChild(
              node: visible[i],
              center: c,
              overflowCount: (i == visible.length - 1) ? overflow : 0,
              firstHiddenChild:
                  (i == visible.length - 1) ? firstHidden : null,
            ),
          );
        }
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

    // Normalize so content lives in [0, width] x [0, height] — avoids clipping.
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

    return WorkTreeLayoutResult(
      placed: placed,
      axisStart: axisStart,
      axisEnd: axisEnd,
      contentBounds: Rect.fromLTWH(0, 0, raw.width, raw.height),
      previews: previews,
      focusNodeId: focusId,
    );
  }
}
