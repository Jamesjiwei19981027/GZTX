import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../design/design.dart';
import '../models/knowledge_models.dart';

/// 关联图节点
class KnowledgeGraphNode {
  const KnowledgeGraphNode({
    required this.id,
    required this.title,
    this.subtitle = '',
    this.badge = '',
    required this.position,
    this.tappable = true,
  });

  final String id;
  final String title;
  final String subtitle;
  final String badge;
  final KnowledgePoint position;
  final bool tappable;
}

/// 关联图连线
class KnowledgeGraphEdge {
  const KnowledgeGraphEdge({
    required this.fromId,
    required this.toId,
    this.label = '',
  });

  final String fromId;
  final String toId;
  final String label;
}

/// 按网页版规则为条目排布坐标：优先用保存的位置，其余按 3 列网格填充空位
Map<int, KnowledgePoint> resolvePersonalPositions(
  List<PersonalKnowledgeEntry> entries, {
  int columns = 3,
  double cellWidth = 280,
  double cellHeight = 180,
}) {
  final columnCount = columns < 1 ? 1 : columns;
  final positions = <int, KnowledgePoint>{};
  final occupied = <KnowledgePoint>[];
  for (final entry in entries) {
    final position = entry.position;
    if (position != null) {
      positions[entry.id] = position;
      occupied.add(position);
    }
  }
  var cell = 0;
  for (final entry in entries) {
    if (positions.containsKey(entry.id)) continue;
    KnowledgePoint candidate;
    do {
      candidate = KnowledgePoint(
        (cell % columnCount) * cellWidth,
        (cell ~/ columnCount) * cellHeight,
      );
      cell++;
    } while (occupied.any((other) =>
        (other.x - candidate.x).abs() < 240 &&
        (other.y - candidate.y).abs() < 150));
    positions[entry.id] = candidate;
    occupied.add(candidate);
  }
  return positions;
}

/// 简单可读的关联图：节点 + 连线，可点开节点，也可拖动节点后保存位置。
///
/// 不引入第三方图形库，避免新增依赖；交互保持在“看懂关系”这一层。
class KnowledgeGraph extends StatefulWidget {
  const KnowledgeGraph({
    super.key,
    required this.nodes,
    this.edges = const [],
    this.onTapNode,
    this.onMoveNode,
    this.height = 360,
    this.hint = '拖动空白处移动画面，点开节点看内容',
  });

  final List<KnowledgeGraphNode> nodes;
  final List<KnowledgeGraphEdge> edges;
  final ValueChanged<KnowledgeGraphNode>? onTapNode;
  final void Function(KnowledgeGraphNode node, KnowledgePoint position)?
      onMoveNode;
  final double height;
  final String hint;

  @override
  State<KnowledgeGraph> createState() => _KnowledgeGraphState();
}

class _KnowledgeGraphState extends State<KnowledgeGraph> {
  static const double _nodeWidth = 140;
  static const double _baseNodeHeight = 78;
  static const double _padding = 16;

  /// 系统字号放大时同步加高节点，避免文字被裁掉
  double _nodeHeightFor(BuildContext context) {
    final scale = MediaQuery.textScalerOf(context).scale(1).clamp(1.0, 2.5);
    final height = _baseNodeHeight * (1 + (scale - 1) * 0.62);
    return height.clamp(_baseNodeHeight, 140.0);
  }

  final Map<String, Offset> _dragging = {};
  Offset _pan = Offset.zero;
  String? _activeNodeId;

  Offset _positionOf(KnowledgeGraphNode node) {
    final override = _dragging[node.id];
    if (override != null) return override;
    return Offset(node.position.x, node.position.y);
  }

  /// 用原始指针事件实现节点拖动：浮在画布上的节点优先拿到手势，
  /// 避免与画布平移抢同一个拖动识别器。
  Widget _draggableNode(KnowledgeGraphNode node, VoidCallback? onTap) {
    final card = _GraphNodeCard(node: node, onTap: onTap);
    if (widget.onMoveNode == null) return card;
    return Listener(
      onPointerDown: (_) => setState(() => _activeNodeId = node.id),
      onPointerMove: (event) => setState(() {
        final current =
            _dragging[node.id] ?? Offset(node.position.x, node.position.y);
        _dragging[node.id] = current + event.delta;
      }),
      onPointerUp: (_) {
        final moved = _dragging[node.id];
        setState(() => _activeNodeId = null);
        if (moved == null) return;
        widget.onMoveNode!(node, KnowledgePoint(moved.dx, moved.dy));
      },
      onPointerCancel: (_) => setState(() => _activeNodeId = null),
      child: card,
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final nodeHeight = _nodeHeightFor(context);
    final positions = <String, Offset>{
      for (final node in widget.nodes) node.id: _positionOf(node),
    };
    final contentWidth = positions.values.fold<double>(
            0, (max, offset) => offset.dx > max ? offset.dx : max) +
        _nodeWidth +
        _padding * 2;
    final contentHeight = positions.values.fold<double>(
            0, (max, offset) => offset.dy > max ? offset.dy : max) +
        nodeHeight +
        _padding * 2;

    return LayoutBuilder(builder: (context, constraints) {
      // 画布高度不超过可用空间，避免窄屏、横屏或放大字号时把提示文字挤出屏幕
      final hintHeight =
          MediaQuery.textScalerOf(context).scale(12) * 1.5 + AppSpacing.sm + 4;
      final available = constraints.maxHeight.isFinite
          ? constraints.maxHeight - hintHeight
          : widget.height;
      final canvasHeight = widget.height > available
          ? available.clamp(0.0, widget.height)
          : widget.height;
      final width = contentWidth < constraints.maxWidth
          ? constraints.maxWidth
          : contentWidth;
      final height =
          contentHeight < canvasHeight ? canvasHeight : contentHeight;
      return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: canvasHeight,
            decoration: BoxDecoration(
              color: isDark
                  ? AppColors.darkSurfaceVariant
                  : const Color(0xFFF7F8FA),
              borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
              border: Border.all(
                color: isDark ? AppColors.darkBorder : AppColors.border,
              ),
            ),
            clipBehavior: Clip.antiAlias,
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onPanUpdate: (details) {
                // 正在拖动节点时，画面不跟着平移，避免节点和画布同时移动
                if (_activeNodeId != null) return;
                setState(() {
                  _pan += details.delta;
                });
              },
              child: Stack(
                children: [
                  Positioned.fill(
                    child: Transform.translate(
                      offset: _pan,
                      child: SizedBox(
                        width: width,
                        height: height,
                        child: Stack(
                          children: [
                            Positioned.fill(
                              child: CustomPaint(
                                painter: _EdgePainter(
                                  edges: widget.edges,
                                  positions: positions,
                                  nodeWidth: _nodeWidth,
                                  nodeHeight: nodeHeight,
                                  lineColor: isDark
                                      ? AppColors.darkTextTertiary
                                      : AppColors.textTertiary,
                                  labelColor: isDark
                                      ? AppColors.darkTextSecondary
                                      : AppColors.textSecondary,
                                  labelBackground: isDark
                                      ? AppColors.darkSurface
                                      : Colors.white,
                                ),
                              ),
                            ),
                            for (final node in widget.nodes)
                              Positioned(
                                left: positions[node.id]!.dx + _padding,
                                top: positions[node.id]!.dy + _padding,
                                width: _nodeWidth,
                                height: nodeHeight,
                                child: _draggableNode(
                                  node,
                                  widget.onTapNode == null || !node.tappable
                                      ? null
                                      : () => widget.onTapNode!(node),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            widget.hint,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 12,
              color:
                  isDark ? AppColors.darkTextTertiary : AppColors.textTertiary,
            ),
          ),
        ],
      );
    });
  }
}

class _GraphNodeCard extends StatelessWidget {
  const _GraphNodeCard({required this.node, this.onTap});

  final KnowledgeGraphNode node;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = isDarkMode(context);
    final card = Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: isDark ? AppColors.darkSurface : Colors.white,
        borderRadius: BorderRadius.circular(AppSpacing.radiusMd),
        border: Border.all(
          color: isDark ? AppColors.darkBorder : AppColors.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            node.title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 2),
          Flexible(
            child: Text(
              node.subtitle,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11,
                color: isDark
                    ? AppColors.darkTextSecondary
                    : AppColors.textSecondary,
              ),
            ),
          ),
          if (node.badge.isNotEmpty)
            Text(
              node.badge,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 10, color: AppColors.primary),
            ),
        ],
      ),
    );

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: card,
    );
  }
}

class _EdgePainter extends CustomPainter {
  _EdgePainter({
    required this.edges,
    required this.positions,
    required this.nodeWidth,
    required this.nodeHeight,
    required this.lineColor,
    required this.labelColor,
    required this.labelBackground,
  });

  final List<KnowledgeGraphEdge> edges;
  final Map<String, Offset> positions;
  final double nodeWidth;
  final double nodeHeight;
  final Color lineColor;
  final Color labelColor;
  final Color labelBackground;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = lineColor
      ..strokeWidth = 1.6
      ..style = PaintingStyle.stroke;
    for (final edge in edges) {
      final from = positions[edge.fromId];
      final to = positions[edge.toId];
      if (from == null || to == null) continue;
      final start = Offset(from.dx + nodeWidth, from.dy + nodeHeight / 2);
      final end = Offset(to.dx, to.dy + nodeHeight / 2);
      final middle = Offset((start.dx + end.dx) / 2, (start.dy + end.dy) / 2);
      final path = Path()
        ..moveTo(start.dx, start.dy)
        ..cubicTo(middle.dx, start.dy, middle.dx, end.dy, end.dx, end.dy);
      canvas.drawPath(path, paint);

      // 箭头
      final angle = (end - Offset(middle.dx, end.dy)).direction;
      const arrowSize = 6.0;
      final arrow = Path()
        ..moveTo(end.dx, end.dy)
        ..lineTo(
          end.dx - arrowSize * 1.6 * _cos(angle - 0.4),
          end.dy - arrowSize * 1.6 * _sin(angle - 0.4),
        )
        ..lineTo(
          end.dx - arrowSize * 1.6 * _cos(angle + 0.4),
          end.dy - arrowSize * 1.6 * _sin(angle + 0.4),
        )
        ..close();
      canvas.drawPath(arrow, Paint()..color = lineColor);

      if (edge.label.trim().isEmpty) continue;
      final painter = TextPainter(
        text: TextSpan(
          text: edge.label,
          style: TextStyle(fontSize: 10, color: labelColor),
        ),
        textDirection: TextDirection.ltr,
        maxLines: 1,
        ellipsis: '…',
      )..layout(maxWidth: 96);
      final labelOffset = Offset(
        middle.dx - painter.width / 2,
        middle.dy - painter.height - 2,
      );
      final background = Paint()
        ..color = labelBackground.withValues(alpha: 0.9);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromLTWH(
            labelOffset.dx - 3,
            labelOffset.dy - 1,
            painter.width + 6,
            painter.height + 2,
          ),
          const Radius.circular(3),
        ),
        background,
      );
      painter.paint(canvas, labelOffset);
    }
  }

  double _cos(double value) => math.cos(value);

  double _sin(double value) => math.sin(value);

  @override
  bool shouldRepaint(covariant _EdgePainter oldDelegate) {
    return oldDelegate.edges != edges ||
        oldDelegate.positions != positions ||
        oldDelegate.lineColor != lineColor ||
        oldDelegate.labelBackground != labelBackground;
  }
}
